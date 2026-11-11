"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { CircleCheck } from "lucide-react";

import { ADDED_THIS_TERM, CURRENT_TERM, MOCK_STUDENTS } from "@/lib/mock/students.mock";
import { NO_FACETS, countByStatus, countFacets, formatStudentName, formatYear, matchesFilters } from "@/lib/students";
import { cn } from "@/lib/utils";
import type { FacetFilters, Student, YearLevel } from "@/types/student.types";

import { AddStudentForm } from "./add-student-form";
import { BulkActionBar } from "./bulk-action-bar";
import { CsvImportDialog } from "./csv-import-dialog";
import { StudentStats, type StudentStat } from "./student-stats";
import { StudentTable } from "./student-table";
import { StudentToolbar } from "./student-toolbar";
import { toolbarButtonClassName } from "./student-toolbar-styles";

const PREVIEW_NOTE = "Preview only, nothing saved.";

/**
 * Students management page (FRONTEND MOCK).
 * Everything happens in local state on a fictional generated roster; nothing
 * is sent to the Web API.
 */
export function StudentsPage() {
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const [students, setStudents] = useState<Student[]>(MOCK_STUDENTS);
  const [query, setQuery] = useState("");
  const [facets, setFacets] = useState<FacetFilters>(NO_FACETS);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [highlighted, setHighlighted] = useState<Set<string>>(() => new Set());
  /** Bumped when rows are added, so the table replays its entrance from the top. */
  const [revision, setRevision] = useState(0);
  const [addedCount, setAddedCount] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [notice, setNotice] = useState<{ id: number; text: string } | null>(null);

  // Typing stays responsive; the table catches up with the deferred value.
  const deferredQuery = useDeferredValue(query);

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
    () => students.filter((s) => matchesFilters(s, deferredQuery, facets)),
    [students, deferredQuery, facets],
  );

  const countMatches = useCallback(
    (draft: FacetFilters) => students.reduce((n, s) => n + (matchesFilters(s, query, draft) ? 1 : 0), 0),
    [students, query],
  );

  const counts = useMemo(() => countByStatus(students), [students]);

  const stats: StudentStat[] = [
    {
      label: "Total students",
      value: students.length,
      detail: `+${ADDED_THIS_TERM + addedCount} this term`,
      tone: "blue",
      trend: [2.2, 2.6, 2.3, 3.6, 3.3, 4.4, 4.1, 5.6, 6.9, 8.2],
    },
    {
      label: "Enrolled this term",
      value: counts.enrolled,
      detail: `in ${CURRENT_TERM}`,
      tone: "blue",
      trend: [2, 2.5, 2.2, 3.4, 3.1, 4.6, 4.2, 5.8, 7, 8.4],
    },
    {
      label: "Not updated",
      value: counts["not-updated"],
      detail: `need ${CURRENT_TERM} enrollment`,
      tone: "gold",
      trend: [9, 8.7, 8.9, 7.4, 6.6, 5.2, 4.9, 4.4, 4.3, 4.1],
    },
    {
      label: "On leave (LOA)",
      value: counts.loa,
      detail: "not eligible to vote",
      tone: "gold",
      trend: [9.2, 8.8, 9, 7.6, 6.8, 5.6, 5, 4.7, 4.5, 4.3],
    },
  ];

  const existingStudentNos = useMemo(() => new Set(students.map((s) => s.studentNo)), [students]);

  const resultKey = `${deferredQuery.trim().toLowerCase()}|${JSON.stringify(facets)}|${revision}`;

  /* ---------------------------------- selection ---------------------------------- */

  const toggle = useCallback((studentNo: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(studentNo);
      else next.delete(studentNo);
      return next;
    });
  }, []);

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
    setHighlighted(new Set(selected));
  }

  const n = selected.size;
  const plural = (count: number) => `${count.toLocaleString("en-US")} student${count === 1 ? "" : "s"}`;

  /* ------------------------------------ adding ------------------------------------ */

  /** Shows every student again so new rows are visible at the top. */
  function revealAdded(studentNos: string[]) {
    setQuery("");
    setFacets(NO_FACETS);
    setRevision((r) => r + 1);
    setHighlighted(new Set(studentNos));
  }

  function addStudent(student: Student) {
    setStudents((list) => [student, ...list]);
    setAddedCount((c) => c + 1);
    revealAdded([student.studentNo]);
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
    revealAdded(rows.map((r) => r.studentNo));
    say(`Imported ${summary.added} new · ${summary.updated} updated. ${PREVIEW_NOTE}`);
  }

  const filtersActive = query.trim() !== "" || countFacets(facets) > 0;

  return (
    <div className="px-4 pt-0 pb-28 sm:px-6 lg:px-8">
      <StudentStats stats={stats} />

      {/* Toolbar above the table; the Add student card lines up with the table's top edge. */}
      <div className="mt-5 grid grid-cols-1 items-start gap-x-6 gap-y-5.5 min-[85rem]:grid-cols-[minmax(0,1fr)_22.5rem]">
        <StudentToolbar
          query={query}
          onQueryChange={setQuery}
          facets={facets}
          onFacetsChange={setFacets}
          countMatches={countMatches}
          onImport={() => setImportOpen(true)}
          onAddStudent={() => {
            const field = firstFieldRef.current;
            field?.scrollIntoView({ behavior: "smooth", block: "center" });
            field?.focus({ preventScroll: true });
          }}
          className="min-[85rem]:col-start-1"
        />

        <div className="min-w-0 min-[85rem]:col-start-1 min-[85rem]:row-start-2">
          <StudentTable
            students={visible}
            selected={selected}
            onToggle={toggle}
            onToggleAll={toggleAll}
            highlighted={highlighted}
            resultKey={resultKey}
            emptyAction={
              filtersActive ? (
                <button
                  type="button"
                  className={cn(toolbarButtonClassName, "h-8 text-[0.8125rem]")}
                  onClick={() => {
                    setQuery("");
                    setFacets(NO_FACETS);
                  }}
                >
                  Clear search &amp; filters
                </button>
              ) : null
            }
          />
        </div>

        <AddStudentForm
          existingStudentNos={existingStudentNos}
          onAdd={addStudent}
          firstFieldRef={firstFieldRef}
          className="min-[85rem]:col-start-2 min-[85rem]:row-start-2"
        />
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
