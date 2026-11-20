"use client";

import { useState, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

import { ctaButtonClassName, outlineButtonClassName } from "@/components/elections/create/create-election-ui";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/services/api/error-message";

interface StatusActionProps {
  /** The button, e.g. "Schedule election". */
  label: string;
  icon?: ReactNode;
  /** "primary" dark, "outline", or "danger" (red outline). */
  variant?: "primary" | "outline" | "danger";
  /** What will happen, shown before it's confirmed. */
  confirmTitle: string;
  confirmBody: ReactNode;
  confirmLabel: string;
  disabled?: boolean;
  /** Does it; rejects with an error whose message is shown in place. */
  onConfirm: () => Promise<void>;
  className?: string;
}

const dangerClassName = cn(outlineButtonClassName, "border-destructive/35 text-destructive hover:border-destructive/50 hover:bg-destructive/6 dark:border-destructive/45");

/**
 * A button that asks before it acts: clicking it unfolds a short "are you sure"
 * panel in place (no dialog), with the reason shown there if the server refuses.
 */
export function StatusAction({ label, icon, variant = "primary", confirmTitle, confirmBody, confirmLabel, disabled, onConfirm, className }: StatusActionProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buttonClassName = variant === "primary" ? ctaButtonClassName : variant === "danger" ? dangerClassName : outlineButtonClassName;

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      setOpen(false);
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      {open ? null : (
        <button type="button" disabled={disabled} onClick={() => setOpen(true)} className={cn(buttonClassName, "w-full justify-between disabled:cursor-not-allowed disabled:opacity-50")}>
          {label}
          {icon}
        </button>
      )}

      {/* The confirm panel unfolds (grid rows 0fr → 1fr) where the button was. */}
      <div
        aria-hidden={!open}
        inert={!open}
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            role="alertdialog"
            aria-label={confirmTitle}
            className={cn(
              "rounded-[0.375rem] border px-3.5 py-3",
              variant === "danger" ? "border-destructive/30 bg-destructive/5" : "border-[#d5dbe3] bg-[#f8fafc] dark:border-border dark:bg-white/4",
            )}
          >
            <p className="text-[0.8125rem] font-semibold text-foreground">{confirmTitle}</p>
            <div className="mt-1 text-[0.75rem] leading-4.5 text-muted-foreground">{confirmBody}</div>
            {error ? (
              <p role="alert" className="mt-2 text-[0.75rem] leading-4.5 text-destructive animate-in fade-in slide-in-from-top-1 duration-300 motion-reduce:animate-none">
                {error}
              </p>
            ) : null}
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  setError(null);
                }}
                className={cn(outlineButtonClassName, "h-8 px-3 text-[0.8125rem]")}
              >
                Not now
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirm()}
                className={cn(
                  variant === "danger" ? cn(ctaButtonClassName, "bg-destructive hover:bg-destructive/90 dark:bg-destructive dark:text-white") : ctaButtonClassName,
                  "h-8 px-3 text-[0.8125rem]",
                )}
              >
                {busy ? <LoaderCircle aria-hidden className="mr-1.5 size-3.5 animate-spin" /> : null}
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
