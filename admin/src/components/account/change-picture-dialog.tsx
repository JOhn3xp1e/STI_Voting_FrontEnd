"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Check, ImagePlus, LoaderCircle, Trash2, TriangleAlert, X } from "lucide-react";

import { AdminAvatar } from "@/components/dashboard/admin-avatar";
import { dialogPrimaryClassName, dialogSecondaryClassName } from "@/components/shared/dialog-frame";
import { cn } from "@/lib/utils";
import { AVATAR_MAX_BYTES, checkAvatarFile } from "@/services/admins/admin-accounts.service";

/** The owl avatars in `public/avatars` (256px squares made from `public/images/Kape.DevAvatar`). */
export const OWL_AVATARS = Array.from({ length: 30 }, (_, i) => `/avatars/owl-${String(i + 1).padStart(2, "0")}.webp`);

/** Uploaded photos are cropped to a centred square of this size before they're sent. */
const PHOTO_SIZE = 512;

/** What Save picture does: upload this file (a photo or an avatar), or remove the picture. */
export type PictureChange = { kind: "upload"; file: File } | { kind: "remove" };

type Pending = { kind: "photo"; file: File; url: string } | { kind: "avatar"; index: number } | { kind: "remove" } | null;

interface ChangePictureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** For the initials when there's no picture. */
  name: string;
  /** The current picture, or `null`. */
  currentSrc: string | null;
  /** Saves the change; rejects with a message to show. */
  onSave: (change: PictureChange) => Promise<void>;
}

