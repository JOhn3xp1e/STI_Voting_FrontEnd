"use client";

import { useState } from "react";

import { CURRENT_TERM, YEAR_LEVELS } from "@/lib/mock/students.mock";
import { formatYear } from "@/lib/students";
import { cn } from "@/lib/utils";
import type { YearLevel } from "@/types/student.types";

import { OptionMenu } from "./option-menu";

const YEAR_OPTIONS = YEAR_LEVELS.map((y) => ({ value: y, label: formatYear(y) }));

const actionClassName = cn(
  "inline-flex h-7.5 shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 text-[0.8125rem] font-medium whitespace-nowrap text-white outline-none",
  "transition-colors duration-150 hover:bg-white/10 focus-visible:bg-white/12 focus-visible:ring-2 focus-visible:ring-white/30 data-popup-open:bg-white/12",
);

function Divider() {
  return <span aria-hidden className="h-4.5 w-px shrink-0 bg-white/18" />;
}

interface BulkActionBarProps {
  count: number;
  onSetTerm: () => void;
  onSetYear: (year: YearLevel) => void;
  onUpsert: () => void;
  onDiscard: () => void;
}

/**
 * Dark floating bar shown while students are selected. Always mounted, so it
 * can slide in and out; hidden from assistive tech and focus while closed.
 * Centred under the table column (from 85rem the form column takes 22.5rem + 1.5rem gap).
 */
export function BulkActionBar({ count, onSetTerm, onSetYear, onUpsert, onDiscard }: BulkActionBarProps) {
  const open = count > 0;

  // Keep showing the last count while the bar slides out.
  const [shownCount, setShownCount] = useState(count);
  if (open && count !== shownCount) setShownCount(count);

  return (
    <div
      role="toolbar"
      aria-label="Bulk actions for selected students"
      aria-hidden={!open}
      inert={!open}
      data-open={open || undefined}
      className={cn(
        "fixed bottom-6 left-1/2 z-40 max-w-[calc(100%-2rem)] -translate-x-1/2 md:left-[calc(16rem+(100%-16rem)/2)] min-[85rem]:left-[calc(18rem+(100%-44rem)/2)]",
        "flex items-center gap-1.5 overflow-x-auto rounded-[0.625rem] bg-brand-navy py-1.5 pr-1.5 pl-4 [scrollbar-width:none]",
        "shadow-[0_18px_40px_-14px_rgb(11_18_32/0.55),0_2px_6px_rgb(11_18_32/0.2)] dark:shadow-[0_0_0_1px_rgb(255_255_255/0.08),0_18px_40px_-14px_rgb(0_0_0/0.8)]",
        "transition-[opacity,translate] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-opacity",
        open ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
      )}
    >
      <p className="shrink-0 pr-1.5 font-mono text-[0.75rem] whitespace-nowrap text-white/55" aria-live="polite">
        Selected: <span className="text-white/80 tabular-nums">{shownCount}</span>
      </p>
      <Divider />
      <button type="button" onClick={onSetTerm} className={actionClassName}>
        Set term → {CURRENT_TERM}
      </button>
      <span className="w-1 shrink-0" />
      <OptionMenu<YearLevel>
        label="Set year for selected students"
        value={null}
        options={YEAR_OPTIONS}
        onChange={(year) => year && onSetYear(year)}
        side="top"
        align="center"
        triggerClassName={actionClassName}
      >
        Set year <span aria-hidden className="text-[0.5rem] text-white/70">▼</span>
      </OptionMenu>
      <Divider />
      <button type="button" onClick={onUpsert} className={actionClassName}>
        Upsert enrollment
      </button>
      <button
        type="button"
        onClick={onDiscard}
        className="h-7.5 shrink-0 cursor-pointer rounded-md bg-white px-3.5 text-[0.8125rem] font-semibold text-brand-navy outline-none transition-colors duration-150 hover:bg-white/88 focus-visible:ring-2 focus-visible:ring-white/50"
      >
        Discard
      </button>
    </div>
  );
}
