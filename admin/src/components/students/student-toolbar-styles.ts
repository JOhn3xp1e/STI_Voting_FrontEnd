import { cn } from "@/lib/utils";

/** Outlined control shared by the toolbar buttons, the Filters trigger and dialog buttons. */
export const toolbarButtonClassName = cn(
  "inline-flex h-8.5 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-3 text-[0.84375rem] text-foreground/85 outline-none",
  "transition-[background-color,border-color,color,box-shadow] duration-200 ease-out",
  "hover:border-[color-mix(in_oklab,var(--color-brand-muted)_38%,transparent)] hover:bg-muted/60 hover:text-foreground",
  "focus-visible:border-brand-blue/60 focus-visible:ring-3 focus-visible:ring-brand-blue/15",
  "data-popup-open:border-brand-blue/40 data-popup-open:ring-3 data-popup-open:ring-brand-blue/10",
);

/** Dark filled call-to-action (Add student, Apply). */
export const primaryButtonClassName = cn(
  "inline-flex h-8.5 shrink-0 cursor-pointer items-center justify-center rounded-md bg-primary px-4 text-[0.84375rem] font-semibold text-primary-foreground outline-none",
  "transition-[background-color,box-shadow,translate] duration-200 ease-out",
  "hover:-translate-y-px hover:bg-[color-mix(in_oklab,var(--color-brand-navy)_86%,var(--color-brand-blue))] hover:shadow-[0_8px_18px_-10px_var(--color-brand-blue)]",
  "focus-visible:ring-3 focus-visible:ring-brand-blue/30 active:translate-y-0 motion-reduce:hover:translate-y-0 dark:hover:bg-white/90",
);
