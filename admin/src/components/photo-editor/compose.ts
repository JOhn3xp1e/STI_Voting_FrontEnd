/* Canvas helpers for the photo editor: framing (crop/zoom/pan/rotate/flip), edge softening and recolouring. */

export type Rotation = 0 | 90 | 180 | 270;

/** How the photo sits in the crop frame. Offsets are fractions of the frame's width / height. */
export interface View {
  zoom: number;
  offsetX: number;
  offsetY: number;
  rotation: Rotation;
  flipped: boolean;
}

export const DEFAULT_VIEW: View = { zoom: 1, offsetX: 0, offsetY: 0, rotation: 0, flipped: false };
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

export type AspectId = "1:1" | "4:5" | "3:4" | "free";

export const ASPECTS: { id: AspectId; label: string; ratio: number | null }[] = [
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "4:5", label: "4:5", ratio: 4 / 5 },
  { id: "3:4", label: "3:4", ratio: 3 / 4 },
  { id: "free", label: "Free", ratio: null },
];

/** Width of the saved photo; the height follows the crop ratio (4:5 → 800 × 1000). */
export const EXPORT_WIDTH = 800;

/** `"transparent"` or a `#rrggbb` colour. */
export type Background = string;

interface Size {
  width: number;
  height: number;
}

function rotatedSize(image: Size, rotation: Rotation): Size {
  return rotation % 180 ? { width: image.height, height: image.width } : image;
}

/** Width ÷ height of the crop frame. "Free" keeps the photo's own shape. */
export function frameRatio(aspect: AspectId, image: Size, rotation: Rotation): number {
  const fixed = ASPECTS.find((a) => a.id === aspect)?.ratio;
  if (fixed) return fixed;
  const r = rotatedSize(image, rotation);
  return r.width / r.height;
}

/** Keeps the photo covering the whole frame: zoom within limits, pan no further than the photo's edges. */
export function clampView(view: View, image: Size, ratio: number): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom));
  const r = rotatedSize(image, view.rotation);
  // Frame normalised to height 1, width `ratio`.
  const scale = Math.max(ratio / r.width, 1 / r.height) * zoom;
  const maxX = Math.max(0, (r.width * scale - ratio) / (2 * ratio));
  const maxY = Math.max(0, (r.height * scale - 1) / 2);
  return {
    ...view,
    zoom,
    offsetX: Math.min(maxX, Math.max(-maxX, view.offsetX)),
    offsetY: Math.min(maxY, Math.max(-maxY, view.offsetY)),
  };
}

/** Draws `image` into a `width × height` frame the way `view` places it. */
function drawFramed(ctx: CanvasRenderingContext2D, image: CanvasImageSource & Size, view: View, width: number, height: number) {
  const r = rotatedSize(image, view.rotation);
  const scale = Math.max(width / r.width, height / r.height) * view.zoom;
  ctx.save();
  ctx.translate(width / 2 + view.offsetX * width, height / 2 + view.offsetY * height);
  if (view.flipped) ctx.scale(-1, 1);
  ctx.rotate((view.rotation * Math.PI) / 180);
  ctx.scale(scale, scale);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, -image.width / 2, -image.height / 2);
  ctx.restore();
}

/**
 * The subject with soft edges: the original photo, kept only where the AI
 * cut-out is opaque. `softness` (0–100) blurs the cut-out's edge first.
 */
export function softenSubject(source: CanvasImageSource & Size, cutout: CanvasImageSource, softness: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(source, 0, 0);
  ctx.globalCompositeOperation = "destination-in";
  // Up to 1% of the long edge, e.g. 16 px on a 1600 px photo.
  const radius = (softness / 100) * Math.max(source.width, source.height) * 0.01;
  if (radius > 0.1) ctx.filter = `blur(${radius.toFixed(2)}px)`;
  ctx.drawImage(cutout, 0, 0, source.width, source.height);
  return canvas;
}

export type Layer = "before" | "after" | "mask";

export interface Scene {
  source: CanvasImageSource & Size;
  /** From `softenSubject`; `null` until the background has been removed. */
  subject: (CanvasImageSource & Size) | null;
  background: Background;
  view: View;
}

/**
 * Paints one layer of the editor into `canvas` (its size is left as is):
 * - `before`: the original photo
 * - `after`: the subject on the chosen background (the original photo while there's no cut-out)
 * - `mask`: the original, dimmed everywhere the AI removed
 */
export function paint(canvas: HTMLCanvasElement, scene: Scene, layer: Layer) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;
  const { source, subject, background, view } = scene;
  ctx.clearRect(0, 0, width, height);

  if (layer === "before" || !subject) {
    drawFramed(ctx, source, view, width, height);
    return;
  }
  if (layer === "mask") {
    drawFramed(ctx, source, view, width, height);
    ctx.fillStyle = "rgb(15 23 42 / 0.72)";
    ctx.fillRect(0, 0, width, height);
    drawFramed(ctx, subject, view, width, height);
    return;
  }
  if (background !== "transparent") {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }
  drawFramed(ctx, subject, view, width, height);
}

/** Size of the saved photo for this crop ratio. */
export function exportSize(ratio: number): Size {
  return { width: EXPORT_WIDTH, height: Math.round(EXPORT_WIDTH / ratio) };
}

/** The finished photo as a PNG. */
export function exportPng(scene: Scene, ratio: number): Promise<Blob> {
  const { width, height } = exportSize(ratio);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  paint(canvas, scene, "after");
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't create the PNG."))), "image/png"),
  );
}

/** Long edge the editor works at: plenty for an 800 px wide export, and quick to upload and blur. */
const WORKING_EDGE = 1600;

/**
 * Decodes a picked file (honouring its EXIF orientation) and scales it down to
 * the working size. Returns the bitmap to edit and the JPEG that is sent to
 * Cloudflare, so the cut-out lines up with it pixel for pixel.
 */
export async function loadPhoto(file: File): Promise<{ bitmap: ImageBitmap; upload: Blob; original: Size }> {
  const decoded = await createImageBitmap(file, { imageOrientation: "from-image" });
  const original = { width: decoded.width, height: decoded.height };
  const scale = Math.min(1, WORKING_EDGE / Math.max(decoded.width, decoded.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(decoded.width * scale);
  canvas.height = Math.round(decoded.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(decoded, 0, 0, canvas.width, canvas.height);
  decoded.close();
  const upload = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't read the photo."))), "image/jpeg", 0.92),
  );
  const bitmap = await createImageBitmap(canvas);
  return { bitmap, upload, original };
}

const HEX = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;

/** `#rrggbb` (upper case) from user input like `0f4c9e` or `#FC0`, or `null`. */
export function normalizeHex(input: string): string | null {
  const match = HEX.exec(input.trim());
  if (!match) return null;
  let hex = match[1];
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join("");
  return `#${hex.toUpperCase()}`;
}
