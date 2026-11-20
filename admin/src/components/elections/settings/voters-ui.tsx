"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, FlaskConical } from "lucide-react";

import { AnimatedNumber } from "@/components/students/animated-number";
import { EMAIL_LABEL, VOTE_LABEL } from "@/lib/voters";
import { cn } from "@/lib/utils";
import type { EmailStatus, VoteStatus } from "@/services/voters/voters.service";

/* --------------------------------- Chips ---------------------------------- */

const chip = "inline-flex h-5.5 items-center gap-1.5 rounded-[0.25rem] px-2 font-mono text-[0.625rem] font-semibold tracking-[0.08em] whitespace-nowrap uppercase";

const EMAIL_CHIP: Record<EmailStatus, string> = {
  not_sent: "border border-[#d5dbe3] text-muted-foreground dark:border-border",
  queued: "bg-brand-gold text-brand-navy",
  sending: "bg-brand-gold text-brand-navy",
  sent: "bg-brand-navy text-white dark:bg-white dark:text-brand-navy",
  delivered: "bg-[#16a34a] text-white",
  bounced: "bg-[#fee2e2] text-[#dc2626] dark:bg-destructive/20",
  complained: "bg-[#fee2e2] text-[#dc2626] dark:bg-destructive/20",
  failed: "bg-[#fee2e2] text-[#dc2626] dark:bg-destructive/20",
  cancelled: "border border-[#d5dbe3] text-muted-foreground dark:border-border",
};

export function EmailChip({ status }: { status: EmailStatus }) {
  const moving = status === "queued" || status === "sending";
  return (
    <span key={status} className={cn(chip, EMAIL_CHIP[status], "animate-in fade-in zoom-in-95 duration-300 motion-reduce:animate-none")}>
      {moving ? (
        <span aria-hidden className="relative flex size-1.5">
          <span className="absolute inset-0 animate-ping rounded-full bg-current opacity-60 motion-reduce:animate-none" />
          <span className="relative size-1.5 rounded-full bg-current" />
        </span>
      ) : null}
      {EMAIL_LABEL[status]}
    </span>
  );
}

const VOTE_CHIP: Record<VoteStatus, string> = {
  empty: "border border-[#d5dbe3] text-muted-foreground dark:border-border",
  draft: "bg-brand-gold text-brand-navy",
  completed: "bg-[#22c55e] text-white",
};

export function VoteChip({ status }: { status: VoteStatus }) {
  return (
    <span className={cn(chip, VOTE_CHIP[status])}>
      {status === "draft" ? <span aria-hidden className="size-1.5 rounded-full bg-current" /> : null}
      {VOTE_LABEL[status]}
    </span>
  );
}

export function ActiveChip({ active }: { active: boolean }) {
  return (
    <span className={cn(chip, active ? "border border-brand-blue/40 text-brand-blue dark:border-[#7aa7e6]/40 dark:text-[#7aa7e6]" : "border border-[#d5dbe3] text-muted-foreground dark:border-border")}>
      {active ? "Active" : "Inactive"}
    </span>
  );
}

/* ------------------------------ Filter tabs ------------------------------- */

export interface FilterTab<T extends string> {
  value: T;
  label: string;
  count: number;
}

/** "All 1,284 | Sent 873 | …": counts in small boxes, an underline that slides to the active tab. */
export function FilterTabs<T extends string>({ tabs, value, onChange, label }: { tabs: readonly FilterTab<T>[]; value: T; onChange: (value: T) => void; label: string }) {
  const listRef = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const tab = list.querySelector<HTMLElement>(`[data-tab="${CSS.escape(value)}"]`);
      if (tab) setBar({ left: tab.offsetLeft, width: tab.offsetWidth });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [value, tabs.length]);

  return (
    <div ref={listRef} role="tablist" aria-label={label} className="relative flex gap-5 overflow-x-auto pb-2.5 [scrollbar-width:none]">
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            data-tab={tab.value}
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              "flex shrink-0 cursor-pointer items-center gap-2 rounded-sm text-[0.875rem] whitespace-nowrap outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-brand-blue/30",
              active ? "font-medium text-brand-blue dark:text-[#7aa7e6]" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            <span
              className={cn(
                "rounded-[0.1875rem] border px-1.5 font-mono text-[0.6875rem] leading-4.5 tabular-nums transition-colors duration-200",
                active ? "border-brand-blue/35 text-brand-blue dark:border-[#7aa7e6]/40 dark:text-[#7aa7e6]" : "border-[#e2e8f0] dark:border-border",
              )}
            >
              <AnimatedNumber value={tab.count} />
            </span>
          </button>
        );
      })}
      <span
        aria-hidden
        className="absolute bottom-0 h-0.5 rounded-full bg-brand-blue transition-[left,width,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none dark:bg-[#7aa7e6]"
        style={bar ? { left: bar.left, width: bar.width } : { opacity: 0 }}
      />
    </div>
  );
}

