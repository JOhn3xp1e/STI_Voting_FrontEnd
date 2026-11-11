import { cn } from "@/lib/utils";

/** Text input / select trigger in the New term card and the Edit term dialog. */
export const fieldClassName = cn(
  "flex h-10 w-full items-center rounded-md border border-border bg-background px-3 text-left text-[0.875rem] text-foreground outline-none",
  "placeholder:text-muted-foreground/90",
  "transition-[border-color,box-shadow,background-color] duration-200 hover:border-[color-mix(in_oklab,var(--color-brand-muted)_38%,transparent)]",
  "focus:border-brand-blue/60 focus:ring-3 focus:ring-brand-blue/15 focus-visible:border-brand-blue/60 focus-visible:ring-3 focus-visible:ring-brand-blue/15",
  "data-popup-open:border-brand-blue/60 data-popup-open:ring-3 data-popup-open:ring-brand-blue/15",
  "aria-invalid:border-destructive/60 aria-invalid:focus:ring-destructive/15",
  "disabled:cursor-not-allowed disabled:bg-muted/40 disabled:text-muted-foreground disabled:hover:border-border",
);

export const labelClassName = "mb-1.5 block text-[0.75rem] leading-4 font-semibold text-foreground";

export const errorClassName = "mt-1 text-[0.6875rem] leading-4 text-destructive";

/** Small mono uppercase heading (card titles, table headers). */
export const eyebrowClassName = "font-mono text-[0.6875rem] font-semibold tracking-[0.14em] text-foreground uppercase";
