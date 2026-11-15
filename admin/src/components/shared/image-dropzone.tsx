"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

/** What the image endpoints in SLVP-BE accept. */
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

interface ImageDropzoneProps {
  /** e.g. "Drop a banner image" */
  title: string;
  /** e.g. "3:1 · max 2 MB" (the accepted formats are added in front). */
  hint: string;
  maxBytes: number;
  /** Image shown behind the text: a newly picked file's preview, or the saved image. */
  previewUrl?: string | null;
  /** True while `previewUrl` is a newly picked file, which shows a remove (×) button. */
  picked?: boolean;
  onPick: (file: File | null) => void;
  onError: (message: string) => void;
  className?: string;
}

/** Dashed drop area for one image (PNG, JPG or WebP). The file is uploaded when the form is saved. */
export function ImageDropzone({ title, hint, maxBytes, previewUrl, picked = false, onPick, onError, className }: ImageDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function accept(file: File | undefined) {
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) return onError("Use a PNG, JPG or WebP image.");
    if (file.size > maxBytes) return onError(`The image is over ${Math.round(maxBytes / (1024 * 1024))} MB.`);
    onPick(file);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    accept(event.dataTransfer.files[0]);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "relative flex min-h-19.5 items-center justify-center overflow-hidden rounded-[0.25rem] border border-dashed bg-cover bg-center text-center transition-[border-color,background-color] duration-200",
        dragging ? "border-brand-blue/60 bg-brand-blue/4" : "border-[#d5dbe3] dark:border-white/15",
        className,
      )}
      style={previewUrl ? { backgroundImage: `url("${previewUrl}")` } : undefined}
    >
      {previewUrl ? <span aria-hidden className="absolute inset-0 bg-brand-navy/55" /> : null}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="group/drop relative flex h-full min-h-19.5 w-full cursor-pointer flex-col items-center justify-center gap-1 px-3 py-3 outline-none focus-visible:ring-3 focus-visible:ring-brand-blue/15"
      >
        <span className={cn("text-[0.8125rem] underline-offset-2 group-hover/drop:underline", previewUrl ? "text-white" : "text-foreground")}>{title}</span>
        <span className={cn("font-mono text-[0.65625rem]", previewUrl ? "text-white/75" : "text-muted-foreground")}>
          PNG, JPG or WebP <span aria-hidden>·</span> {hint}
        </span>
      </button>
      {picked ? (
        <button
          type="button"
          onClick={() => onPick(null)}
          aria-label="Remove the picked image"
          className="absolute top-2 right-2 flex size-7 cursor-pointer items-center justify-center rounded-full bg-black/45 text-white outline-none transition-colors hover:bg-black/65 focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <X aria-hidden className="size-3.5" />
        </button>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          accept(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
