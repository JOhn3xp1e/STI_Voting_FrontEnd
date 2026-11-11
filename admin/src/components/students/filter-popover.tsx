"use client";

import { useState, type ReactNode } from "react";
import { Popover } from "@base-ui/react/popover";
import { Check, Funnel } from "lucide-react";

import { popupClassName } from "@/components/dashboard/popup-styles";
import { CURRENT_TERM, PROGRAMS, TERMS, YEAR_LEVELS } from "@/lib/mock/students.mock";
import { NO_FACETS, countFacets, formatYear } from "@/lib/students";
import { cn } from "@/lib/utils";
import type { FacetFilters, StudentStatus, YearLevel } from "@/types/student.types";

import { AnimatedNumber } from "./animated-number";
import styles from "./students.module.css";
import { primaryButtonClassName, toolbarButtonClassName } from "./student-toolbar-styles";

/** Programs shown before the "+N" chip. */
const VISIBLE_PROGRAMS = 5;
const SHOWN_PROGRAMS = PROGRAMS.slice(0, VISIBLE_PROGRAMS);
const MORE_PROGRAMS = PROGRAMS.slice(VISIBLE_PROGRAMS);

const STATUS_OPTIONS: { value: StudentStatus; label: string }[] = [
  { value: "enrolled", label: "Enrolled" },
  { value: "not-updated", label: "Not updated" },
  { value: "loa", label: "LOA" },
];

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/* ----------------------------------- pieces ----------------------------------- */

interface ChipProps {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/** Pill toggle; the check slides in (and the pill widens) when selected. */
function Chip({ selected, onClick, children, className, style }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      style={style}
      className={cn(
        "inline-flex h-7 shrink-0 cursor-pointer items-center rounded-full border px-2.75 text-[0.8125rem] whitespace-nowrap outline-none select-none",
        "transition-[background-color,border-color,color,box-shadow,scale] duration-200 ease-out active:scale-[0.96] motion-reduce:active:scale-100",
        "focus-visible:ring-3 focus-visible:ring-brand-blue/20",
        selected
          ? "border-primary bg-primary text-primary-foreground shadow-[0_4px_10px_-6px_rgb(15_23_42/0.6)]"
          : "border-border bg-background text-foreground/90 hover:border-[color-mix(in_oklab,var(--color-brand-muted)_42%,transparent)] hover:bg-muted/60 hover:text-foreground",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-flex shrink-0 justify-start overflow-hidden transition-[width,margin,opacity] duration-200 ease-out motion-reduce:transition-none",
          selected ? "mr-1 w-3 opacity-100" : "mr-0 w-0 opacity-0",
        )}
      >
        <Check className="size-3 shrink-0" strokeWidth={2.6} />
      </span>
      {children}
    </button>
  );
}

