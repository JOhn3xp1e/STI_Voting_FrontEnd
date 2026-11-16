"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from "react";
import { LoaderCircle } from "lucide-react";

import { loginHref } from "@/lib/auth-routing";
import { cn } from "@/lib/utils";

import {
  ASPECTS,
  DEFAULT_VIEW,
  MAX_ZOOM,
  MIN_ZOOM,
  clampView,
  exportPng,
  exportSize,
  frameRatio,
  loadPhoto,
  normalizeHex,
  paint,
  softenSubject,
  type AspectId,
  type Background,
  type Layer,
  type Rotation,
  type View,
} from "./compose";
import {
  CheckBoldIcon,
  CheckIcon,
  ChevronLeftIcon,
  EyedropperIcon,
  FlipIcon,
  RotateIcon,
  SparkleIcon,
  SplitArrowsIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "./icons";

/* -------------------------------------------------------------------------- */
/*                                  Settings                                  */
/* -------------------------------------------------------------------------- */

const PAGE_PATH = "/photo-editor-test";
const REMOVE_BACKGROUND_ENDPOINT = "/api/photo-editor/remove-background";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
/** The photo is scaled down before upload, so large camera files are fine. */
const MAX_FILE_BYTES = 25 * 1024 * 1024;

const SWATCHES: { label: string; value: Background }[] = [
  { label: "Transparent", value: "transparent" },
  { label: "White", value: "#FFFFFF" },
  { label: "Brand blue", value: "#0F4C9E" },
  { label: "Gold", value: "#FFC200" },
];

const CHECKERBOARD = "repeating-conic-gradient(#e2e8f0 0 25%, #ffffff 0 50%) 0 0 / 10px 10px";

const LINE = "border-[#e4e8f0]";
const focusRing = "outline-none focus-visible:ring-3 focus-visible:ring-brand-blue/30";

/* -------------------------------------------------------------------------- */
/*                                    Types                                   */
/* -------------------------------------------------------------------------- */

interface Photo {
  name: string;
  /** Size of the file as picked (shown in the top bar). */
  width: number;
  height: number;
  /** Scaled-down copy the editor works on. */
  bitmap: ImageBitmap;
  /** JPEG of `bitmap`, sent to Cloudflare. */
  upload: Blob;
}

type Removal =
  | { status: "idle" }
  | { status: "working" }
  | { status: "done"; seconds: number }
  | { status: "error"; message: string; signedOut: boolean };

type Step = "crop" | "remove" | "color";
type StepState = "done" | "current" | "todo" | "working";

class RemovalError extends Error {
  constructor(
    message: string,
    readonly signedOut: boolean,
  ) {
    super(message);
  }
}

type EyeDropperConstructor = new () => { open(): Promise<{ sRGBHex: string }> };

function getEyeDropper(): EyeDropperConstructor | undefined {
  return (window as unknown as { EyeDropper?: EyeDropperConstructor }).EyeDropper;
}

const noSubscription = () => () => {};

function colorName(background: Background): string {
  return SWATCHES.find((s) => s.value === background)?.label ?? "Custom";
}

function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "") || "photo";
}

/* -------------------------------------------------------------------------- */
/*                                   Editor                                   */
/* -------------------------------------------------------------------------- */

/**
 * Test page for AI photo editing: crop, remove the background (Cloudflare
 * Images), then put the subject on a new background colour and save a PNG.
 */
