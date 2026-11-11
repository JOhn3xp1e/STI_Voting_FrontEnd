"use client";

import { Plus, Search, X } from "lucide-react";

import { PROGRAMS, TERMS, TERM_LABELS, YEAR_LEVELS } from "@/lib/mock/students.mock";
import { formatYear } from "@/lib/students";
import { cn } from "@/lib/utils";
import type { ProgramCode, StudentFilters, YearLevel } from "@/types/student.types";

import { Caret, OptionMenu } from "./option-menu";

/** Outlined control shared by the toolbar buttons and dropdown triggers. */
export const toolbarButtonClassName = cn(
  "inline-flex h-8.5 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-3 text-[0.84375rem] text-foreground/85 outline-none",
  "transition-[background-color,border-color,color,box-shadow] duration-200 ease-out",
  "hover:border-[color-mix(in_oklab,var(--color-brand-muted)_38%,transparent)] hover:bg-muted/60 hover:text-foreground",
  "focus-visible:border-brand-blue/60 focus-visible:ring-3 focus-visible:ring-brand-blue/15",
  "data-popup-open:border-brand-blue/40 data-popup-open:ring-3 data-popup-open:ring-brand-blue/10",
);

const PROGRAM_OPTIONS = PROGRAMS.map((p) => ({ value: p, label: p }));
const YEAR_OPTIONS = YEAR_LEVELS.map((y) => ({ value: y, label: formatYear(y) }));
const TERM_OPTIONS = TERMS.map((t) => ({ value: t, label: t, hint: TERM_LABELS[t] }));

interface StudentToolbarProps {
  filters: StudentFilters;
  onFiltersChange: (patch: Partial<StudentFilters>) => void;
  onImport: () => void;
  onAddStudent: () => void;
}

/** Search, Program / Year / Term filters, Import CSV and Add student. */
export function StudentToolbar({ filters, onFiltersChange, onImport, onAddStudent }: StudentToolbarProps) {
  const filterTrigger = (active: boolean) =>
    cn(
      toolbarButtonClassName,
      active && "border-brand-blue/35 bg-brand-blue/5 text-brand-blue hover:bg-brand-blue/8 hover:text-brand-blue dark:text-[#9dbdeb]",
    );

  return (
    <div className="mt-5 flex flex-wrap items-center gap-2.5">
      <div className="relative w-full sm:w-60">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.25 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={filters.query}
          onChange={(event) => onFiltersChange({ query: event.target.value })}
          placeholder="Search name or student no."
          aria-label="Search students by name or student number"
          className={cn(
            "h-8.5 w-full rounded-md border border-border bg-background pl-8.75 text-[0.875rem] text-foreground outline-none placeholder:text-muted-foreground",
            filters.query ? "pr-8" : "pr-2",
            "transition-[border-color,box-shadow] duration-200 hover:border-[color-mix(in_oklab,var(--color-brand-muted)_38%,transparent)]",
            "focus:border-brand-blue/60 focus:ring-3 focus:ring-brand-blue/15 [&::-webkit-search-cancel-button]:hidden",
          )}
        />
        {filters.query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onFiltersChange({ query: "" })}
            className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X aria-hidden className="size-3.5" />
          </button>
        ) : null}
      </div>

      <OptionMenu<ProgramCode>
        label="Filter by program"
        value={filters.program}
        options={PROGRAM_OPTIONS}
        clearLabel="All programs"
        onChange={(program) => onFiltersChange({ program })}
        triggerClassName={filterTrigger(filters.program !== null)}
      >
        {filters.program ?? "Program"}
        <Caret className={cn(filters.program && "text-current")} />
      </OptionMenu>

      <OptionMenu<YearLevel>
        label="Filter by year level"
        value={filters.year}
        options={YEAR_OPTIONS}
        clearLabel="All years"
        onChange={(year) => onFiltersChange({ year })}
        triggerClassName={filterTrigger(filters.year !== null)}
      >
        {filters.year ? `${formatYear(filters.year)} year` : "Year"}
        <Caret className={cn(filters.year && "text-current")} />
      </OptionMenu>

      <OptionMenu<string>
        label="Filter by term"
        value={filters.term}
        options={TERM_OPTIONS}
        clearLabel="All terms"
        onChange={(term) => onFiltersChange({ term })}
        triggerClassName={filterTrigger(filters.term !== null)}
      >
        {filters.term ?? "Term"}
        <Caret className={cn(filters.term && "text-current")} />
      </OptionMenu>

      <div className="flex w-full items-center gap-2.5 sm:ml-auto sm:w-auto">
        <button type="button" onClick={onImport} className={cn(toolbarButtonClassName, "gap-2 px-3.5")}>
          <Plus aria-hidden className="size-4" strokeWidth={1.75} />
          Import CSV (upsert)
        </button>
        <button
          type="button"
          onClick={onAddStudent}
          className={cn(
            "inline-flex h-8.5 shrink-0 cursor-pointer items-center rounded-md bg-primary px-4 text-[0.84375rem] font-semibold text-primary-foreground outline-none",
            "transition-[background-color,box-shadow,translate] duration-200 ease-out",
            "hover:-translate-y-px hover:bg-[color-mix(in_oklab,var(--color-brand-navy)_86%,var(--color-brand-blue))] hover:shadow-[0_8px_18px_-10px_var(--color-brand-blue)]",
            "focus-visible:ring-3 focus-visible:ring-brand-blue/30 active:translate-y-0 motion-reduce:hover:translate-y-0",
            "dark:hover:bg-white/90",
          )}
        >
          + Add student
        </button>
      </div>
    </div>
  );
}
