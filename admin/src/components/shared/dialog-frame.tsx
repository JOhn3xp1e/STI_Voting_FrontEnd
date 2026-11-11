"use client";

import { useRef, useState, type ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";

import { toolbarButtonClassName } from "@/components/students/student-toolbar-styles";
import { cn } from "@/lib/utils";

/** Dark filled dialog action (Save changes, Create …). */
export const dialogPrimaryClassName = cn(
  "h-9 cursor-pointer rounded-md bg-primary px-4 text-[0.875rem] font-semibold text-primary-foreground outline-none",
  "transition-[background-color,opacity,translate] duration-200 hover:bg-[color-mix(in_oklab,var(--color-brand-navy)_86%,var(--color-brand-blue))]",
  "focus-visible:ring-3 focus-visible:ring-brand-blue/30 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/90",
);

/** Outlined dialog action (Cancel). */
export const dialogSecondaryClassName = cn(
  toolbarButtonClassName,
  "h-9 px-4 text-[0.875rem] font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-50",
);

/** Red text action on the left of a dialog footer (Delete …). */
export const dialogDangerLinkClassName = cn(
  "-ml-1 cursor-pointer rounded-md px-1 text-[0.875rem] font-medium text-destructive outline-none transition-colors",
  "hover:text-[color-mix(in_oklab,var(--color-destructive)_80%,black)] focus-visible:ring-2 focus-visible:ring-destructive/30 disabled:cursor-not-allowed disabled:opacity-50",
);

interface DialogFrameProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Blocks closing (Escape, backdrop, ×) while saving. */
  locked?: boolean;
  /** e.g. `w-[min(35rem,calc(100vw-2rem))]` */
  widthClassName: string;
  children: ReactNode;
}

/** Centered modal with a soft rise-and-scale entrance, used by every edit / delete dialog. */
export function DialogFrame({ open, onOpenChange, locked = false, widthClassName, children }: DialogFrameProps) {
  // Focus the dialog itself on open (not the × button); Tab then reaches the fields.
  const popupRef = useRef<HTMLDivElement>(null);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && locked) return;
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop
          data-themed
          className="fixed inset-0 z-50 bg-brand-background/45 backdrop-blur-[1.5px] transition-opacity duration-250 ease-out data-ending-style:opacity-0 data-starting-style:opacity-0"
        />
        <Dialog.Popup
          ref={popupRef}
          data-themed
          initialFocus={popupRef}
          className={cn(
            "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto",
            "rounded-xl border border-border bg-popover text-popover-foreground shadow-[0_28px_70px_-22px_rgb(11_18_32/0.5)] outline-none",
            "transition-[opacity,scale,translate] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)]",
            "data-starting-style:translate-y-[calc(-50%+8px)] data-starting-style:scale-[0.96] data-starting-style:opacity-0",
            "data-ending-style:translate-y-[calc(-50%+4px)] data-ending-style:scale-[0.97] data-ending-style:opacity-0",
            "motion-reduce:transition-opacity",
            widthClassName,
          )}
        >
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** "TERM · TRM-00005" eyebrow, big title, optional description and the × button. */
export function DialogHeading({
  eyebrow,
  title,
  description,
  srDescription,
  closeDisabled,
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  /** Description for screen readers only. */
  srDescription?: string;
  closeDisabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border px-6 pt-5 pb-4.5">
      <div>
        <p className="font-mono text-[0.6875rem] tracking-[0.12em] text-muted-foreground uppercase">{eyebrow}</p>
        <Dialog.Title className="mt-1 text-[1.375rem] leading-7 font-semibold tracking-tight text-foreground">{title}</Dialog.Title>
        {description ? (
          <Dialog.Description className="mt-1.5 text-[0.8125rem] leading-5 text-muted-foreground">{description}</Dialog.Description>
        ) : srDescription ? (
          <Dialog.Description className="sr-only">{srDescription}</Dialog.Description>
        ) : null}
      </div>
      <Dialog.Close
        aria-label="Close"
        disabled={closeDisabled}
        className="-mr-1.5 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-wait disabled:opacity-50"
      >
        <X aria-hidden className="size-4" />
      </Dialog.Close>
    </div>
  );
}

/** `Dialog.Close` styled as the outlined Cancel button. */
export function DialogCancel({ disabled }: { disabled?: boolean }) {
  return (
    <Dialog.Close disabled={disabled} className={dialogSecondaryClassName}>
      Cancel
    </Dialog.Close>
  );
}

/** Keeps showing the last non-null value while a dialog animates closed. */
export function useLastValue<T>(value: T | null): T | null {
  const [last, setLast] = useState(value);
  if (value !== null && value !== last) setLast(value);
  return value ?? last;
}