export function PhotoEditor() {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cutout, setCutout] = useState<ImageBitmap | null>(null);
  const [removal, setRemoval] = useState<Removal>({ status: "idle" });
  const [aspect, setAspect] = useState<AspectId>("4:5");
  const [rawView, setView] = useState<View>(DEFAULT_VIEW);
  const [softness, setSoftness] = useState(30);
  const [showMask, setShowMask] = useState(false);
  const [compare, setCompare] = useState(true);
  const [split, setSplit] = useState(0.5);
  const [background, setBackground] = useState<Background>("#0F4C9E");
  const [hexDraft, setHexDraft] = useState("#0F4C9E");
  const [saving, setSaving] = useState(false);
  const [workspace, setWorkspace] = useState({ width: 0, height: 0 });
  const [dropping, setDropping] = useState(false);
  const [dragging, setDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const afterRef = useRef<HTMLCanvasElement>(null);
  const beforeRef = useRef<HTMLCanvasElement>(null);
  const avatarRef = useRef<HTMLCanvasElement>(null);
  const cropSectionRef = useRef<HTMLElement>(null);
  const removeSectionRef = useRef<HTMLElement>(null);
  const colorSectionRef = useRef<HTMLElement>(null);
  /** Bumped for every new request, so answers for an older photo are ignored. */
  const requestRef = useRef(0);
  const dragRef = useRef<{ kind: "pan" | "split"; x: number; y: number; view: View } | null>(null);

  const canUseEyeDropper = useSyncExternalStore(noSubscription, () => Boolean(getEyeDropper()), () => false);

  const ratio = photo ? frameRatio(aspect, photo.bitmap, rawView.rotation) : 4 / 5;
  const view = useMemo(() => (photo ? clampView(rawView, photo.bitmap, ratio) : rawView), [photo, rawView, ratio]);
  const subject = useMemo(() => (photo && cutout ? softenSubject(photo.bitmap, cutout, softness) : null), [photo, cutout, softness]);
  const output = exportSize(ratio);
  const hasCutout = subject !== null;
  const comparing = compare && hasCutout;
  const viewChanged = view.zoom !== 1 || view.offsetX !== 0 || view.offsetY !== 0 || view.rotation !== 0 || view.flipped;

  /** The crop frame, as large as the workspace allows (480 × 600 for 4:5 in the design). */
  const frame = useMemo(() => {
    const availableWidth = Math.max(160, workspace.width);
    // Room for the toolbar and the hint under the photo.
    const availableHeight = Math.max(200, workspace.height - 100);
    const height = Math.min(600, availableHeight, availableWidth / ratio, 600 / ratio);
    return { width: Math.round(height * ratio), height: Math.round(height) };
  }, [workspace, ratio]);

  const stepState: Record<Step, StepState> = {
    crop: photo ? "done" : "current",
    remove: removal.status === "working" ? "working" : cutout ? "done" : photo ? "current" : "todo",
    color: cutout ? "current" : "todo",
  };
  const activeStep: Step = !photo ? "crop" : !cutout ? "remove" : "color";

  /* ------------------------------ Effects ------------------------------ */

  useEffect(() => {
    const element = workspaceRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setWorkspace({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Scroll to zoom (needs a non-passive listener to keep the page from scrolling).
  useEffect(() => {
    const element = frameRef.current;
    if (!element || !photo) return;
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      setView((v) => ({ ...v, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * Math.exp(-event.deltaY * 0.0015))) }));
    }
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [photo]);

  // Paint the canvases whenever anything they show changes.
  useEffect(() => {
    if (!photo) return;
    const scene = { source: photo.bitmap, subject, background, view };
    const dpr = window.devicePixelRatio || 1;
    const targets: [HTMLCanvasElement | null, Layer, number, number][] = [
      [afterRef.current, showMask ? "mask" : "after", frame.width, frame.height],
      [beforeRef.current, "before", frame.width, frame.height],
      [avatarRef.current, "after", 44, 44 / ratio],
    ];
    for (const [canvas, layer, width, height] of targets) {
      if (!canvas) continue;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      paint(canvas, scene, layer);
    }
  }, [photo, subject, background, view, showMask, frame, ratio, comparing]);

  /* ------------------------------ Actions ------------------------------ */

  function resetEdits() {
    requestRef.current += 1;
    setCutout(null);
    setRemoval({ status: "idle" });
    setView(DEFAULT_VIEW);
    setSplit(0.5);
    setShowMask(false);
  }

  async function removeBackground(upload: Blob) {
    const id = ++requestRef.current;
    setRemoval({ status: "working" });
    const started = performance.now();
    try {
      const form = new FormData();
      form.append("image", upload, "photo.jpg");
      const response = await fetch(REMOVE_BACKGROUND_ENDPOINT, { method: "POST", body: form, credentials: "same-origin" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new RemovalError(body?.message ?? `The server answered ${response.status}.`, response.status === 401);
      }
      const bitmap = await createImageBitmap(await response.blob());
      if (id !== requestRef.current) return;
      setCutout(bitmap);
      setRemoval({ status: "done", seconds: (performance.now() - started) / 1000 });
    } catch (cause) {
      if (id !== requestRef.current) return;
      setRemoval({
        status: "error",
        message: cause instanceof Error ? cause.message : "Something went wrong.",
        signedOut: cause instanceof RemovalError && cause.signedOut,
      });
    }
  }

  async function pick(file: File | null | undefined) {
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) return setNotice("Use a PNG, JPG or WebP image.");
    if (file.size > MAX_FILE_BYTES) return setNotice("That photo is over 25 MB.");
    setNotice(null);
    try {
      const { bitmap, upload, original } = await loadPhoto(file);
      resetEdits();
      setPhoto({ name: file.name, width: original.width, height: original.height, bitmap, upload });
      void removeBackground(upload);
    } catch {
      setNotice("Couldn't open that photo. Try another file.");
    }
  }

  function onFileInput(event: ChangeEvent<HTMLInputElement>) {
    void pick(event.target.files?.[0]);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDropping(false);
    void pick(event.dataTransfer.files[0]);
  }

  function cancel() {
    resetEdits();
    setPhoto(null);
    setNotice(null);
  }

  async function save() {
    if (!photo) return;
    setSaving(true);
    try {
      const blob = await exportPng({ source: photo.bitmap, subject, background, view }, ratio);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${baseName(photo.name)}-ballot.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setNotice("Couldn't save the photo.");
    } finally {
      setSaving(false);
    }
  }

  function chooseBackground(value: Background) {
    setBackground(value);
    setHexDraft(value === "transparent" ? "" : value);
  }

  function onHexChange(value: string) {
    setHexDraft(value);
    const hex = normalizeHex(value);
    if (hex) setBackground(hex);
  }

  async function pickFromScreen() {
    const EyeDropper = getEyeDropper();
    if (!EyeDropper) return;
    try {
      const { sRGBHex } = await new EyeDropper().open();
      const hex = normalizeHex(sRGBHex);
      if (hex) chooseBackground(hex);
    } catch {
      // Closed with Esc.
    }
  }

  function zoomBy(factor: number) {
    setView({ ...view, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor)) });
  }

  function rotateLeft() {
    setView({ ...view, rotation: ((view.rotation + 270) % 360) as Rotation, offsetX: 0, offsetY: 0 });
  }

  function chooseAspect(id: AspectId) {
    setAspect(id);
    setView({ ...view, offsetX: 0, offsetY: 0 });
  }

  function scrollToStep(step: Step) {
    const section = step === "crop" ? cropSectionRef : step === "remove" ? removeSectionRef : colorSectionRef;
    section.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* --------------------------- Frame gestures --------------------------- */

  function onFramePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const onHandle = (event.target as HTMLElement).closest("[data-split-handle]");
    dragRef.current = { kind: onHandle ? "split" : "pan", x: event.clientX, y: event.clientY, view };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function onFramePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === "split") {
      const rect = event.currentTarget.getBoundingClientRect();
      setSplit(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)));
      return;
    }
    setView({
      ...drag.view,
      offsetX: drag.view.offsetX + (event.clientX - drag.x) / frame.width,
      offsetY: drag.view.offsetY + (event.clientY - drag.y) / frame.height,
    });
  }

  function endFrameDrag() {
    dragRef.current = null;
    setDragging(false);
  }

  function onFrameKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 0.1 : 0.02;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      setView({ ...view, offsetX: view.offsetX + move[0], offsetY: view.offsetY + move[1] });
    } else if (event.key === "+" || event.key === "=") zoomBy(1.25);
    else if (event.key === "-") zoomBy(0.8);
  }

  function onSplitKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const delta = { ArrowLeft: -0.05, ArrowRight: 0.05 }[event.key];
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      event.stopPropagation();
      setSplit(event.key === "Home" ? 0 : 1);
    } else if (delta !== undefined) {
      event.preventDefault();
      event.stopPropagation();
      setSplit((s) => Math.min(1, Math.max(0, s + delta)));
    }
  }

  /* ------------------------------- Render ------------------------------- */

  return (
    <div className="flex min-h-dvh flex-col bg-white font-mono text-brand-navy lg:h-dvh">
      <input ref={fileInputRef} type="file" accept={ACCEPTED_TYPES.join(",")} className="sr-only" tabIndex={-1} onChange={onFileInput} />

      {/* ------------------------------ Top bar ------------------------------ */}
      <header className={cn("flex h-16 shrink-0 items-center gap-3 border-b px-4 sm:px-5", LINE)}>
        <Link
          href="/dashboard"
          aria-label="Back to the dashboard"
          className={cn("flex items-center rounded-lg border px-2 py-1.5 transition-colors hover:bg-[#f4f6fa]", LINE, focusRing)}
        >
          <ChevronLeftIcon />
        </Link>
        <div className="flex min-w-0 flex-col gap-px">
          <h1 className="text-[15px] font-semibold">Photo editor</h1>
          <p className="truncate text-[11.5px] text-brand-muted">
            {photo ? `${photo.name} · ${photo.width} × ${photo.height}` : "AI test · Cloudflare Images"}
          </p>
        </div>

        <div className="flex-1" />
        <nav aria-label="Steps" className="hidden gap-1 rounded-[10px] bg-[#f4f6fa] p-1 xl:flex">
          {(
            [
              ["crop", 1, "Crop"],
              ["remove", 2, "Remove background"],
              ["color", 3, "Background color"],
            ] as const
          ).map(([step, n, label]) => {
            const active = step === activeStep;
            return (
              <button
                key={step}
                type="button"
                onClick={() => scrollToStep(step)}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-[7px] py-1.5 pr-3 pl-2.5 text-xs transition-colors",
                  active ? "bg-white font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.08)]" : "font-medium text-brand-muted hover:text-brand-navy",
                  focusRing,
                )}
              >
                <StepBadge n={n} state={stepState[step]} small />
                {label}
              </button>
            );
          })}
        </nav>
        <div className="flex-1" />

        <button type="button" onClick={cancel} disabled={!photo} className={secondaryButtonClassName}>
          Cancel
        </button>
        <button type="button" onClick={() => void save()} disabled={!photo || saving} className={primaryButtonClassName}>
          {saving ? "Saving…" : "Save photo"}
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* ----------------------------- Workspace ----------------------------- */}
        <main
          ref={workspaceRef}
          onDragOver={(event) => {
            event.preventDefault();
            setDropping(true);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false);
          }}
          onDrop={onDrop}
          className="relative flex min-h-[560px] min-w-0 flex-1 flex-col items-center justify-center gap-4 overflow-hidden bg-[#f4f6fa] p-6"
        >
          {photo ? (
            <>
              <div
                ref={frameRef}
                tabIndex={0}
                role="group"
                aria-label="Photo. Drag or use the arrow keys to reposition it, + and − to zoom."
                onPointerDown={onFramePointerDown}
                onPointerMove={onFramePointerMove}
                onPointerUp={endFrameDrag}
                onPointerCancel={endFrameDrag}
                onKeyDown={onFrameKeyDown}
                style={{ width: frame.width, height: frame.height }}
                className={cn(
                  "relative shrink-0 touch-none overflow-hidden rounded-[14px] shadow-[0_8px_12px_rgba(15,23,42,0.12)] select-none",
                  dragging ? "cursor-grabbing" : "cursor-grab",
                  focusRing,
                )}
              >
                <canvas
                  ref={afterRef}
                  aria-hidden
                  className="absolute inset-0 size-full"
                  style={hasCutout && !showMask && background === "transparent" ? { background: CHECKERBOARD } : undefined}
                />
                {comparing ? (
                  <canvas
                    ref={beforeRef}
                    aria-hidden
                    className="absolute inset-0 size-full"
                    style={{ clipPath: `inset(0 ${(1 - split) * 100}% 0 0)` }}
                  />
                ) : null}

                <CropGuides width={frame.width} height={frame.height} />

                {comparing ? (
                  <>
                    <div aria-hidden className="pointer-events-none absolute inset-y-0 w-0.5 bg-white" style={{ left: `calc(${split * 100}% - 1px)` }} />
                    <div
                      data-split-handle
                      role="slider"
                      tabIndex={0}
                      aria-label="Before and after divider"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(split * 100)}
                      aria-valuetext={`${Math.round(split * 100)}% shows the original`}
                      onKeyDown={onSplitKeyDown}
                      style={{ left: `${split * 100}%` }}
                      className={cn(
                        "absolute top-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.2)]",
                        focusRing,
                      )}
                    >
                      <SplitArrowsIcon />
                    </div>
                    <FramePill className="left-4">Before</FramePill>
                    <FramePill className="right-4">{showMask ? "Mask" : "After"}</FramePill>
                  </>
                ) : null}

                {removal.status === "working" ? (
                  <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
                    <span className="flex items-center gap-2 rounded-full bg-[rgba(15,23,42,0.7)] px-3 py-1.5 text-[11.5px] font-medium text-white">
                      <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
                      Removing background…
                    </span>
                  </div>
                ) : null}
              </div>

              <div
                role="toolbar"
                aria-label="Photo tools"
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded-xl border bg-white py-1.5 pr-2.5 pl-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.06)]",
                  LINE,
                )}
              >
                <ToolButton label="Zoom out" onClick={() => zoomBy(0.8)} disabled={view.zoom <= MIN_ZOOM}>
                  <ZoomOutIcon />
                </ToolButton>
                <span className="w-10 text-center text-xs font-medium tabular-nums" aria-live="polite">
                  {Math.round(view.zoom * 100)}%
                </span>
                <ToolButton label="Zoom in" onClick={() => zoomBy(1.25)} disabled={view.zoom >= MAX_ZOOM}>
                  <ZoomInIcon />
                </ToolButton>
                <ToolbarDivider />
                <ToolButton label="Rotate left" onClick={rotateLeft}>
                  <RotateIcon />
                </ToolButton>
                <ToolButton label="Flip horizontally" pressed={view.flipped} onClick={() => setView({ ...view, flipped: !view.flipped })}>
                  <FlipIcon />
                </ToolButton>
                <ToolbarDivider />
                <div className="flex items-center gap-2 pl-1.5">
                  <span id="compare-label" className={cn("text-xs font-medium", !hasCutout && "text-brand-muted")}>
                    Compare
                  </span>
                  <Toggle checked={comparing} disabled={!hasCutout} onChange={setCompare} labelledBy="compare-label" />
                </div>
              </div>

              <p className="text-center text-[11.5px] text-brand-muted">
                {comparing ? "Drag the handle to compare · " : ""}scroll to zoom · drag the photo to reposition
              </p>
            </>
          ) : (
            <EmptyState onChoose={() => fileInputRef.current?.click()} />
          )}

          {notice ? (
            <p role="alert" className="rounded-md bg-destructive/8 px-3 py-2 text-[12px] text-destructive">
              {notice}
            </p>
          ) : null}

          {dropping ? (
            <div className="pointer-events-none absolute inset-3 flex items-center justify-center rounded-2xl border-2 border-dashed border-brand-blue bg-brand-blue/5">
              <p className="rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-brand-blue shadow-sm">Drop to use this photo</p>
            </div>
          ) : null}
        </main>

        {/* ------------------------------- Panel ------------------------------- */}
        <aside aria-label="Edit steps" className={cn("flex w-full shrink-0 flex-col bg-white max-lg:border-t lg:w-[392px] lg:border-l", LINE)}>
          <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto p-5">
            <Section
              ref={cropSectionRef}
              title="Crop"
              badge={<StepBadge n={1} state={stepState.crop} />}
              action={
                <TextButton onClick={() => setView(DEFAULT_VIEW)} disabled={!photo || !viewChanged}>
                  Reset
                </TextButton>
              }
            >
              <div role="radiogroup" aria-label="Crop ratio" className="flex gap-1.5 rounded-[10px] bg-[#f4f6fa] p-[3px]">
                {ASPECTS.map((a) => {
                  const selected = a.id === aspect;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => chooseAspect(a.id)}
                      className={cn(
                        "flex-1 rounded-[7px] py-1.5 text-xs transition-colors",
                        selected ? "bg-white font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.08)]" : "font-medium text-brand-muted hover:text-brand-navy",
                        focusRing,
                      )}
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11.5px] text-brand-muted">Drag the photo to frame the face; scroll or use the toolbar to zoom.</p>
            </Section>

            <Divider />

            <Section ref={removeSectionRef} title="Remove background" badge={<StepBadge n={2} state={stepState.remove} />}>
              <AiStatus
                removal={removal}
                hasPhoto={Boolean(photo)}
                onRun={() => photo && void removeBackground(photo.upload)}
              />
              <SoftnessSlider value={softness} onChange={setSoftness} disabled={!hasCutout} />
              <ToggleRow
                id="show-mask"
                title="Show mask"
                description="Highlights what the AI kept."
                checked={showMask && hasCutout}
                disabled={!hasCutout}
                onChange={setShowMask}
              />
            </Section>

            <Divider />

            <Section ref={colorSectionRef} title="Background color" badge={<StepBadge n={3} state={stepState.color} />}>
              <div role="radiogroup" aria-label="Background color" className="flex flex-wrap gap-2.5">
                {SWATCHES.map((swatch) => (
                  <Swatch key={swatch.value} {...swatch} selected={background === swatch.value} onSelect={() => chooseBackground(swatch.value)} />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 rounded-lg border bg-white px-2.5 py-[9px] focus-within:border-brand-blue focus-within:ring-3 focus-within:ring-brand-blue/20",
                    LINE,
                  )}
                >
                  <label className="relative size-4 shrink-0 cursor-pointer overflow-hidden rounded-full border border-black/5" title="Pick a color">
                    <span className="absolute inset-0" style={{ background: background === "transparent" ? CHECKERBOARD : background }} />
                    <input
                      type="color"
                      aria-label="Pick a background color"
                      value={background === "transparent" ? "#ffffff" : background.toLowerCase()}
                      onChange={(e) => chooseBackground(e.target.value.toUpperCase())}
                      className="absolute inset-0 cursor-pointer opacity-0"
                    />
                  </label>
                  <input
                    type="text"
                    aria-label="Background color hex code"
                    value={hexDraft}
                    placeholder="Transparent"
                    spellCheck={false}
                    maxLength={7}
                    onChange={(e) => onHexChange(e.target.value)}
                    onBlur={() => setHexDraft(background === "transparent" ? "" : background)}
                    className="w-20 min-w-0 bg-transparent text-[12.5px] font-medium uppercase outline-none placeholder:normal-case placeholder:text-brand-muted"
                  />
                  <span className="flex-1" />
                  <span className="truncate text-[11.5px] text-brand-muted">{colorName(background)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void pickFromScreen()}
                  disabled={!canUseEyeDropper}
                  aria-label="Pick a color from the screen"
                  title={canUseEyeDropper ? "Pick a color from the screen" : "Your browser can't pick colors from the screen"}
                  className={cn(
                    "flex size-[38px] shrink-0 items-center justify-center rounded-lg border bg-white transition-colors hover:bg-[#f4f6fa] disabled:cursor-not-allowed disabled:opacity-40",
                    LINE,
                    focusRing,
                  )}
                >
                  <EyedropperIcon />
                </button>
              </div>
            </Section>
          </div>

          <footer className={cn("flex flex-col gap-2.5 border-t px-5 pt-3.5 pb-4", LINE)}>
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-medium tracking-[0.6px] text-brand-muted uppercase">Preview on ballot</p>
              <span className="flex-1" />
              <p className="text-[11px] text-brand-muted">
                PNG · {output.width} × {output.height}
              </p>
            </div>
            <div className={cn("flex items-center gap-3 rounded-[10px] border bg-white py-2.5 pr-3 pl-2.5", LINE)}>
              <div className="size-11 shrink-0 overflow-hidden rounded-full bg-[#f4f6fa]">
                {photo ? <canvas ref={avatarRef} aria-hidden className="size-full object-cover object-top" /> : null}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-px">
                <p className="truncate text-[12.5px] font-semibold">Candidate name</p>
                <p className="truncate text-[11.5px] text-brand-muted">President · Independent</p>
              </div>
              <span aria-hidden className={cn("size-[18px] shrink-0 rounded-full border-[1.5px]", LINE)} />
            </div>
          </footer>
        </aside>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Pieces                                   */
/* -------------------------------------------------------------------------- */

const secondaryButtonClassName = cn(
  "shrink-0 rounded-md border bg-white px-4 py-[9px] text-[13px] font-semibold transition-colors hover:bg-[#f4f6fa] disabled:cursor-not-allowed disabled:opacity-50",
  LINE,
  focusRing,
);

const primaryButtonClassName = cn(
  "shrink-0 rounded-md bg-brand-navy px-4 py-[9px] text-[13px] font-semibold text-white transition-colors hover:bg-brand-navy/85 disabled:cursor-not-allowed disabled:opacity-50",
  focusRing,
);

function StepBadge({ n, state, small = false }: { n: number; state: StepState; small?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full",
        small ? "size-[18px]" : "size-5",
        state === "done" || state === "working"
          ? "bg-brand-blue text-white"
          : state === "current"
            ? "bg-brand-navy text-white"
            : "bg-[#e4e8f0] text-brand-muted",
      )}
    >
      {state === "done" ? (
        <CheckIcon />
      ) : state === "working" ? (
        <LoaderCircle className="size-2.5 animate-spin" strokeWidth={3} />
      ) : (
        <span className={cn("font-semibold", small ? "text-[10px]" : "text-[10.5px]")}>{n}</span>
      )}
    </span>
  );
}

