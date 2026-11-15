"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import { Dialog } from "@base-ui/react/dialog";

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

/** Mascot in a trash can, "Delete X?", why it can or can't be deleted, and a summary box. Every delete confirmation uses it. */
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
    <DialogFrame open={item !== null} onOpenChange={(open) => !open && onClose()} locked={deleting} widthClassName="w-[min(33rem,calc(100vw-2rem))]">
      {shown ? (
        <>
          <div className="px-6 pt-5 pb-6">
            <Image
              src="/images/deletemascot.png"
              alt=""
              width={70}
              height={91}
              className={cn("h-22.75 w-auto origin-bottom select-none", styles.trashIn)}
              draggable={false}
            />
            <Dialog.Title className="mt-3.5 text-[1.5rem] leading-8 font-semibold tracking-tight text-foreground">{title(shown)}</Dialog.Title>
            <Dialog.Description className="mt-2.5 text-[0.9375rem] leading-5.5 text-muted-foreground">{description(shown)}</Dialog.Description>
            <p className="mt-4 truncate rounded-lg border border-border px-3.5 py-3 text-[0.875rem] text-foreground">{summary(shown)}</p>
            {error ? (
              <p role="alert" className={cn("mt-3 rounded-md bg-destructive/8 px-3 py-2 text-[0.8125rem] text-destructive", styles.fieldError)}>
                {error}
              </p>
            ) : null}
          </div>
          <div className="flex justify-end gap-3 border-t border-border px-6 py-4.5">
            <DialogCancel disabled={deleting} />
            <button
              type="button"
              disabled={deleting || isBlocked}
              onClick={() => void confirm()}
              className="h-9 cursor-pointer rounded-lg bg-[#b42318] px-5 text-[0.875rem] font-semibold text-white outline-none transition-[background-color,opacity] duration-200 hover:bg-[#9a1d14] focus-visible:ring-3 focus-visible:ring-destructive/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleting ? "Deleting…" : confirmLabel}
            </button>
          </div>
        </>
      ) : null}
    </DialogFrame>
  );
}