function FacetGroup({ label, selectedCount, children }: { label: string; selectedCount: number; children: ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <div className="mb-2.5 flex items-baseline justify-between">
        <legend className="float-left font-mono text-[0.65625rem] tracking-[0.12em] text-muted-foreground uppercase">{label}</legend>
        <span
          aria-live="polite"
          className={cn(
            "font-mono text-[0.6875rem] text-muted-foreground transition-[opacity,translate] duration-200 ease-out",
            selectedCount ? "translate-x-0 opacity-100" : "translate-x-1 opacity-0",
          )}
        >
          {selectedCount ? `${selectedCount} selected` : ""}
        </span>
      </div>
      <div className="clear-both flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

/* ----------------------------------- popover ----------------------------------- */

interface FilterPopoverProps {
  value: FacetFilters;
  onApply: (next: FacetFilters) => void;
  /** Live result count for a draft selection (shown in the footer). */
  countMatches: (draft: FacetFilters) => number;
}

/**
 * Filters button + panel. Selections are drafted inside the panel and only
 * applied with "Apply"; closing the panel any other way discards the draft.
 */
export function FilterPopover({ value, onApply, countMatches }: FilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FacetFilters>(value);
  const [showAllPrograms, setShowAllPrograms] = useState(false);

  const applied = countFacets(value);
  const drafted = countFacets(draft);
  const matches = countMatches(draft);

  function handleOpenChange(next: boolean) {
    if (next) {
      setDraft(value);
      // Unfold the long program list when one of its programs is already selected.
      setShowAllPrograms(value.programs.some((p) => MORE_PROGRAMS.includes(p)));
    }
    setOpen(next);
  }

  function patch<K extends keyof FacetFilters>(key: K, item: FacetFilters[K][number]) {
    setDraft((d) => ({ ...d, [key]: toggle(d[key] as FacetFilters[K][number][], item) }));
  }

  function apply() {
    onApply(draft);
    setOpen(false);
  }

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger
        aria-label={applied ? `Filters, ${applied} active` : "Filters"}
        className={cn(
          toolbarButtonClassName,
          "gap-0 px-2.75",
          "data-popup-open:border-brand-blue/70 data-popup-open:ring-3 data-popup-open:ring-brand-blue/12",
          applied > 0 && "border-[color-mix(in_oklab,var(--color-brand-navy)_35%,transparent)] dark:border-white/25",
        )}
      >
        <Funnel aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
        {/* Badge folds away (width + fade) when no filter is applied. */}
        <span
          aria-hidden
          className={cn(
            "grid transition-[grid-template-columns,opacity,margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            applied ? "ml-2 grid-cols-[1fr] opacity-100" : "ml-0 grid-cols-[0fr] opacity-0",
          )}
        >
          <span className="overflow-hidden">
            <span
              key={applied}
              className={cn(
                "flex h-4.5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 font-mono text-[0.6875rem] leading-none font-medium text-primary-foreground tabular-nums",
                styles.badgePop,
              )}
            >
              {applied || ""}
            </span>
          </span>
        </span>
      </Popover.Trigger>

      <Popover.Portal>
        {/* Always below the button: when space runs out the panel body scrolls instead of the panel jumping sideways. */}
        <Popover.Positioner
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          collisionAvoidance={{ side: "none", align: "shift", fallbackAxisSide: "none" }}
          className="z-50 outline-none"
        >
          <Popover.Popup
            data-themed
            className={cn(
              popupClassName,
              "flex max-h-[min(36rem,var(--available-height))] w-[min(21.25rem,calc(100vw-1.5rem))] flex-col overflow-hidden",
              "duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] data-starting-style:-translate-y-1 data-ending-style:-translate-y-1",
            )}
          >
            <div className="flex h-10.5 shrink-0 items-center justify-between border-b border-border px-4">
              <Popover.Title className="text-[0.875rem] font-semibold text-foreground">Filters</Popover.Title>
              <button
                type="button"
                onClick={() => setDraft(NO_FACETS)}
                disabled={drafted === 0}
                className="cursor-pointer rounded px-1 -mr-1 text-[0.78125rem] text-brand-blue outline-none transition-[color,opacity] duration-200 hover:text-[color-mix(in_oklab,var(--color-brand-blue)_75%,black)] focus-visible:ring-2 focus-visible:ring-brand-blue/30 disabled:cursor-default disabled:opacity-40 dark:text-[#7aa7e6]"
              >
                Clear all
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4.5 overflow-y-auto overscroll-contain px-4 pt-3.5 pb-4 scrollbar-thin">
              <FacetGroup label="Program" selectedCount={draft.programs.length}>
                {SHOWN_PROGRAMS.map((program) => (
                  <Chip key={program} selected={draft.programs.includes(program)} onClick={() => patch("programs", program)}>
                    {program}
                  </Chip>
                ))}
                <Chip
                  selected={false}
                  onClick={() => setShowAllPrograms((v) => !v)}
                  className="text-muted-foreground"
                >
                  <span aria-hidden>{showAllPrograms ? "Less" : `+${MORE_PROGRAMS.length}`}</span>
                  <span className="sr-only">{showAllPrograms ? "Show fewer programs" : `Show ${MORE_PROGRAMS.length} more programs`}</span>
                </Chip>
                {/* The rest of the programs unfold below (height animates via grid rows). */}
                <div
                  inert={!showAllPrograms}
                  className={cn(
                    "-mt-2 grid w-full transition-[grid-template-rows,margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                    showAllPrograms ? "mt-0 grid-rows-[1fr]" : "grid-rows-[0fr]",
                  )}
                >
                  <div className="overflow-hidden">
                    <div className="flex flex-wrap gap-2">
                      {MORE_PROGRAMS.map((program, i) => (
                        <Chip
                          key={program}
                          selected={draft.programs.includes(program)}
                          onClick={() => patch("programs", program)}
                          className={cn(showAllPrograms ? styles.chipIn : "opacity-0")}
                          style={{ animationDelay: `${Math.min(i, 14) * 14}ms` }}
                        >
                          {program}
                        </Chip>
                      ))}
                    </div>
                  </div>
                </div>
              </FacetGroup>

              <FacetGroup label="Year" selectedCount={draft.years.length}>
                {YEAR_LEVELS.map((year: YearLevel) => (
                  <Chip key={year} selected={draft.years.includes(year)} onClick={() => patch("years", year)}>
                    {formatYear(year)}
                  </Chip>
                ))}
              </FacetGroup>

              <FacetGroup label="Term" selectedCount={draft.terms.length}>
                {TERMS.map((term) => (
                  <Chip key={term} selected={draft.terms.includes(term)} onClick={() => patch("terms", term)}>
                    {term}
                    {term === CURRENT_TERM ? <span className="whitespace-pre opacity-80"> · current</span> : null}
                  </Chip>
                ))}
              </FacetGroup>

              <FacetGroup label="Status" selectedCount={draft.statuses.length}>
                {STATUS_OPTIONS.map((status) => (
                  <Chip key={status.value} selected={draft.statuses.includes(status.value)} onClick={() => patch("statuses", status.value)}>
                    {status.label}
                  </Chip>
                ))}
              </FacetGroup>
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-4 py-3">
              <p className="text-[0.8125rem] text-muted-foreground" aria-live="polite">
                <AnimatedNumber value={matches} duration={450} className="tabular-nums" /> {matches === 1 ? "student matches" : "students match"}
              </p>
              <button type="button" onClick={apply} className={primaryButtonClassName}>
                Apply
              </button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
