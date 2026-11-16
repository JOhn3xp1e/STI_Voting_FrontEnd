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

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return [canvas, canvas.getContext("2d", { willReadFrequently: true })!];
}

/** Matte below this opacity is leftover background haze; above the upper bound, the subject itself. */
const HAZE = 0.12;
const SOLID = 0.88;

/** The cleaned-up cut-out: the subject's colours (opaque everywhere) and its matte (alpha only). */
export interface Matte {
  color: HTMLCanvasElement;
  matte: HTMLCanvasElement;
  width: number;
  height: number;
}

/**
 * Prepares the AI cut-out for compositing. With `clean` on:
 * - the matte is tightened, so faint haze left from the old background
 *   disappears and nearly-solid parts of the subject become solid;
 * - edge pixels take the colour of the subject just inside the edge
 *   instead of a mix with the old background, so no coloured fringe shows
 *   on the new background.
 */
export function prepareMatte(source: CanvasImageSource & Size, cutout: CanvasImageSource, clean: boolean): Matte {
  const { width, height } = source;
  const [colorCanvas, colorCtx] = makeCanvas(width, height);
  colorCtx.drawImage(source, 0, 0);
  const [matteCanvas, matteCtx] = makeCanvas(width, height);
  matteCtx.drawImage(cutout, 0, 0, width, height);
  if (!clean) return { color: colorCanvas, matte: matteCanvas, width, height };

  const photo = colorCtx.getImageData(0, 0, width, height);
  const matte = matteCtx.getImageData(0, 0, width, height);
  const px = photo.data;
  const alpha = matte.data;

  // The subject's solid core, spread outwards with a blur: for every edge pixel
  // this gives the average colour of the subject next to it.
  const [coreCanvas, coreCtx] = makeCanvas(width, height);
  const core = coreCtx.createImageData(width, height);
  for (let i = 0; i < px.length; i += 4) {
    core.data[i] = px[i];
    core.data[i + 1] = px[i + 1];
    core.data[i + 2] = px[i + 2];
    core.data[i + 3] = alpha[i + 3] >= 245 ? 255 : 0;
  }
  coreCtx.putImageData(core, 0, 0);
  const [, spreadCtx] = makeCanvas(width, height);
  spreadCtx.filter = `blur(${Math.max(2, Math.max(width, height) * 0.004).toFixed(1)}px)`;
  spreadCtx.drawImage(coreCanvas, 0, 0);
  const spread = spreadCtx.getImageData(0, 0, width, height).data;

  for (let i = 0; i < px.length; i += 4) {
    const a = alpha[i + 3] / 255;
    const t = Math.min(1, Math.max(0, (a - HAZE) / (SOLID - HAZE)));
    const refined = t * t * (3 - 2 * t);
    alpha[i] = alpha[i + 1] = alpha[i + 2] = 0;
    alpha[i + 3] = Math.round(refined * 255);
    // Edge pixel next to the subject: pull its colour towards the subject's.
    if (refined > 0 && refined < 1 && spread[i + 3] > 8) {
      const mix = Math.min(1, (1 - refined) * 1.5);
      px[i] += (spread[i] - px[i]) * mix;
      px[i + 1] += (spread[i + 1] - px[i + 1]) * mix;
      px[i + 2] += (spread[i + 2] - px[i + 2]) * mix;
    }
  }
  colorCtx.putImageData(photo, 0, 0);
  matteCtx.putImageData(matte, 0, 0);
  return { color: colorCanvas, matte: matteCanvas, width, height };
}

/** The subject, ready to place on a background. `softness` (0–100) feathers the edge by up to 0.4% of the long edge. */
export function cutSubject({ color, matte, width, height }: Matte, softness: number): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(width, height);
  ctx.drawImage(color, 0, 0);
  ctx.globalCompositeOperation = "destination-in";
  const radius = (softness / 100) * Math.max(width, height) * 0.004;
  if (radius > 0.1) ctx.filter = `blur(${radius.toFixed(2)}px)`;
  ctx.drawImage(matte, 0, 0);
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
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't read the photo."))), "image/jpeg", 0.95),
  );
  const bitmap = await createImageBitmap(canvas);
  return { bitmap, upload, original };
}

/** JPEG of `image` scaled to fit `maxEdge` (the uniform model takes at most 512 px). */
export function scaledJpeg(image: CanvasImageSource & Size, maxEdge: number): Promise<Blob> {
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const [canvas, ctx] = makeCanvas(Math.round(image.width * scale), Math.round(image.height * scale));
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't prepare the photo."))), "image/jpeg", 0.92),
  );
}

/** Size to generate a photo of this shape at: long edge 1024, multiples of 16 (what FLUX.2 expects). */
export function generationSize(image: Size): Size {
  const scale = 1024 / Math.max(image.width, image.height);
  const round = (n: number) => Math.min(1920, Math.max(256, Math.round((n * scale) / 16) * 16));
  return { width: round(image.width), height: round(image.height) };
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
