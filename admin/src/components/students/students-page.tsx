"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CircleCheck } from "lucide-react";

import { CURRENT_TERM, MOCK_STUDENTS, ROSTER_TOTALS } from "@/lib/mock/students.mock";
import { formatStudentName, formatYear, isInCategory, matchesFilters } from "@/lib/students";
import { cn } from "@/lib/utils";
import type { Student, StudentCategory, StudentFilters, YearLevel } from "@/types/student.types";

import { AddStudentForm } from "./add-student-form";
import { BulkActionBar } from "./bulk-action-bar";
import { CsvImportDialog } from "./csv-import-dialog";
import { StudentStats, type StudentStat } from "./student-stats";
import { StudentTable } from "./student-table";
import { StudentTabs, type StudentTab } from "./student-tabs";
import { StudentToolbar, toolbarButtonClassName } from "./student-toolbar";

const NO_FILTERS: StudentFilters = { query: "", program: null, year: null, term: null };
const PREVIEW_NOTE = "Preview only, nothing saved.";

function countBy(students: readonly Student[]) {
  return {
    all: students.length,
    enrolled: students.filter((s) => isInCategory(s, "enrolled")).length,
    notUpdated: students.filter((s) => isInCategory(s, "not-updated")).length,
    inactive: students.filter((s) => isInCategory(s, "inactive")).length,
  };
}

const INITIAL_COUNTS = countBy(MOCK_STUDENTS);
const fmt = (n: number) => n.toLocaleString("en-US");

/**
 * Students management page (FRONTEND MOCK).
 * Everything happens in local state on fictional sample data; nothing is sent
 * to the Web API. Term totals come from `ROSTER_TOTALS`, adjusted by the
 * changes made to the sample rows during the session.
 */
