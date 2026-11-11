"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { CURRENT_TERM } from "@/lib/mock/students.mock";
import { formatStudentName, formatYear, getStudentInitials, getStudentStatus } from "@/lib/students";
import { cn } from "@/lib/utils";
import type { Student, StudentStatus } from "@/types/student.types";

import styles from "./students.module.css";

const STATUS_BADGE: Record<StudentStatus, { label: string; className: string }> = {
  enrolled: { label: "Enrolled", className: "bg-primary text-primary-foreground" },
  "not-updated": { label: "Not updated", className: "bg-brand-gold text-brand-navy" },
  loa: { label: "LOA", className: "border border-border text-muted-foreground/80" },
};

export const checkboxClassName =
  "size-4 cursor-pointer rounded-[4px] bg-background transition-[background-color,border-color,box-shadow] duration-150 hover:border-[color-mix(in_oklab,var(--color-brand-muted)_45%,transparent)] focus-visible:ring-brand-blue/25";

interface StudentTableProps {
  id: string;
  students: readonly Student[];
  selected: ReadonlySet<string>;
  onToggle: (studentNo: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  /** Student numbers to flash (just added / imported). */
  highlighted: ReadonlySet<string>;
  emptyAction?: React.ReactNode;
}

/** Roster table. Scrolls inside a 7-row viewport so the page keeps the reference proportions. */
export function StudentTable({ id, students, selected, onToggle, onToggleAll, highlighted, emptyAction }: StudentTableProps) {
  const selectedVisible = students.filter((s) => selected.has(s.studentNo)).length;
  const allChecked = students.length > 0 && selectedVisible === students.length;
  const someChecked = selectedVisible > 0 && !allChecked;

  return (
    <div
      id={id}
      role="tabpanel"
      className="max-h-[calc(2.625rem+7*3.625rem+1px)] overflow-auto overscroll-contain border-t border-border [scrollbar-width:thin]"
    >
      <table className="w-full min-w-160 table-fixed border-separate border-spacing-0 text-left">
        <colgroup>
          <col className="w-9.5" />
          <col />
          <col className="w-28 min-[90rem]:w-31.5" />
          <col className="w-17 min-[90rem]:w-19.5" />
          <col className="w-14 min-[90rem]:w-15.5" />
          <col className="w-24 min-[90rem]:w-26.5" />
          <col className="w-25 min-[90rem]:w-28" />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-background">
          <tr className="h-10.5 font-mono text-[0.65625rem] tracking-[0.08em] text-muted-foreground uppercase">
            <th scope="col" className="border-b border-border pl-2 font-normal">
              <Checkbox
                aria-label={allChecked ? "Deselect all shown students" : "Select all shown students"}
                checked={allChecked}
                indeterminate={someChecked}
                disabled={students.length === 0}
                onCheckedChange={(checked) => onToggleAll(checked)}
                className={checkboxClassName}
              />
            </th>
            <th scope="col" className="border-b border-border font-normal">Student</th>
            <th scope="col" className="border-b border-border font-normal">Student no.</th>
            <th scope="col" className="border-b border-border font-normal">Program</th>
            <th scope="col" className="border-b border-border font-normal">Year</th>
            <th scope="col" className="border-b border-border font-normal">Term</th>
            <th scope="col" className="border-b border-border font-normal">Status</th>
          </tr>
        </thead>
        <tbody>
          {students.length === 0 ? (
            <tr>
              <td colSpan={7} className="h-40 border-b border-border text-center">
                <p className="text-[0.875rem] font-medium text-foreground">No students match these filters</p>
                <p className="mt-1 text-[0.8125rem] text-muted-foreground">Try another category, search or filter.</p>
                {emptyAction ? <div className="mt-3">{emptyAction}</div> : null}
              </td>
            </tr>
          ) : (
            students.map((student) => {
              const checked = selected.has(student.studentNo);
              const status = STATUS_BADGE[getStudentStatus(student)];
              const name = formatStudentName(student);
              return (
                <tr
                  key={student.studentNo}
                  data-selected={checked || undefined}
                  className={cn(
                    "group/row h-14.5 transition-colors duration-150 hover:bg-muted/55 dark:hover:bg-white/3",
                    highlighted.has(student.studentNo) && styles.rowAdded,
                  )}
                >
                  <td className="border-b border-border pl-2">
                    <Checkbox
                      aria-label={`Select ${name}`}
                      checked={checked}
                      onCheckedChange={(next) => onToggle(student.studentNo, next)}
                      className={checkboxClassName}
                    />
                  </td>
                  <td className="border-b border-border pr-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden
                        className="flex size-6.5 shrink-0 items-center justify-center rounded-full border border-border bg-background font-mono text-[0.5625rem] font-medium text-muted-foreground transition-colors group-hover/row:border-[color-mix(in_oklab,var(--color-brand-muted)_40%,transparent)]"
                      >
                        {getStudentInitials(student)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[0.84375rem] leading-4.5 font-medium text-foreground">{name}</p>
                        <p className="truncate font-mono text-[0.65625rem] leading-4 text-muted-foreground">{student.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="border-b border-border font-mono text-[0.75rem] text-muted-foreground tabular-nums">
                    {student.studentNo}
                  </td>
                  <td className="border-b border-border text-[0.8125rem] text-muted-foreground">{student.program}</td>
                  <td className="border-b border-border font-mono text-[0.75rem] text-muted-foreground">{formatYear(student.year)}</td>
                  <td
                    className={cn(
                      "border-b border-border font-mono text-[0.75rem]",
                      student.term === CURRENT_TERM ? "text-foreground" : "text-muted-foreground/65",
                    )}
                  >
                    {student.term}
                  </td>
                  <td className="border-b border-border">
                    <span
                      className={cn(
                        "inline-flex h-4.5 items-center rounded-[3px] px-1.5 font-mono text-[0.59375rem] font-semibold tracking-[0.06em] uppercase",
                        status.className,
                      )}
                    >
                      {status.label}
                    </span>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
