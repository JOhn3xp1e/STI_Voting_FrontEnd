"use client";

import type { KeyboardEvent, Ref } from "react";
import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

interface SidebarSearchProps {
  value: string;
  onValueChange: (value: string) => void;
  /** Enter: open the first matching navigation item. */
  onSubmit: () => void;
  inputRef?: Ref<HTMLInputElement>;
  /** `id` of the element listing the results (for `aria-controls`). */
  controlsId: string;
  className?: string;
}

/** Filters the sidebar navigation. `/` focuses it (handled by the shell); Escape clears, then blurs. */
export function SidebarSearch({ value, onValueChange, onSubmit, inputRef, controlsId, className }: SidebarSearchProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (value) {
        // Clear first; keep the drawer (if any) open.
        event.preventDefault();
        event.stopPropagation();
        onValueChange("");
      } else {
        event.currentTarget.blur();
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      onSubmit();
    }
  }

  return (
    <div role="search" className={cn("group/search relative", className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-brand-muted transition-colors duration-200 group-focus-within/search:text-sidebar-primary dark:text-shell-item"
      />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search"
        aria-label="Search navigation"
        aria-controls={controlsId}
        aria-keyshortcuts="/"
        autoComplete="off"
        spellCheck={false}
        className={cn(
          "h-8.5 w-full rounded-lg border border-transparent bg-shell-surface pr-9 pl-8 text-[0.8125rem] text-sidebar-foreground outline-none",
          "shadow-[0_1px_2px_rgb(15_23_42/0.05)] ring-1 ring-sidebar-border/60 placeholder:text-brand-muted dark:placeholder:text-shell-item",
          "transition-[box-shadow,border-color] duration-200 ease-out",
          "focus:border-sidebar-primary/40 focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-brand-blue)_14%,transparent)] focus:ring-0",
          "[&::-webkit-search-cancel-button]:appearance-none",
        )}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onValueChange("")}
          aria-label="Clear search"
          className="absolute top-1/2 right-2 flex size-5 -translate-y-1/2 items-center justify-center rounded-md text-brand-muted transition-colors hover:bg-sidebar/80 hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring/50 focus-visible:outline-none"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      ) : (
        <kbd
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-2.5 flex h-5 min-w-5 -translate-y-1/2 items-center justify-center rounded-[0.3125rem] border border-sidebar-border px-1 font-mono text-[0.6875rem] text-brand-muted transition-opacity duration-200 group-focus-within/search:opacity-0 dark:text-shell-item"
        >
          /
        </kbd>
      )}
    </div>
  );
}
