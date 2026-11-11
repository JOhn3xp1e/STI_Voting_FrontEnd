"use client";

import { memo, type ReactNode } from "react";

import styles from "@/components/shared/motion.module.css";
import { checkboxClassName } from "@/components/students/student-table";
import { Checkbox } from "@/components/ui/checkbox";
import { programInitials } from "@/lib/programs";
import { cn } from "@/lib/utils";
import type { Program } from "@/types/program.types";

const INTRO_ROWS = 12;

const createdFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

interface RowProps {
  program: Program;
  /** Active students this term, or `null` when unknown. */
  students: number | null;
  checked: boolean;
  flash: boolean;
  introIndex: number;
  onToggle: (code: string, checked: boolean) => void;
  onOpen: (program: Program) => void;
}

const ProgramRow = memo(function ProgramRow({ program, students, checked, flash, introIndex, onToggle, onOpen }: RowProps) {
  return (
    <tr
      data-selected={checked || undefined}
      onClick={() => onOpen(program)}
      style={introIndex >= 0 ? { animationDelay: `${introIndex * 32}ms` } : undefined}
      className={cn(
        "group/row h-14.5 cursor-pointer transition-colors duration-200 hover:bg-muted/55 data-selected:bg-brand-blue/2.5 dark:hover:bg-white/3",
        introIndex >= 0 && styles.rowIn,
        flash && styles.rowFlash,
      )}
    >
      <td className="border-b border-border pl-2" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          aria-label={`Select ${program.code}`}
          checked={checked}
          onCheckedChange={(next) => onToggle(program.code, next)}
          className={checkboxClassName}
        />
      </td>
      <td className="border-b border-border pr-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-background font-mono text-[0.5625rem] font-medium text-muted-foreground transition-[border-color,color] duration-200 group-hover/row:border-[color-mix(in_oklab,var(--color-brand-muted)_40%,transparent)] group-hover/row:text-foreground/80"
          >
            {programInitials(program.code)}
          </span>
          <div className="min-w-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpen(program);
              }}
              aria-label={`Edit ${program.code}, ${program.name}`}
              className="block max-w-full cursor-pointer truncate rounded-sm text-left text-[0.875rem] leading-4.5 font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30"
            >
              {program.code}
            </button>
            <p className="truncate font-mono text-[0.65625rem] leading-4 text-muted-foreground">{program.name}</p>
          </div>
        </div>
      </td>
      <td className="border-b border-border text-[0.8125rem] text-muted-foreground tabular-nums">
        {students === null ? "—" : students.toLocaleString("en-US")}
      </td>
      <td className="border-b border-border font-mono text-[0.75rem] text-muted-foreground">
        {program.createdAt ? createdFormat.format(new Date(program.createdAt)) : "—"}
      </td>
    </tr>
  );
});

interface ProgramsTableProps {
  programs: readonly Program[];
  studentsOf: (code: string) => number | null;
  selected: ReadonlySet<string>;
  onToggle: (code: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  onOpen: (program: Program) => void;
  flashed: ReadonlySet<string>;
  resultKey: string;
  empty: ReactNode;
}

export function ProgramsTable({ programs, studentsOf, selected, onToggle, onToggleAll, onOpen, flashed, resultKey, empty }: ProgramsTableProps) {
  const selectedVisible = programs.reduce((n, p) => n + (selected.has(p.code) ? 1 : 0), 0);
  const allChecked = programs.length > 0 && selectedVisible === programs.length;

  return (
    <div className="overflow-x-auto border-t border-border scrollbar-thin">
      <table className="w-full min-w-140 table-fixed border-separate border-spacing-0 text-left">
        <caption className="sr-only">
          Programs, {programs.length} {programs.length === 1 ? "result" : "results"}
        </caption>
        <colgroup>
          <col className="w-9.5" />
          <col />
          <col className="w-27.5" />
          <col className="w-25 min-[90rem]:w-28" />
        </colgroup>
        <thead>
          <tr className="h-10.5 font-mono text-[0.65625rem] tracking-[0.08em] text-muted-foreground uppercase">
            <th scope="col" className="border-b border-border pl-2 font-normal">
              <Checkbox
                aria-label={allChecked ? "Deselect all programs" : "Select all programs"}
                checked={allChecked}
                indeterminate={selectedVisible > 0 && !allChecked}
                disabled={programs.length === 0}
                onCheckedChange={(checked) => onToggleAll(checked)}
                className={checkboxClassName}
              />
            </th>
            <th scope="col" className="border-b border-border font-normal">Program</th>
            <th scope="col" className="border-b border-border font-normal">Students</th>
            <th scope="col" className="border-b border-border font-normal">Created</th>
          </tr>
        </thead>
        <tbody key={resultKey}>
          {programs.length === 0 ? (
            <tr className={styles.rowIn}>
              <td colSpan={4} className="h-40 border-b border-border text-center">
                {empty}
              </td>
            </tr>
          ) : (
            programs.map((program, index) => (
              <ProgramRow
                key={program.code}
                program={program}
                students={studentsOf(program.code)}
                checked={selected.has(program.code)}
                flash={flashed.has(program.code)}
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