export function StudentsPage() {
  const tableId = useId();
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const [students, setStudents] = useState<Student[]>(MOCK_STUDENTS);
  const [category, setCategory] = useState<StudentCategory>("all");
  const [filters, setFilters] = useState<StudentFilters>(NO_FILTERS);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [highlighted, setHighlighted] = useState<Set<string>>(() => new Set());
  const [addedCount, setAddedCount] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [notice, setNotice] = useState<{ id: number; text: string } | null>(null);

  // Notices dismiss themselves.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3800);
    return () => clearTimeout(timer);
  }, [notice]);

  // Row flashes end with their animation, so the same row can flash again later.
  useEffect(() => {
    if (highlighted.size === 0) return;
    const timer = setTimeout(() => setHighlighted(new Set()), 2500);
    return () => clearTimeout(timer);
  }, [highlighted]);

  const say = (text: string) => setNotice({ id: Date.now(), text });

  const visible = useMemo(
    () => students.filter((s) => isInCategory(s, category) && matchesFilters(s, filters)),
    [students, category, filters],
  );

  const counts = useMemo(() => {
    const now = countBy(students);
    return {
      all: ROSTER_TOTALS.all + now.all - INITIAL_COUNTS.all,
      enrolled: ROSTER_TOTALS.enrolled + now.enrolled - INITIAL_COUNTS.enrolled,
      notUpdated: ROSTER_TOTALS.notUpdated + now.notUpdated - INITIAL_COUNTS.notUpdated,
      inactive: ROSTER_TOTALS.inactive + now.inactive - INITIAL_COUNTS.inactive,
    };
  }, [students]);

  const stats: StudentStat[] = [
    {
      label: "Enrolled this term",
      value: fmt(counts.enrolled),
      detail: `${Math.round((counts.enrolled / counts.all) * 100)}% of students`,
      tone: "blue",
      trend: [2, 3, 2.6, 4.4, 4, 5.6, 5.2, 7, 8.4, 9.6],
    },
    { label: "Not yet updated", value: fmt(counts.notUpdated), detail: "still on last term", tone: "gold", trend: [9, 8.4, 8.8, 7, 6.2, 5, 4.4, 4.8, 4.2, 3.9] },
    {
      label: "Added this term",
      value: `+${fmt(ROSTER_TOTALS.addedThisTerm + addedCount)}`,
      detail: "new students",
      tone: "blue",
      trend: [2, 2.4, 2.2, 3.8, 3.4, 5, 4.6, 6.4, 7.4, 8.6],
    },
    { label: "Inactive / LOA", value: fmt(counts.inactive), detail: "excluded from voting", tone: "gold", trend: [9.2, 8.6, 8.9, 7.4, 6.4, 5.4, 4.6, 4.9, 4.4, 4.2] },
  ];

  const tabs: StudentTab[] = [
    { id: "all", label: "All", count: counts.all },
    { id: "enrolled", label: `Enrolled · ${CURRENT_TERM}`, count: counts.enrolled },
    { id: "not-updated", label: "Not updated", count: counts.notUpdated },
    { id: "inactive", label: "Inactive", count: counts.inactive },
  ];

  const existingStudentNos = useMemo(() => new Set(students.map((s) => s.studentNo)), [students]);

  function flash(studentNos: string[]) {
    setHighlighted(new Set(studentNos));
  }

  /* ---------------------------------- selection ---------------------------------- */

  function toggle(studentNo: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(studentNo);
      else next.delete(studentNo);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const s of visible) {
        if (checked) next.add(s.studentNo);
        else next.delete(s.studentNo);
      }
      return next;
    });
  }

  function updateSelected(update: (s: Student) => Student) {
    setStudents((list) => list.map((s) => (selected.has(s.studentNo) ? update(s) : s)));
    flash([...selected]);
  }

  const n = selected.size;
  const plural = (count: number) => `${count} student${count === 1 ? "" : "s"}`;

  /* ------------------------------------ adding ------------------------------------ */

  function addStudent(student: Student) {
    setStudents((list) => [student, ...list]);
    setAddedCount((c) => c + 1);
    // Make sure the new row is visible.
    setCategory("all");
    setFilters(NO_FILTERS);
    flash([student.studentNo]);
    say(`Added ${formatStudentName(student)} · enrolled in ${student.term}. ${PREVIEW_NOTE}`);
  }

  function applyImport(rows: Student[], summary: { added: number; updated: number }) {
    setStudents((list) => {
      const byNo = new Map(rows.map((r) => [r.studentNo, r]));
      const updated = list.map((s) => byNo.get(s.studentNo) ?? s);
      const known = new Set(list.map((s) => s.studentNo));
      return [...rows.filter((r) => !known.has(r.studentNo)), ...updated];
    });
    setAddedCount((c) => c + summary.added);
    setCategory("all");
    setFilters(NO_FILTERS);
    flash(rows.map((r) => r.studentNo));
    say(`Imported ${summary.added} new · ${summary.updated} updated. ${PREVIEW_NOTE}`);
  }

  const filtersActive = filters.query !== "" || filters.program !== null || filters.year !== null || filters.term !== null;

  return (
    <div className="px-4 pt-0 pb-28 sm:px-6 lg:px-8">
      <StudentStats stats={stats} />

      <StudentTabs tabs={tabs} value={category} onValueChange={setCategory} controls={tableId} />

      <StudentToolbar
        filters={filters}
        onFiltersChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
        onImport={() => setImportOpen(true)}
        onAddStudent={() => {
          const field = firstFieldRef.current;
          field?.scrollIntoView({ behavior: "smooth", block: "center" });
          field?.focus({ preventScroll: true });
        }}
      />

      <div className="mt-5 grid grid-cols-1 items-start gap-6 min-[85rem]:grid-cols-[minmax(0,1fr)_22.5rem]">
        <div className="min-w-0">
          <StudentTable
            id={tableId}
            students={visible}
            selected={selected}
            onToggle={toggle}
            onToggleAll={toggleAll}
            highlighted={highlighted}
            emptyAction={
              filtersActive || category !== "all" ? (
                <button
                  type="button"
                  className={cn(toolbarButtonClassName, "h-8 text-[0.8125rem]")}
                  onClick={() => {
                    setFilters(NO_FILTERS);
                    setCategory("all");
                  }}
                >
                  Clear filters
                </button>
              ) : null
            }
          />
          <p className="mt-3.5 pl-2 font-mono text-[0.6875rem] leading-4 text-muted-foreground">
            Import upserts by student no. — existing students get their term &amp; year updated, new ones are added
          </p>
        </div>

        <AddStudentForm existingStudentNos={existingStudentNos} onAdd={addStudent} firstFieldRef={firstFieldRef} />
      </div>

      <BulkActionBar
        count={n}
        onSetTerm={() => {
          updateSelected((s) => ({ ...s, term: CURRENT_TERM }));
          say(`Set term → ${CURRENT_TERM} for ${plural(n)}. ${PREVIEW_NOTE}`);
        }}
        onSetYear={(year: YearLevel) => {
          updateSelected((s) => ({ ...s, year }));
          say(`Set year → ${formatYear(year)} for ${plural(n)}. ${PREVIEW_NOTE}`);
        }}
        onUpsert={() => {
          say(`Enrollment upsert prepared for ${plural(n)}. ${PREVIEW_NOTE}`);
          setSelected(new Set());
        }}
        onDiscard={() => setSelected(new Set())}
      />

      <CsvImportDialog open={importOpen} onOpenChange={setImportOpen} students={students} onApply={applyImport} />

      {/* Feedback toast */}
      <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-20 z-50 sm:right-6 sm:bottom-6">
        {notice ? (
          <p
            key={notice.id}
            data-themed
            className="flex max-w-sm animate-in items-start gap-2.5 rounded-lg border border-border bg-popover px-3.5 py-2.5 text-[0.8125rem] leading-5 text-popover-foreground shadow-[0_14px_36px_-14px_rgb(15_23_42/0.4)] duration-300 fade-in slide-in-from-bottom-2 motion-reduce:animate-none"
          >
            <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-blue dark:text-[#7aa7e6]" />
            {notice.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}
