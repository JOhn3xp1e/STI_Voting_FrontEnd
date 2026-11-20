"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Plus, RotateCw, Search, X } from "lucide-react";

import { textOn } from "@/lib/programs";
import { cn } from "@/lib/utils";
import type { CareerOption, FacetFilters } from "@/types/student.types";

import { AnimatedNumber } from "./animated-number";
import { FilterPopover } from "./filter-popover";
import { primaryButtonClassName, toolbarButtonClassName } from "./student-toolbar-styles";

interface StudentToolbarProps {
  query: string;
  onQueryChange: (query: string) => void;
  facets: FacetFilters;
  onFacetsChange: (facets: FacetFilters) => void;
  countMatches: (draft: FacetFilters) => number;
  careers: readonly CareerOption[];
  /** Students per career code, plus the total. */
  careerCounts: { total: number; byCareer: Readonly<Record<string, number>> };
  career: string | null;
  onCareerChange: (career: string | null) => void;
  refreshing: boolean;
  onRefresh: () => void;
  onImport: () => void;
  onAddStudent: () => void;
  className?: string;
}

/** Search, Filters, the career switch, Import CSV, Refresh and Add student. */
export function StudentToolbar({
  query,
  onQueryChange,
  facets,
  onFacetsChange,
  countMatches,
  careers,
  careerCounts,
  career,
  onCareerChange,
  refreshing,
  onRefresh,
  onImport,
  onAddStudent,
  className,
}: StudentToolbarProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2.5", className)}>
      <div className="relative min-w-0 flex-1 sm:w-60 sm:flex-none">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.25 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && query) {
              event.preventDefault();
              onQueryChange("");
            }
          }}
          placeholder="Search name or student no."
          aria-label="Search students by name or student number"
          className={cn(
            "h-8.5 w-full rounded-md border border-border bg-background pl-8.75 text-[0.875rem] text-foreground outline-none placeholder:text-muted-foreground",
            query ? "pr-8" : "pr-2",
            "transition-[border-color,box-shadow] duration-200 hover:border-[color-mix(in_oklab,var(--color-brand-muted)_38%,transparent)]",
            "focus:border-brand-blue/60 focus:ring-3 focus:ring-brand-blue/15 [&::-webkit-search-cancel-button]:hidden",
          )}
        />
        <button
          type="button"
          aria-label="Clear search"
          tabIndex={query ? 0 : -1}
          aria-hidden={!query}
          onClick={() => onQueryChange("")}
          className={cn(
            "absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-muted-foreground",
            "transition-[opacity,scale,background-color,color] duration-200 hover:bg-muted hover:text-foreground",
            query ? "scale-100 opacity-100" : "pointer-events-none scale-75 opacity-0",
          )}
        >
          <X aria-hidden className="size-3.5" />
        </button>
      </div>

      <FilterPopover value={facets} onApply={onFacetsChange} countMatches={countMatches} />

      {careers.length > 1 ? <CareerSwitch careers={careers} counts={careerCounts} value={career} onChange={onCareerChange} /> : null}

      <div className="flex w-full items-center gap-2.5 sm:ml-auto sm:w-auto">
        <button type="button" onClick={onImport} className={cn(toolbarButtonClassName, "gap-2 px-3.5")}>
          <Plus aria-hidden className="size-4" strokeWidth={1.75} />
          Import CSV (upsert)
        </button>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Refresh"
          title="Refresh"
          className={cn(toolbarButtonClassName, "w-8.5 justify-center px-0 disabled:cursor-wait")}
        >
          <RotateCw aria-hidden className={cn("size-4", refreshing && "animate-spin motion-reduce:animate-none")} strokeWidth={1.75} />
        </button>
        <button type="button" onClick={onAddStudent} className={primaryButtonClassName}>
          + Add student
        </button>
      </div>
    </div>
  );
}

/** "All · 1,696 | TER 1,284 | SHS 412": a white pill slides to the chosen career. */
function CareerSwitch({
  careers,
  counts,
  value,
  onChange,
}: {
  careers: readonly CareerOption[];
  counts: { total: number; byCareer: Readonly<Record<string, number>> };
  value: string | null;
  onChange: (career: string | null) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  const key = value ?? "__all__";

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const active = list.querySelector<HTMLElement>(`[data-career="${CSS.escape(key)}"]`);
      if (active) setPill({ left: active.offsetLeft, width: active.offsetWidth });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [key, careers.length]);

  const options = [{ code: "__all__", label: "All", color: null as string | null, count: counts.total }, ...careers.map((c) => ({ code: c.code, label: c.code, color: c.color, count: counts.byCareer[c.code] ?? 0 }))];

  return (
    <div ref={listRef} role="radiogroup" aria-label="Career" className="relative flex h-8.5 items-center rounded-lg bg-muted/80 p-0.75 dark:bg-white/6">
      <span
        aria-hidden
        className="absolute inset-y-0.75 rounded-md bg-background shadow-[0_1px_2px_rgb(15_23_42/0.08),0_4px_10px_-6px_rgb(15_23_42/0.3)] transition-[left,width,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none dark:bg-white/12"
        style={pill ? { left: pill.left, width: pill.width } : { opacity: 0 }}
      />
      {options.map((option) => {
        const checked = option.code === key;
        return (
          <button
            key={option.code}
            type="button"
            role="radio"
            aria-checked={checked}
            data-career={option.code}
            onClick={() => onChange(option.code === "__all__" ? null : option.code)}
            className={cn(
              "relative z-10 flex h-full cursor-pointer items-center gap-2 rounded-md px-2.5 text-[0.8125rem] whitespace-nowrap outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-brand-blue/30",
              checked ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.color ? (
              <span className="inline-flex h-4.5 items-center rounded px-1.5 font-mono text-[0.625rem] leading-none font-medium tracking-[0.04em]" style={{ backgroundColor: option.color, color: textOn(option.color) }}>
                {option.label}
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <span className={cn("font-medium", checked && "font-semibold")}>{option.label}</span>
                <span aria-hidden className="text-muted-foreground">·</span>
              </span>
            )}
            <AnimatedNumber value={option.count} className="tabular-nums" />
          </button>
        );
      })}
    </div>
  );
}
