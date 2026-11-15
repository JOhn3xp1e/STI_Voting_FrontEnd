"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

import { ConfirmDeleteDialog } from "./confirm-delete-dialog";

interface SelectionBarProps {
  count: number;
  /** What the items are called, in the plural, e.g. "terms" (labels and the confirmation). */
  noun: string;
  /** Deletes the selected items, after the delete confirmation. Reports its own errors. */
  onDelete: () => Promise<void>;
  onClear: () => void;
  /** Extra positioning, e.g. to centre it under a table column. */
  className?: string;
}

/** "terms" → "term" when there's one. */
function nounFor(count: number, noun: string): string {
  return count === 1 ? noun.replace(/s$/, "") : noun;
}

/**
 * Dark floating bar shown while rows are selected: Delete (asks first, in the
 * delete confirmation) and Clear. Always mounted, so it can slide in and out.
 */
export function SelectionBar({ count, noun, onDelete, onClear, className }: SelectionBarProps) {
  const open = count > 0;
  /** The count being confirmed; `null` while the confirmation is closed. */
  const [confirming, setConfirming] = useState<{ count: number } | null>(null);

  // Keep showing the last count while the bar slides out.
  const [shownCount, setShownCount] = useState(count);
  if (open && count !== shownCount) setShownCount(count);

  return (
    <>
      <div
        role="toolbar"
        aria-label={`Actions for selected ${noun}`}
        aria-hidden={!open}
        inert={!open}
        className={cn(
          "fixed bottom-6 left-1/2 z-40 max-w-[calc(100%-2rem)] -translate-x-1/2 md:left-[calc(16rem+(100%-16rem)/2)]",
          "flex items-center gap-1.5 rounded-[0.625rem] bg-brand-navy py-1.5 pr-1.5 pl-4",
          "shadow-[0_18px_40px_-14px_rgb(11_18_32/0.55),0_2px_6px_rgb(11_18_32/0.2)] dark:shadow-[0_0_0_1px_rgb(255_255_255/0.08),0_18px_40px_-14px_rgb(0_0_0/0.8)]",
          "transition-[opacity,translate] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-opacity",
          open ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
          className,
        )}
      >
        <p className="shrink-0 pr-1.5 font-mono text-[0.75rem] whitespace-nowrap text-white/55" aria-live="polite">
          Selected: <span className="text-white/80 tabular-nums">{shownCount}</span>
        </p>
        <span aria-hidden className="h-4.5 w-px shrink-0 bg-white/18" />
        <button
          type="button"
          onClick={() => setConfirming({ count })}
          className="inline-flex h-7.5 shrink-0 cursor-pointer items-center rounded-md px-2.5 text-[0.8125rem] font-medium whitespace-nowrap text-[#ff8a80] outline-none transition-colors duration-150 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/30"
        >
          Delete selected
        </button>
        <button
          type="button"
          onClick={onClear}
          className="h-7.5 shrink-0 cursor-pointer rounded-md bg-white px-3.5 text-[0.8125rem] font-semibold text-brand-navy outline-none transition-colors duration-150 hover:bg-white/88 focus-visible:ring-2 focus-visible:ring-white/50"
        >
          Clear
        </button>
      </div>

      <ConfirmDeleteDialog
        item={confirming}
        getKey={(c) => String(c.count)}
        title={(c) => `Delete ${c.count} ${nounFor(c.count, noun)}?`}
        description={() => "This can't be undone."}
        summary={(c) => `${c.count} ${nounFor(c.count, noun)} selected`}
        confirmLabel="Delete"
        onClose={() => setConfirming(null)}
        onConfirm={onDelete}
      />
    </>
  );
}