/* ---------------------------------- Pager ---------------------------------- */

export const PAGE_SIZE = 50;

export function Pager({ page, total, onPage, noun }: { page: number; total: number; onPage: (page: number) => void; noun: string }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total ? page * PAGE_SIZE + 1 : 0;
  const to = Math.min(total, (page + 1) * PAGE_SIZE);
  const button = "flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand-blue/30 disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent";
  return (
    <div className="flex items-center justify-between gap-3 border-t border-[#e2e8f0] px-3.5 py-2.5 text-[0.75rem] text-muted-foreground dark:border-border">
      <p>
        Showing {from.toLocaleString("en-US")}–{to.toLocaleString("en-US")} of {total.toLocaleString("en-US")} {noun}
      </p>
      {pages > 1 ? (
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Previous page" disabled={page === 0} onClick={() => onPage(page - 1)} className={button}>
            <ChevronLeft aria-hidden className="size-4" />
          </button>
          <span className="min-w-14 text-center tabular-nums">
            {page + 1} / {pages}
          </span>
          <button type="button" aria-label="Next page" disabled={page >= pages - 1} onClick={() => onPage(page + 1)} className={button}>
            <ChevronRight aria-hidden className="size-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* --------------------------------- Bits ------------------------------------ */

/** "AA" from "Agripa, Angela". */
export function initials(name: string | null): string {
  if (!name) return "?";
  const [last = "", first = ""] = name.split(",").map((s) => s.trim());
  return `${last[0] ?? ""}${first[0] ?? ""}`.toUpperCase() || "?";
}

export function Avatar({ name, className }: { name: string | null; className?: string }) {
  return (
    <span aria-hidden className={cn("flex size-8 shrink-0 items-center justify-center rounded-full border border-[#e2e8f0] bg-[#f5f7fa] font-mono text-[0.6875rem] font-semibold text-muted-foreground dark:border-border dark:bg-white/5", className)}>
      {initials(name)}
    </span>
  );
}

export function SectionLabel({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="font-mono text-[0.6875rem] font-semibold tracking-[0.16em] text-foreground uppercase">{children}</h2>
      {aside}
    </div>
  );
}

/** Shown once the server says it's only pretending to send (dry run). */
export function TestModeBanner() {
  return (
    <p role="status" className="flex items-start gap-2.5 rounded-[0.375rem] border border-[#c7d2fe] bg-[#eef2ff] px-4 py-3 text-[0.8125rem] leading-5 text-[#3730a3] animate-in fade-in slide-in-from-top-1 duration-300 dark:border-[#818cf8]/30 dark:bg-[#818cf8]/10 dark:text-[#c7d2fe] motion-reduce:animate-none">
      <FlaskConical aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>
        <strong className="font-semibold">Test mode:</strong> the server isn&apos;t really sending emails yet (dry run). Statuses update as if they were sent, but no student
        receives one. Turn off <code className="font-mono text-[0.75rem]">VOTER_EMAILS_DRY_RUN</code> on the server to email students for real.
      </span>
    </p>
  );
}

/** Thin progress bar that eases to its width. */
export function Progress({ value, tone = "blue" }: { value: number; tone?: "blue" | "gold" | "green" }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-[#e3e8ef] dark:bg-white/10">
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]",
          tone === "gold" ? "bg-brand-gold" : tone === "green" ? "bg-[#22c55e]" : "bg-brand-blue dark:bg-[#7aa7e6]",
        )}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}
