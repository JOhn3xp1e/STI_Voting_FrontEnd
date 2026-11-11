"use client";

import { Plus, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { FacetFilters } from "@/types/student.types";

import { FilterPopover } from "./filter-popover";
import { primaryButtonClassName, toolbarButtonClassName } from "./student-toolbar-styles";

interface StudentToolbarProps {
  query: string;
  onQueryChange: (query: string) => void;
  facets: FacetFilters;
  onFacetsChange: (facets: FacetFilters) => void;
  countMatches: (draft: FacetFilters) => number;
  onImport: () => void;
  onAddStudent: () => void;
  className?: string;
}

/** Search, Filters popover, Import CSV and Add student. */
export function StudentToolbar({
  query,
  onQueryChange,
  facets,
  onFacetsChange,
  countMatches,
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

      <div className="flex w-full items-center gap-2.5 sm:ml-auto sm:w-auto sm:gap-6">
        <button type="button" onClick={onImport} className={cn(toolbarButtonClassName, "gap-2 px-3.5")}>
          <Plus aria-hidden className="size-4" strokeWidth={1.75} />
          Import CSV (upsert)
        </button>
        <button type="button" onClick={onAddStudent} className={primaryButtonClassName}>
          + Add student
        </button>
      </div>
    </div>
  );
}
