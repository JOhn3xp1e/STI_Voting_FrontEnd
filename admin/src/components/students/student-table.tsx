"use client";

import { memo, useEffect, useRef, useState, type ReactNode } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { formatStudentName, formatYear, getStudentInitials, getStudentStatus } from "@/lib/students";
import { cn } from "@/lib/utils";
import type { Student, StudentStatus } from "@/types/student.types";

import { useStudentCatalog } from "./student-catalog";
import styles from "./students.module.css";

/** Rows rendered per batch; more are added as the table scrolls. */
const BATCH = 40;
/** Rows that take part in the staggered entrance (the first visible screenful). */
const INTRO_ROWS = 12;

const STATUS_BADGE: Record<StudentStatus, { label: string; className: string }> = {
  enrolled: { label: "Enrolled", className: "bg-[#22c55e] dark:bg-[#1fa855]" },
  "not-updated": { label: "Not updated", className: "bg-[#8d939c] dark:bg-[#5f6672]" },
  loa: { label: "LOA", className: "bg-[#f25f5c] dark:bg-[#d9524f]" },
  inactive: { label: "Inactive", className: "bg-[#4b5563] dark:bg-[#3f4652]" },
};

export const checkboxClassName =
  "size-4 cursor-pointer rounded-[4px] bg-background transition-[background-color,border-color,box-shadow,scale] duration-150 hover:border-[color-mix(in_oklab,var(--color-brand-muted)_45%,transparent)] focus-visible:ring-brand-blue/25 active:scale-90 motion-reduce:active:scale-100";

/** Status pill; pops gently when a row's status changes (e.g. after "Set term"). */
function StatusBadge({ status }: { status: StudentStatus }) {
  const [shown, setShown] = useState(status);
  const [changed, setChanged] = useState(false);
  if (status !== shown) {
    setShown(status);
    setChanged(true);
  }
  const badge = STATUS_BADGE[status];
  return (
    <span
      key={status}
      className={cn(
        "inline-flex h-4.75 items-center rounded-full px-3.75 font-mono text-[0.5625rem] leading-none font-semibold tracking-[0.08em] whitespace-nowrap text-white uppercase",
        "transition-colors duration-300",
        badge.className,
        changed && styles.badgePop,
      )}
    >
      {badge.label}
    </span>
  );
}

interface RowProps {
  student: Student;
  checked: boolean;
  highlighted: boolean;
  /** Position in the entrance stagger, or -1 for no entrance. */
  introIndex: number;
  currentTermId: string | null;
  onToggle: (studentNo: string, checked: boolean) => void;
}

