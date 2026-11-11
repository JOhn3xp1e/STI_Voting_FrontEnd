"use client";

import { useState, type ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";

import { DialogCancel, DialogFrame, useLastValue } from "./dialog-frame";
import styles from "./motion.module.css";

interface ConfirmDeleteDialogProps<T> {
  /** The item to delete; `null` closes the dialog. */
  item: T | null;
  /** Stable key, so an error message doesn't carry over to another item. */
  getKey: (item: T) => string;
  /** e.g. "Delete BSCpE?" */
  title: (item: T) => string;
  description: (item: T) => ReactNode;
  /** One-line summary in the bordered box, e.g. "PRG-00024 · BS Computer Engineering". */
  summary: (item: T) => string;
  /** When true, the Delete button is disabled (e.g. the item is still in use). */
  blocked?: (item: T) => boolean;
  confirmLabel: string;
  onClose: () => void;
  /** Deletes; rejects with a user-facing message. */
  onConfirm: (item: T) => Promise<void>;
}

/** Red trash badge, "Delete X?", why it can or can't be deleted, and a summary box. */
export function ConfirmDeleteDialog<T>({
  item,
  getKey,
  title,
  description,
  summary,
  blocked,
  confirmLabel,
  onClose,
  onConfirm,
}: ConfirmDeleteDialogProps<T>) {
  const shown = useLastValue(item);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorFor, setErrorFor] = useState<string | null>(item ? getKey(item) : null);
  if (item && getKey(item) !== errorFor) {
    setErrorFor(getKey(item));
    setError(null);
  }

  const isBlocked = shown ? (blocked?.(shown) ?? false) : false;

  async function confirm() {
    if (!shown || deleting || isBlocked) return;
    setDeleting(true);
    setError(null);
    try {
      await onConfirm(shown);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't delete it. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <DialogFrame open={item !== null} onOpenChange={(open) => !open && onClose()} locked={deleting} widthClassName="w-[min(30rem,calc(100vw-2rem))]">
      {shown ? (
        <>
          <div className="px-6 pt-6 pb-5">
            <span className={cn("flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive", styles.trashIn)}>
              <Trash2 aria-hidden className="size-4.5" strokeWidth={1.9} />
            </span>
            <Dialog.Title className="mt-4 text-[1.375rem] leading-7 font-semibold tracking-tight text-foreground">{title(shown)}</Dialog.Title>
            <Dialog.Description className="mt-2.5 text-[0.875rem] leading-5 text-muted-foreground">{description(shown)}</Dialog.Description>
            <p className="mt-4 rounded-md border border-border px-3 py-2.5 font-mono text-[0.75rem] text-foreground">{summary(shown)}</p>
            {error ? (
              <p role="alert" className={cn("mt-3 rounded-md bg-destructive/8 px-3 py-2 text-[0.8125rem] text-destructive", styles.fieldError)}>
                {error}
              </p>
            ) : null}
          </div>
          <div className="flex justify-end gap-2.5 border-t border-border px-6 py-4">
            <DialogCancel disabled={deleting} />
            <button
              type="button"
              disabled={deleting || isBlocked}
              onClick={() => void confirm()}
              className="h-9 cursor-pointer rounded-md bg-[#b42318] px-4 text-[0.875rem] font-semibold text-white outline-none transition-[background-color,opacity] duration-200 hover:bg-[#9a1d14] focus-visible:ring-3 focus-visible:ring-destructive/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleting ? "Deleting…" : confirmLabel}
            </button>
          </div>
        </>
      ) : null}
    </DialogFrame>
  );
}
