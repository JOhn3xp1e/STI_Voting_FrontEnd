"use client";

import { useLayoutEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import type { StudentCategory } from "@/types/student.types";

export interface StudentTab {
  id: StudentCategory;
  label: string;
  count: number;
}

interface StudentTabsProps {
  tabs: readonly StudentTab[];
  value: StudentCategory;
  onValueChange: (value: StudentCategory) => void;
  /** id of the element the tabs control (the table). */
  controls: string;
}

/**
 * Category tabs with one blue underline that slides to the active tab.
 * The underline is positioned by writing to its style directly (measured from
 * the active tab), so moving it never re-renders the page.
 */
export function StudentTabs({ tabs, value, onValueChange, controls }: StudentTabsProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const placedRef = useRef(false);

  useLayoutEffect(() => {
    const list = listRef.current;
    const indicator = indicatorRef.current;
    if (!list || !indicator) return;

    const place = () => {
      const active = list.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!active) return;
      const first = !placedRef.current;
      // First placement: appear in place, without sliding in from the left.
      if (first) indicator.style.transition = "none";
      indicator.style.width = `${active.offsetWidth}px`;
      indicator.style.transform = `translateX(${active.offsetLeft}px)`;
      if (first) {
        placedRef.current = true;
        indicator.style.opacity = "1";
        void indicator.offsetWidth; // commit the position before re-enabling transitions
        indicator.style.transition = "";
      }
    };

    place();
    const observer = new ResizeObserver(place);
    observer.observe(list);
    return () => observer.disconnect();
  }, [value, tabs]);

  function onKeyDown(event: React.KeyboardEvent) {
    const index = tabs.findIndex((tab) => tab.id === value);
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = tabs[(index + step + tabs.length) % tabs.length];
    onValueChange(next.id);
    listRef.current?.querySelector<HTMLElement>(`[data-tab="${next.id}"]`)?.focus();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Student categories"
      onKeyDown={onKeyDown}
      className="relative mt-4.5 flex gap-6 overflow-x-auto border-b border-border [scrollbar-width:none]"
    >
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            data-tab={tab.id}
            aria-selected={selected}
            aria-controls={controls}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(tab.id)}
            className={cn(
              "flex h-11 shrink-0 cursor-pointer items-center gap-2 px-1 text-[0.875rem] whitespace-nowrap outline-none",
              "transition-colors duration-200 focus-visible:text-brand-blue",
              selected ? "font-medium text-brand-blue dark:text-[#7aa7e6]" : "text-foreground/80 hover:text-foreground",
            )}
          >
            {tab.label}
            <span
              className={cn(
                "rounded-[4px] border px-1.5 font-mono text-[0.6875rem] leading-4.25 tabular-nums transition-colors duration-200",
                selected
                  ? "border-brand-blue/15 bg-brand-blue/8 text-brand-blue dark:border-white/10 dark:bg-white/8 dark:text-[#9dbdeb]"
                  : "border-border text-muted-foreground",
              )}
            >
              {tab.count}
            </span>
          </button>
        );
      })}
      <span
        ref={indicatorRef}
        aria-hidden
        style={{ opacity: 0 }}
        className="pointer-events-none absolute bottom-0 left-0 h-0.5 rounded-full bg-brand-blue transition-[transform,width] duration-350 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none dark:bg-[#7aa7e6]"
      />
    </div>
  );
}
