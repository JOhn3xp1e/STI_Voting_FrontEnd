"use client";

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";

export interface UnderlineTab<T extends string> {
  value: T;
  label: string;
  /** Read by screen readers, e.g. "3 terms". */
  description?: string;
}

interface UnderlineTabsProps<T extends string> {
  tabs: readonly UnderlineTab<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the tab list. */
  label: string;
  className?: string;
  /** Extra classes for the tab list, e.g. a different `gap-*`. */
  listClassName?: string;
}

/** Text tabs with an underline that slides to the active tab (arrow keys move between tabs). */
export function UnderlineTabs<T extends string>({ tabs, value, onChange, label, className, listClassName }: UnderlineTabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  const tabKey = tabs.map((t) => t.value).join("|");

  // Measure the active tab (and again when fonts load or the layout resizes).
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const tab = list.querySelector<HTMLElement>(`[data-tab="${CSS.escape(value)}"]`);
      if (tab) setIndicator({ left: tab.offsetLeft, width: tab.offsetWidth });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [value, tabKey]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((t) => t.value === value);
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step || index < 0) return;
    event.preventDefault();
    const next = tabs[(index + step + tabs.length) % tabs.length];
    onChange(next.value);
    listRef.current?.querySelector<HTMLElement>(`[data-tab="${CSS.escape(next.value)}"]`)?.focus();
  }

  return (
    <div className={cn("border-b border-border", className)}>
      <div ref={listRef} role="tablist" aria-label={label} onKeyDown={onKeyDown} className={cn("relative flex gap-7 overflow-x-auto [scrollbar-width:none]", listClassName)}>
        {tabs.map((tab) => {
          const active = tab.value === value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              data-tab={tab.value}
              aria-selected={active}
              aria-label={tab.description ? `${tab.label}, ${tab.description}` : undefined}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(tab.value)}
              className={cn(
                "relative -mb-px shrink-0 cursor-pointer px-1 pt-1 pb-3 text-[0.875rem] whitespace-nowrap outline-none transition-colors duration-200",
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
          className="pointer-events-none absolute bottom-0 h-0.5 rounded-full bg-brand-blue transition-[left,width,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none dark:bg-[#7aa7e6]"
          style={indicator ? { left: indicator.left, width: indicator.width } : { opacity: 0 }}
        />
      </div>
    </div>
  );
}