function Section({
  ref,
  title,
  badge,
  action,
  children,
}: {
  ref: Ref<HTMLElement>;
  title: string;
  badge: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section ref={ref} aria-label={title} className="flex scroll-mt-5 flex-col gap-3.5">
      <div className="flex items-center gap-2">
        {badge}
        <h2 className="text-[13.5px] font-semibold">{title}</h2>
        <span className="flex-1" />
        {action}
      </div>
      {children}
    </section>
  );
}

function Divider() {
  return <div aria-hidden className="h-px w-full shrink-0 bg-[#e4e8f0]" />;
}

function TextButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn("rounded text-xs font-medium text-brand-blue hover:underline disabled:pointer-events-none disabled:opacity-0", focusRing)}
    >
      {children}
    </button>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
  labelledBy,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  labelledBy: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "group relative h-5 w-9 shrink-0 cursor-pointer rounded-full bg-[#e4e8f0] transition-colors aria-checked:bg-brand-blue disabled:cursor-not-allowed disabled:opacity-50",
        focusRing,
      )}
    >
      <span className="absolute top-[3px] left-[3px] size-3.5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.18)] transition-transform group-aria-checked:translate-x-4" />
    </button>
  );
}

function ToggleRow({
  id,
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn("flex min-w-0 flex-1 flex-col gap-0.5", disabled && "opacity-60")}>
        <p id={`${id}-label`} className="text-[12.5px] font-medium">
          {title}
        </p>
        <p className="text-[11.5px] text-brand-muted">{description}</p>
      </div>
      <Toggle checked={checked} disabled={disabled} onChange={onChange} labelledBy={`${id}-label`} />
    </div>
  );
}

