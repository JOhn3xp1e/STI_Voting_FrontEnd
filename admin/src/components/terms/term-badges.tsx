"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import type { TermStatus } from "@/types/term.types";

import styles from "@/components/shared/motion.module.css";

const STATUS_PILL: Record<TermStatus, { label: string; className: string }> = {
  upcoming: { label: "Upcoming", className: "bg-brand-gold text-brand-navy" },
  current: { label: "Current", className: "bg-primary text-primary-foreground" },
  ended: { label: "Ended", className: "border border-border text-muted-foreground" },
};

/** UPCOMING (gold) / CURRENT (dark) / ENDED (outlined); pops when the status changes. */
export function TermStatusPill({ status }: { status: TermStatus }) {
  const [shown, setShown] = useState(status);
  const [changed, setChanged] = useState(false);
  if (status !== shown) {
    setShown(status);
    setChanged(true);
  }
  const pill = STATUS_PILL[status];
  return (
    <span
      key={status}
      className={cn(
        "inline-flex h-5 items-center rounded-[3px] px-1.75 font-mono text-[0.5625rem] leading-none font-semibold tracking-[0.08em] whitespace-nowrap uppercase",
        "transition-colors duration-300",
        pill.className,
        changed && styles.pillPop,
      )}
    >
      {pill.label}
    </span>
  );
}

/** Round "T1" / "T2" marker in front of a term's title. */
export function TermNumberBadge({ termNumber }: { termNumber: number }) {
  return (
    <span
      aria-hidden
      className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-background font-mono text-[0.5625rem] font-medium text-muted-foreground transition-[border-color,color] duration-200 group-hover/row:border-[color-mix(in_oklab,var(--color-brand-muted)_40%,transparent)] group-hover/row:text-foreground/80"
    >
      T{termNumber}
    </span>
  );
}