/** Centre-crops an image to a square and scales it to `PHOTO_SIZE` (smaller images keep their size). */
async function squarePhoto(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const out = Math.min(PHOTO_SIZE, side);
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, out, out);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
  if (!blob) throw new Error("no blob");
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "photo"}.webp`, { type: "image/webp" });
}

async function avatarFile(index: number): Promise<File> {
  const response = await fetch(OWL_AVATARS[index]);
  if (!response.ok) throw new Error("Couldn't load that avatar. Try again.");
  const blob = await response.blob();
  return new File([blob], `avatar-${String(index + 1).padStart(2, "0")}.webp`, { type: "image/webp" });
}

/**
 * "Change picture": upload a photo (cropped to a square here) or pick one of the owl
 * avatars, then Save picture. Nothing changes until then.
 */
export function ChangePictureDialog({ open, onOpenChange, name, currentSrc, onSave }: ChangePictureDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start fresh each time it opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPending(null);
      setError(null);
    }
  }

  // Free the photo preview's object URL when it's replaced or the dialog unmounts.
  const photoUrl = pending?.kind === "photo" ? pending.url : null;
  useEffect(() => {
    if (!photoUrl) return;
    return () => URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  const previewSrc = pending === null ? currentSrc : pending.kind === "photo" ? pending.url : pending.kind === "avatar" ? OWL_AVATARS[pending.index] : null;
  const hasPicture = previewSrc !== null;
  const busy = reading || saving;

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    const problem = checkAvatarFile(file);
    if (problem) return setError(problem);
    setReading(true);
    setError(null);
    try {
      const square = await squarePhoto(file);
      if (square.size > AVATAR_MAX_BYTES) throw new Error("too big");
      setPending({ kind: "photo", file: square, url: URL.createObjectURL(square) });
    } catch {
      setError("That image couldn't be read. Try a PNG, JPG or WEBP file.");
    } finally {
      setReading(false);
    }
  }

  async function save() {
    if (!pending || busy) return;
    setSaving(true);
    setError(null);
    try {
      if (pending.kind === "remove") await onSave({ kind: "remove" });
      else await onSave({ kind: "upload", file: pending.kind === "photo" ? pending.file : await avatarFile(pending.index) });
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : "Couldn't save your picture. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && saving) return;
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop
          data-themed
          className="fixed inset-0 z-50 bg-brand-background/30 transition-opacity duration-300 ease-out data-ending-style:opacity-0 data-starting-style:opacity-0"
        />
        <Dialog.Popup
          data-themed
          className={cn(
            "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[min(45rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden",
            "rounded-2xl border border-border bg-popover text-popover-foreground shadow-[0_40px_100px_-30px_rgb(11_18_32/0.6)] outline-none",
            "transition-[opacity,scale,translate] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)]",
            "data-starting-style:translate-y-[calc(-50%+14px)] data-starting-style:scale-[0.95] data-starting-style:opacity-0",
            "data-ending-style:translate-y-[calc(-50%+6px)] data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-ending-style:duration-200",
            "motion-reduce:transition-opacity",
          )}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 border-b border-border px-6 pt-5.5 pb-4.5">
            <div>
              <Dialog.Title className="text-[1.25rem] leading-7 font-semibold tracking-tight text-foreground">Change picture</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-[0.8125rem] text-muted-foreground">Upload a photo or select an avatar.</Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              disabled={saving}
              className={cn(
                "flex size-9.5 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-background text-foreground outline-none",
                "transition-[background-color,rotate,scale] duration-200 hover:rotate-90 hover:bg-muted active:scale-90 focus-visible:ring-3 focus-visible:ring-brand-blue/25 disabled:cursor-wait disabled:opacity-50 motion-reduce:hover:rotate-0",
              )}
            >
              <X aria-hidden className="size-4" strokeWidth={2} />
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
            {/* Photo */}
            <section aria-labelledby="picture-photo-heading" className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
              <span className="relative size-20 shrink-0 self-center sm:self-start">
                <span key={previewSrc ?? "initials"} className="block size-20 animate-in fade-in zoom-in-90 duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:zoom-in-100">
                  <AdminAvatar name={name} src={previewSrc} tone="blue" className="size-20 text-[1.25rem] ring-4 ring-brand-blue/10" />
                </span>
                {reading ? (
                  <span className="absolute inset-0 flex items-center justify-center rounded-full bg-brand-navy/55 text-white animate-in fade-in duration-200">
                    <LoaderCircle aria-hidden className="size-5 animate-spin" />
                  </span>
                ) : null}
                {pending ? (
                  <span className="absolute -right-1 -bottom-1 rounded-full border-2 border-popover bg-brand-gold px-1.5 py-px font-mono text-[0.5625rem] font-semibold tracking-wide text-brand-navy uppercase animate-in fade-in zoom-in-50 duration-300">
                    New
                  </span>
                ) : null}
              </span>
              <div className="min-w-0 flex-1">
                <h3 id="picture-photo-heading" className="text-[0.9375rem] font-semibold text-foreground">
                  Photo
                </h3>
                <p className="mt-1 text-[0.8125rem] leading-5 text-muted-foreground">
                  Use a photo that suits a school site: no weapons, violence, vulgar language, nudity or anything else that isn&apos;t appropriate.
                </p>
                <p className="mt-1 text-[0.8125rem] leading-5 text-muted-foreground">Square works best (other shapes are cropped to the centre) · PNG, JPG or WEBP · max 5 MB.</p>
                <div className="mt-3.5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={busy}
                    className={cn(dialogSecondaryClassName, "inline-flex items-center gap-2 active:scale-[0.97] motion-reduce:active:scale-100")}
                  >
                    <ImagePlus aria-hidden className="size-4" strokeWidth={1.75} />
                    Add picture
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPending(currentSrc ? { kind: "remove" } : null);
                      setError(null);
                    }}
                    disabled={busy || !hasPicture}
                    className={cn(dialogSecondaryClassName, "inline-flex items-center gap-2 hover:text-destructive active:scale-[0.97] motion-reduce:active:scale-100")}
                  >
                    <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
                    Remove picture
                  </button>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden
                  onChange={(e) => {
                    void pickPhoto(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </div>
            </section>

            <div className="my-5 h-px bg-border" />

            {/* Avatars */}
            <section aria-labelledby="picture-avatar-heading">
              <h3 id="picture-avatar-heading" className="text-[0.9375rem] font-semibold text-foreground">
                Avatar
              </h3>
              <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">Click on an avatar to select it.</p>
              <div role="radiogroup" aria-labelledby="picture-avatar-heading" className="mt-3.5 grid grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] gap-2.5">
                {OWL_AVATARS.map((src, index) => {
                  const selected = pending?.kind === "avatar" && pending.index === index;
                  return (
                    <button
                      key={src}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={`Avatar ${index + 1}`}
                      disabled={busy}
                      onClick={() => {
                        setPending(selected ? null : { kind: "avatar", index });
                        setError(null);
                      }}
                      style={{ animationDelay: `${Math.min(index, 29) * 14}ms` }}
                      className={cn(
                        "group/avatar relative aspect-square w-full max-w-13 cursor-pointer justify-self-center rounded-full outline-none",
                        "animate-in fade-in zoom-in-75 duration-400 ease-[cubic-bezier(0.34,1.56,0.64,1)] fill-mode-both motion-reduce:animate-none",
                        "transition-[scale,box-shadow] duration-200 focus-visible:ring-3 focus-visible:ring-brand-blue/40 disabled:cursor-wait",
                        selected
                          ? "scale-105 shadow-[0_0_0_2.5px_var(--color-popover),0_0_0_5px_var(--color-brand-blue),0_8px_18px_-8px_rgb(15_76_158/0.6)]"
                          : "hover:-translate-y-0.5 hover:scale-[1.06] hover:shadow-[0_8px_16px_-10px_rgb(15_23_42/0.5)] active:scale-95",
                      )}
                    >
                      {/* Plain <img>: tiny static files from /public. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" loading="lazy" decoding="async" draggable={false} className="size-full rounded-full object-cover select-none" />
                      <span
                        aria-hidden
                        className={cn(
                          "absolute -top-0.5 -right-0.5 flex size-4.5 items-center justify-center rounded-full border-2 border-popover bg-brand-blue text-white",
                          "transition-[opacity,scale] duration-250 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
                          selected ? "scale-100 opacity-100" : "scale-0 opacity-0",
                        )}
                      >
                        <Check className="size-2.5" strokeWidth={3.5} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4">
            {error ? (
              <p role="alert" className="flex min-w-0 flex-1 items-start gap-1.5 text-[0.8125rem] text-destructive animate-in fade-in slide-in-from-bottom-1 duration-200">
                <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
                {error}
              </p>
            ) : (
              <p key={pending?.kind ?? "none"} className="min-w-0 flex-1 text-[0.8125rem] text-muted-foreground animate-in fade-in duration-300">
                {pending?.kind === "remove"
                  ? "Your initials will show instead of a picture."
                  : pending
                    ? "Looks good? Save to use it everywhere."
                    : "Your picture shows in the top bar and on admin lists."}
              </p>
            )}
            <div className="flex items-center gap-2.5">
              <Dialog.Close disabled={saving} className={cn(dialogSecondaryClassName, "active:scale-[0.97] motion-reduce:active:scale-100")}>
                Cancel
              </Dialog.Close>
              <button
                type="button"
                onClick={() => void save()}
                disabled={!pending || busy}
                className={cn(dialogPrimaryClassName, "inline-flex min-w-32 items-center justify-center gap-2 active:scale-[0.97] motion-reduce:active:scale-100")}
              >
                {saving ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}
                {saving ? "Saving…" : "Save picture"}
              </button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
