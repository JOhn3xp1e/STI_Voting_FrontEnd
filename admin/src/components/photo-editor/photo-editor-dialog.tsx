"use client";

import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";

import { useLastValue } from "@/components/shared/dialog-frame";
import { cn } from "@/lib/utils";

import { PhotoEditor, type PhotoEditorProps } from "./photo-editor";

/** What the editor is opened with. A new `id` starts a fresh editor. */
export interface PhotoEditorRequest {
  id: number;
  photo: File | string | null;
}

interface PhotoEditorDialogProps extends Pick<PhotoEditorProps, "title" | "preview" | "saveLabel"> {
  request: PhotoEditorRequest | null;
  onClose: () => void;
  /** Gets the finished PNG; reject with a readable message to keep the editor open and show it. */
  onSave: (file: File) => Promise<void>;
}

/**
 * The photo editor in a floating modal that fills the window (with a small margin).
 * Can be opened from inside another dialog (Base UI nests them).
 */
export function PhotoEditorDialog({ request, onClose, onSave, ...editorProps }: PhotoEditorDialogProps) {
  const [saving, setSaving] = useState(false);
  // Keep the editor on screen while the modal animates out.
  const shown = useLastValue(request);

  async function save(file: File) {
    setSaving(true);
    try {
      await onSave(file);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog.Root
      open={request !== null}
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop
          data-themed
          className="fixed inset-0 z-50 bg-brand-navy/55 backdrop-blur-[2px] transition-opacity duration-250 ease-out data-ending-style:opacity-0 data-starting-style:opacity-0"
        />
        <Dialog.Popup
          data-themed
          className={cn(
            "fixed inset-2 z-50 flex flex-col overflow-y-auto rounded-2xl border border-[#e4e8f0] bg-white text-brand-navy shadow-[0_32px_80px_-24px_rgb(11_18_32/0.6)] outline-none sm:inset-4 lg:overflow-hidden",
            "transition-[opacity,scale,translate] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)]",
            "data-starting-style:translate-y-2 data-starting-style:scale-[0.98] data-starting-style:opacity-0",
            "data-ending-style:translate-y-1 data-ending-style:scale-[0.985] data-ending-style:opacity-0",
            "motion-reduce:transition-opacity",
          )}
        >
          <Dialog.Title className="sr-only">{editorProps.title ?? "Photo editor"}</Dialog.Title>
          {shown ? <PhotoEditor key={shown.id} mode="dialog" initialPhoto={shown.photo} onSave={save} onClose={onClose} {...editorProps} /> : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