function SoftnessSlider({ value, onChange, disabled }: { value: number; onChange: (value: number) => void; disabled?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-2", disabled && "opacity-60")}>
      <div className="flex items-center">
        <label htmlFor="edge-softness" className="text-[12.5px] font-medium">
          Edge softness
        </label>
        <span className="flex-1" />
        <span className="text-xs font-medium text-brand-muted tabular-nums">{value}%</span>
      </div>
      <div className="relative h-4">
        <div className="absolute inset-x-0 top-1.5 h-1 rounded-full bg-[#e4e8f0]" />
        <div className="absolute top-1.5 left-0 h-1 rounded-full bg-brand-blue" style={{ width: `calc(${value}% + ${8 - value * 0.16}px)` }} />
        <input
          id="edge-softness"
          type="range"
          min={0}
          max={100}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
        <span
          aria-hidden
          className="absolute top-0 size-4 rounded-full border-2 border-brand-blue bg-white peer-focus-visible:ring-3 peer-focus-visible:ring-brand-blue/30"
          style={{ left: `calc(${value}% - ${value * 0.16}px)` }}
        />
      </div>
    </div>
  );
}

function AiStatus({ removal, hasPhoto, onRun }: { removal: Removal; hasPhoto: boolean; onRun: () => void }) {
  const failed = removal.status === "error";
  let title: string;
  let detail: ReactNode;
  let action: ReactNode = null;

  switch (removal.status) {
    case "working":
      title = "Removing background…";
      detail = "Cloudflare Images is finding the subject";
      break;
    case "done":
      title = "Background removed";
      detail = `Cloudflare Images · ${removal.seconds.toFixed(1)} s`;
      action = <TextButton onClick={onRun}>Redo</TextButton>;
      break;
    case "error":
      title = "Couldn't remove the background";
      detail = removal.message;
      action = removal.signedOut ? (
        <Link href={loginHref(undefined, PAGE_PATH)} className={cn("shrink-0 rounded text-xs font-medium text-brand-blue hover:underline", focusRing)}>
          Sign in
        </Link>
      ) : (
        <TextButton onClick={onRun}>Try again</TextButton>
      );
      break;
    default:
      title = hasPhoto ? "Ready to remove the background" : "Add a photo first";
      detail = "Runs on Cloudflare Images (AI)";
      action = hasPhoto ? <TextButton onClick={onRun}>Run</TextButton> : null;
  }

  return (
    <div
      role="status"
      className={cn(
        "flex items-center gap-2.5 rounded-[10px] border px-3 py-2.5",
        failed ? "border-destructive/25 bg-destructive/5" : "border-[rgba(15,76,158,0.18)] bg-[rgba(15,76,158,0.06)]",
      )}
    >
      <span
        aria-hidden
        className={cn("flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-white", failed ? "text-destructive" : "text-brand-blue")}
      >
        {removal.status === "working" ? <LoaderCircle className="size-4 animate-spin" /> : <SparkleIcon size={16} />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <p className="text-[12.5px] font-semibold">{title}</p>
        <p className={cn("text-[11.5px]", failed ? "text-destructive" : "text-brand-muted")}>{detail}</p>
      </div>
      {action}
    </div>
  );
}

function Swatch({ label, value, selected, onSelect }: { label: string; value: Background; selected: boolean; onSelect: () => void }) {
  const light = value === "transparent" || value === "#FFFFFF" || value === "#FFC200";
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      title={label}
      onClick={onSelect}
      className={cn(
        "flex size-[46px] items-center justify-center rounded-[10px] border-2 p-[3px] transition-colors",
        selected ? "border-brand-navy" : "border-transparent hover:border-[#e4e8f0]",
        focusRing,
      )}
    >
      <span
        className={cn("flex size-10 items-center justify-center rounded-lg border", LINE, light ? "text-brand-navy" : "text-white")}
        style={{ background: value === "transparent" ? CHECKERBOARD : value }}
      >
        {selected ? <CheckBoldIcon /> : null}
      </span>
    </button>
  );
}

