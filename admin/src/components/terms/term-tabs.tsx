"use client";

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";
import type { TermStatus } from "@/types/term.types";

export type TermTab = "all" | TermStatus;

const TABS: { value: TermTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "current", label: "Current" },
  { value: "upcoming", label: "Upcoming" },
  { value: "ended", label: "Ended" },
];

interface TermTabsProps {
  value: TermTab;
  onChange: (tab: TermTab) => void;
  /** Number of terms per tab, read by screen readers. */
  counts: Record<TermTab, number>;
  className?: string;
}

/** All / Current / Upcoming / Ended, with an underline that slides to the active tab. */
export function TermTabs({ value, onChange, counts, className }: TermTabsProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  // Measure the active tab (and again when fonts load or the layout resizes).
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const tab = list.querySelector<HTMLElement>(`[data-tab="${value}"]`);
      if (tab) setIndicator({ left: tab.offsetLeft, width: tab.offsetWidth });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [value]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex((t) => t.value === value);
    const next =
      event.key === "ArrowRight" ? (index + 1) % TABS.length : event.key === "ArrowLeft" ? (index - 1 + TABS.length) % TABS.length : -1;
    if (next < 0) return;
    event.preventDefault();
    onChange(TABS[next].value);
    listRef.current?.querySelector<HTMLElement>(`[data-tab="${TABS[next].value}"]`)?.focus();
  }

  return (
    <div className={cn("border-b border-border", className)}>
      <div ref={listRef} role="tablist" aria-label="Filter terms by status" onKeyDown={onKeyDown} className="relative flex gap-7">
        {TABS.map((tab) => {
          const active = tab.value === value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              data-tab={tab.value}
              aria-selected={active}
              aria-label={`${tab.label}, ${counts[tab.value]} ${counts[tab.value] === 1 ? "term" : "terms"}`}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(tab.value)}
              className={cn(
                "relative -mb-px cursor-pointer px-1 pt-1 pb-3 text-[0.875rem] outline-none transition-colors duration-200",
                "focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-brand-blue/30",
                active ? "font-medium text-brand-blue dark:text-[#7aa7e6]" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          );
        })}
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-[-1px] h-0.5 rounded-full bg-brand-blue transition-[left,width,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none dark:bg-[#7aa7e6]"
          style={indicator ? { left: indicator.left, width: indicator.width } : { opacity: 0 }}
        />
      </div>
    </div>
  );
}
