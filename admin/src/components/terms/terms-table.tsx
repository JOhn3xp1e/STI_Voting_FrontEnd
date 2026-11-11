"use client";

import { memo, type ReactNode } from "react";

import { checkboxClassName } from "@/components/students/student-table";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDateRange, type IsoDate } from "@/lib/dates";
import { formatAcadYearShort, formatTermTitle, getTermStatus } from "@/lib/terms";
import { cn } from "@/lib/utils";
import type { Term } from "@/types/term.types";

import { TermNumberBadge, TermStatusPill } from "./term-badges";
import styles from "@/components/shared/motion.module.css";

/** Rows that take part in the staggered entrance. */
const INTRO_ROWS = 12;

interface RowProps {
  term: Term;
  today: IsoDate;
  checked: boolean;
  flash: boolean;
  introIndex: number;
  onToggle: (id: string, checked: boolean) => void;
  onOpen: (term: Term) => void;
}

const TermRow = memo(function TermRow({ term, today, checked, flash, introIndex, onToggle, onOpen }: RowProps) {
  const title = formatTermTitle(term);
  return (
    <tr
      data-selected={checked || undefined}
      onClick={() => onOpen(term)}
      style={introIndex >= 0 ? { animationDelay: `${introIndex * 32}ms` } : undefined}
      className={cn(
        "group/row h-14.5 cursor-pointer transition-colors duration-200 hover:bg-muted/55 data-selected:bg-brand-blue/2.5 dark:hover:bg-white/3",
        introIndex >= 0 && styles.rowIn,
        flash && styles.rowFlash,
      )}
    >
      <td className="border-b border-border pl-2" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          aria-label={`Select ${title}`}
          checked={checked}
          onCheckedChange={(next) => onToggle(term.id, next)}
          className={checkboxClassName}
        />
      </td>
      <td className="border-b border-border pr-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <TermNumberBadge termNumber={term.termNumber} />
          <div className="min-w-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpen(term);
              }}
              aria-label={`Edit ${title}`}
              className="block max-w-full cursor-pointer truncate rounded-sm text-left text-[0.875rem] leading-4.5 font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30"
            >
              {title}
            </button>
            <p className="truncate font-mono text-[0.65625rem] leading-4 text-muted-foreground">
              {formatDateRange(term.startDate, term.endDate)}
            </p>
          </div>
        </div>
      </td>
      <td className="border-b border-border font-mono text-[0.75rem] text-muted-foreground tabular-nums">{term.id}</td>
      <td className="border-b border-border text-[0.8125rem] text-muted-foreground tabular-nums">{formatAcadYearShort(term.acadYear)}</td>
      <td className="border-b border-border">
        <TermStatusPill status={getTermStatus(term, today)} />
      </td>
    </tr>
  );
});

interface TermsTableProps {
  terms: readonly Term[];
  today: IsoDate;
  selected: ReadonlySet<string>;
  onToggle: (id: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  onOpen: (term: Term) => void;
  /** Term ids to flash (just created / edited). */
  flashed: ReadonlySet<string>;
  /** Changes whenever the list is re-filtered (tab, search): replays the entrance. */
  resultKey: string;
  empty: ReactNode;
}

export function TermsTable({ terms, today, selected, onToggle, onToggleAll, onOpen, flashed, resultKey, empty }: TermsTableProps) {
  const selectedVisible = terms.reduce((n, t) => n + (selected.has(t.id) ? 1 : 0), 0);
  const allChecked = terms.length > 0 && selectedVisible === terms.length;

  return (
    <div className="overflow-x-auto border-t border-border scrollbar-thin">
      <table className="w-full min-w-150 table-fixed border-separate border-spacing-0 text-left">
        <caption className="sr-only">
          Terms, {terms.length} {terms.length === 1 ? "result" : "results"}
        </caption>
        <colgroup>
          <col className="w-9.5" />
          <col />
          <col className="w-28 min-[90rem]:w-31.5" />
          <col className="w-20 min-[90rem]:w-22" />
          <col className="w-25 min-[90rem]:w-28" />
        </colgroup>
        <thead>
          <tr className="h-10.5 font-mono text-[0.65625rem] tracking-[0.08em] text-muted-foreground uppercase">
            <th scope="col" className="border-b border-border pl-2 font-normal">
              <Checkbox
                aria-label={allChecked ? "Deselect all terms" : "Select all terms"}
                checked={allChecked}
                indeterminate={selectedVisible > 0 && !allChecked}
                disabled={terms.length === 0}
                onCheckedChange={(checked) => onToggleAll(checked)}
                className={checkboxClassName}
              />
            </th>
            <th scope="col" className="border-b border-border font-normal">Term</th>
            <th scope="col" className="border-b border-border font-normal">Term ID</th>
            <th scope="col" className="border-b border-border font-normal">Acad year</th>
            <th scope="col" className="border-b border-border font-normal">Status</th>
          </tr>
        </thead>
        <tbody key={resultKey}>
          {terms.length === 0 ? (
            <tr className={styles.rowIn}>
              <td colSpan={5} className="h-44 border-b border-border text-center">
                {empty}
              </td>
            </tr>
          ) : (
            terms.map((term, index) => (
              <TermRow
                key={term.id}
                term={term}
                today={today}
                checked={selected.has(term.id)}
                flash={flashed.has(term.id)}
                introIndex={index < INTRO_ROWS ? index : -1}
                onToggle={onToggle}
                onOpen={onOpen}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