function ToolButton({
  label,
  onClick,
  disabled,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex size-8 items-center justify-center rounded-lg bg-white transition-colors hover:bg-[#f4f6fa] disabled:cursor-not-allowed disabled:opacity-40 aria-pressed:bg-brand-blue/10 aria-pressed:text-brand-blue",
        focusRing,
      )}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <span aria-hidden className="mx-0.5 h-5 w-px bg-[#e4e8f0]" />;
}

function FramePill({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className={cn("pointer-events-none absolute top-4 rounded-full bg-[rgba(15,23,42,0.55)] px-[9px] py-1 text-[11px] font-medium text-white", className)}>
      {children}
    </span>
  );
}

/** Rule-of-thirds grid and corner brackets over the photo. */
function CropGuides({ width, height }: { width: number; height: number }) {
  const w = width;
  const h = height;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute inset-y-0 left-1/3 w-px bg-white/22" />
      <div className="absolute inset-y-0 left-2/3 w-px bg-white/22" />
      <div className="absolute inset-x-0 top-1/3 h-px bg-white/22" />
      <div className="absolute inset-x-0 top-2/3 h-px bg-white/22" />
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" stroke="white" strokeWidth={4} strokeLinecap="round" className="absolute inset-0">
        <path d="M6 34V6H34" />
        <path d={`M${w - 34} 6H${w - 6}V34`} />
        <path d={`M${w - 6} ${h - 34}V${h - 6}H${w - 34}`} />
        <path d={`M34 ${h - 6}H6V${h - 34}`} />
      </svg>
    </div>
  );
}

function EmptyState({ onChoose }: { onChoose: () => void }) {
  return (
    <div className="flex w-full max-w-[480px] flex-col items-center gap-4 rounded-[14px] border border-dashed border-[#cbd5e1] bg-white px-8 py-16 text-center">
      <span aria-hidden className="flex size-11 items-center justify-center rounded-full bg-brand-blue/10 text-brand-blue">
        <SparkleIcon size={16} />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-[15px] font-semibold">Choose a candidate photo</p>
        <p className="text-[12.5px] text-brand-muted">
          PNG, JPG or WebP, up to 25 MB. Cloudflare removes the background as soon as it&apos;s in.
        </p>
      </div>
      <button type="button" onClick={onChoose} className={primaryButtonClassName}>
        Choose photo
      </button>
      <p className="text-[11.5px] text-brand-muted">or drop it anywhere here</p>
    </div>
  );
}