const StudentRow = memo(function StudentRow({ student, checked, highlighted, introIndex, currentTermId, onToggle }: RowProps) {
  const name = formatStudentName(student);
  return (
    <tr
      data-selected={checked || undefined}
      style={introIndex >= 0 ? { animationDelay: `${introIndex * 26}ms` } : undefined}
      className={cn(
        "group/row h-14.5 transition-colors duration-200 hover:bg-muted/55 data-selected:bg-brand-blue/2.5 dark:hover:bg-white/3 dark:data-selected:bg-white/2",
        introIndex >= 0 && styles.rowIn,
        highlighted && styles.rowAdded,
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
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-background font-mono text-[0.5625rem] font-medium text-muted-foreground transition-[border-color,color] duration-200 group-hover/row:border-[color-mix(in_oklab,var(--color-brand-muted)_40%,transparent)] group-hover/row:text-foreground/80"
          >
            {getStudentInitials(student)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[0.84375rem] leading-4.5 font-medium text-foreground">{name}</p>
            <p className="truncate font-mono text-[0.65625rem] leading-4 text-muted-foreground">{student.email}</p>
          </div>
        </div>
      </td>
      <td className="border-b border-border font-mono text-[0.75rem] text-muted-foreground tabular-nums">{student.studentNo}</td>
      <td className="border-b border-border text-[0.8125rem] text-muted-foreground">{student.program ?? "—"}</td>
      <td className="border-b border-border font-mono text-[0.75rem] text-muted-foreground">{formatYear(student.year)}</td>
      <td
        className={cn(
          "border-b border-border font-mono text-[0.75rem] transition-colors duration-300",
          student.term !== null && student.term === currentTermId ? "text-foreground" : "text-muted-foreground/60",
        )}
      >
        {student.term ?? "—"}
      </td>
      <td className="border-b border-border">
        <StatusBadge status={getStudentStatus(student, currentTermId)} />
      </td>
    </tr>
  );
});

interface StudentTableProps {
  students: readonly Student[];
  selected: ReadonlySet<string>;
  onToggle: (studentNo: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  /** Student numbers to flash (just added / imported / updated). */
  highlighted: ReadonlySet<string>;
  /** Changes whenever the result set is re-queried (filters, search): replays the entrance and scrolls to the top. */
  resultKey: string;
  emptyAction?: ReactNode;
}

/**
 * Roster table. Scrolls inside a 7-row viewport (reference proportions) and
 * renders rows in batches as you scroll, so the full roster stays smooth.
 */
export function StudentTable({ students, selected, onToggle, onToggleAll, highlighted, resultKey, emptyAction }: StudentTableProps) {
  const currentTermId = useStudentCatalog().currentTerm?.id ?? null;
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLTableRowElement>(null);

  const [limit, setLimit] = useState(BATCH);
  const [intro, setIntro] = useState(true);
  const [limitFor, setLimitFor] = useState(resultKey);
  if (limitFor !== resultKey) {
    setLimitFor(resultKey);
    setLimit(BATCH);
    setIntro(true);
  }

  // The entrance only applies right after (re)querying, never to later edits.
  useEffect(() => {
    if (!intro) return;
    const timer = setTimeout(() => setIntro(false), 900);
    return () => clearTimeout(timer);
  }, [intro, resultKey]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [resultKey]);

  // Render the next batch when the sentinel scrolls into view.
  const hasMore = limit < students.length;
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!hasMore || !sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setLimit((l) => l + BATCH);
      },
      { root: scrollRef.current, rootMargin: "240px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, limit]);

  const selectedVisible = selected.size === 0 ? 0 : students.reduce((n, s) => n + (selected.has(s.studentNo) ? 1 : 0), 0);
  const allChecked = students.length > 0 && selectedVisible === students.length;
  const someChecked = selectedVisible > 0 && !allChecked;
  const rows = students.slice(0, limit);

  return (
    <div
      ref={scrollRef}
      className="max-h-[calc(2.625rem+7*3.625rem+1px)] overflow-auto overscroll-contain border-t border-border scrollbar-thin"
    >
      <table className="w-full min-w-160 table-fixed border-separate border-spacing-0 text-left">
        <caption className="sr-only">
          Students, {students.length.toLocaleString("en-US")} {students.length === 1 ? "result" : "results"}
        </caption>
        <colgroup>
          <col className="w-9.5" />
          <col />
          <col className="w-28 min-[90rem]:w-31.5" />
          <col className="w-17 min-[90rem]:w-19.5" />
          <col className="w-14 min-[90rem]:w-15.5" />
          <col className="w-24 min-[90rem]:w-26.5" />
          <col className="w-25 min-[90rem]:w-28" />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-background transition-colors duration-500">
          <tr className="h-10.5 font-mono text-[0.65625rem] tracking-[0.08em] text-muted-foreground uppercase">
            <th scope="col" className="border-b border-border pl-2 font-normal">
              <Checkbox
                aria-label={allChecked ? "Deselect all matching students" : "Select all matching students"}
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
        <tbody key={resultKey}>
          {students.length === 0 ? (
            <tr className={styles.rowIn}>
              <td colSpan={7} className="h-50 border-b border-border text-center">
                <p className="text-[0.875rem] font-medium text-foreground">No students match</p>
                <p className="mt-1 text-[0.8125rem] text-muted-foreground">Try another search or loosen the filters.</p>
                {emptyAction ? <div className="mt-3.5">{emptyAction}</div> : null}
              </td>
            </tr>
          ) : (
            rows.map((student, index) => (
              <StudentRow
                key={student.studentNo}
                student={student}
                checked={selected.has(student.studentNo)}
                highlighted={highlighted.has(student.studentNo)}
                introIndex={intro && index < INTRO_ROWS ? index : -1}
                currentTermId={currentTermId}
                onToggle={onToggle}
              />
            ))
          )}
          {hasMore ? (
            <tr ref={sentinelRef} aria-hidden>
              <td colSpan={7} className="h-px p-0" />
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
