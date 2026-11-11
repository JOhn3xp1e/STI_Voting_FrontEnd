"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";

import { NO_FACETS, countByStatus, countFacets, formatStudentName, formatYear, matchesFilters } from "@/lib/students";
import { cn } from "@/lib/utils";
import {
  bulkUpdateEnrollments,
  createStudent,
  fetchStudentCatalog,
  fetchStudents,
  getStudentsErrorMessage,
  updateEnrollment,
} from "@/services/students/students.service";
import type { EnrollmentStatus, FacetFilters, Student, StudentCatalog, YearLevel } from "@/types/student.types";

import { AddStudentForm } from "./add-student-form";
import { BulkActionBar } from "./bulk-action-bar";
import { CsvImportDialog } from "./csv-import-dialog";
import { StudentCatalogProvider, useStudentCatalog } from "./student-catalog";
import { StudentStats, type StudentStat } from "./student-stats";
import { StudentTable } from "./student-table";
import { StudentToolbar } from "./student-toolbar";
import { toolbarButtonClassName } from "./student-toolbar-styles";

/** Requests sent at once during a CSV import. */
const IMPORT_CONCURRENCY = 4;

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; catalog: StudentCatalog; students: Student[]; loadedAt: number };

/**
 * Students management page.
 * Loads the roster, terms, programs and careers from the ASP.NET Core Web API
 * (`/api/admin/...`), then renders the roster.
 */
export function StudentsPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    Promise.all([fetchStudentCatalog({ signal }), fetchStudents({ signal })])
      .then(([catalog, students]) => setState({ status: "ready", catalog, students, loadedAt: Date.now() }))
      .catch((error: unknown) => {
        if (!signal.aborted) setState({ status: "error", message: getStudentsErrorMessage(error) });
      });

    return () => controller.abort();
  }, [attempt]);

  function retry() {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }

  if (state.status === "loading") {
    return (
      <div className="flex min-h-80 items-center justify-center gap-2.5 px-4 text-[0.875rem] text-muted-foreground" role="status">
        <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
        Loading students…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex min-h-80 flex-col items-center justify-center gap-3 px-4 text-center">
        <CircleAlert aria-hidden className="size-6 text-destructive" strokeWidth={1.75} />
        <div>
          <p className="text-[0.9375rem] font-semibold text-foreground">Couldn&apos;t load the students</p>
          <p role="alert" className="mt-1 max-w-md text-[0.8125rem] leading-5 text-muted-foreground">
            {state.message}
          </p>
        </div>
        <button type="button" onClick={retry} className={cn(toolbarButtonClassName, "h-8 px-3.5 text-[0.8125rem]")}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <StudentCatalogProvider value={state.catalog}>
      <StudentsRoster key={attempt} initialStudents={state.students} loadedAt={state.loadedAt} />
    </StudentCatalogProvider>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Helpers                                  */
/* -------------------------------------------------------------------------- */

/** Runs `task` over `items`, a few at a time, and never rejects. */
async function settleInBatches<T, R>(items: readonly T[], size: number, task: (item: T) => Promise<R>) {
  const results: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += size) {
    results.push(...(await Promise.allSettled(items.slice(i, i + size).map(task))));
  }
  return results;
}

/** Roster size over time (from `createdAt`), sampled at `points` evenly spaced moments up to `now`. */
function growthTrend(students: readonly Student[], now: number, points = 10): number[] | undefined {
  const times = students
    .map((s) => (s.createdAt ? Date.parse(s.createdAt) : Number.NaN))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (times.length < 2 || now <= times[0]) return undefined;
  const start = times[0];
  return Array.from({ length: points }, (_, i) => {
    const t = start + ((now - start) * i) / (points - 1);
    return times.filter((time) => time <= t).length;
  });
}

const hasEnrollment = (s: Student) => s.careerCode !== null && s.program !== null && s.year !== null && s.term !== null;

/* -------------------------------------------------------------------------- */
/*                                   Roster                                   */
/* -------------------------------------------------------------------------- */

interface Notice {
  id: number;
  text: string;
  tone: "success" | "error";
}

function StudentsRoster({ initialStudents, loadedAt }: { initialStudents: Student[]; loadedAt: number }) {
  const catalog = useStudentCatalog();
  const currentTerm = catalog.currentTerm;
  const currentTermId = currentTerm?.id ?? null;
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const [students, setStudents] = useState<Student[]>(initialStudents);
  const [query, setQuery] = useState("");
  const [facets, setFacets] = useState<FacetFilters>(NO_FACETS);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [highlighted, setHighlighted] = useState<Set<string>>(() => new Set());
  /** Bumped when rows are added, so the table replays its entrance from the top. */
  const [revision, setRevision] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  // Typing stays responsive; the table catches up with the deferred value.
  const deferredQuery = useDeferredValue(query);

  // Notices dismiss themselves (errors stay a little longer).
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), notice.tone === "error" ? 7000 : 3800);
    return () => clearTimeout(timer);
  }, [notice]);

  // Row flashes end with their animation, so the same row can flash again later.
  useEffect(() => {
    if (highlighted.size === 0) return;
    const timer = setTimeout(() => setHighlighted(new Set()), 2500);
    return () => clearTimeout(timer);
  }, [highlighted]);

  const say = (text: string, tone: Notice["tone"] = "success") => setNotice({ id: Date.now(), text, tone });

  const visible = useMemo(
    () => students.filter((s) => matchesFilters(s, deferredQuery, facets, currentTermId)),
    [students, deferredQuery, facets, currentTermId],
  );

  const countMatches = useCallback(
    (draft: FacetFilters) => students.reduce((n, s) => n + (matchesFilters(s, query, draft, currentTermId) ? 1 : 0), 0),
    [students, query, currentTermId],
  );

  const counts = useMemo(() => countByStatus(students, currentTermId), [students, currentTermId]);

  const addedThisTerm = useMemo(() => {
    if (!currentTerm) return 0;
    const start = Date.parse(currentTerm.startDate);
    return students.filter((s) => s.createdAt && Date.parse(s.createdAt) >= start).length;
  }, [students, currentTerm]);

  const totalTrend = useMemo(() => growthTrend(students, loadedAt), [students, loadedAt]);

  const termName = currentTermId ?? "the current term";
  const stats: StudentStat[] = [
    {
      label: "Total students",
      value: students.length,
      detail: currentTerm ? `+${addedThisTerm} this term` : "no term yet",
      tone: "blue",
      trend: totalTrend,
    },
    { label: "Enrolled this term", value: counts.enrolled, detail: `in ${termName}`, tone: "blue" },
    { label: "Not updated", value: counts["not-updated"], detail: `need ${termName} enrollment`, tone: "gold" },
    { label: "On leave (LOA)", value: counts.loa, detail: "not eligible to vote", tone: "gold" },
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

  const plural = (count: number) => `${count.toLocaleString("en-US")} student${count === 1 ? "" : "s"}`;

  /**
   * Saves a term / year / status change for the selected students, then mirrors it locally.
   * The backend only changes students who already have an enrollment.
   */
  async function bulkUpdate(
    changes: { term?: string; year?: YearLevel; status?: EnrollmentStatus },
    describe: (count: string) => string,
  ) {
    if (bulkBusy || selected.size === 0) return;
    const ids = [...selected];
    const byNo = new Map(students.map((s) => [s.studentNo, s]));
    const target = new Set(ids.filter((id) => {
      const s = byNo.get(id);
      return s !== undefined && hasEnrollment(s);
    }));

    setBulkBusy(true);
    try {
      const updated = await bulkUpdateEnrollments(ids, changes);
      setStudents((list) =>
        list.map((s) =>
          target.has(s.studentNo)
            ? {
                ...s,
                term: changes.term ?? s.term,
                year: changes.year ?? s.year,
                enrollmentStatus: changes.status ?? s.enrollmentStatus,
              }
            : s,
        ),
      );
      setHighlighted(target);
      const skipped = ids.length - updated;
      say(`${describe(plural(updated))}${skipped > 0 ? ` ${plural(skipped)} skipped (no enrollment yet).` : ""}`);
    } catch (error) {
      say(getStudentsErrorMessage(error), "error");
    } finally {
      setBulkBusy(false);
    }
  }

  /* ------------------------------------ adding ------------------------------------ */

  /** Shows every student again so new rows are visible at the top. */
  function revealAdded(studentNos: string[]) {
    setQuery("");
    setFacets(NO_FACETS);
    setRevision((r) => r + 1);
    setHighlighted(new Set(studentNos));
  }

  async function addStudent(student: Student) {
    let saved: Student;
    try {
      saved = await createStudent(student);
    } catch (error) {
      throw new Error(getStudentsErrorMessage(error));
    }
    setStudents((list) => [saved, ...list.filter((s) => s.studentNo !== saved.studentNo)]);
    revealAdded([saved.studentNo]);
    say(`Added ${formatStudentName(saved)} · enrolled in ${saved.term ?? student.term}.`);
  }

  async function applyImport({ added, updated }: { added: Student[]; updated: Student[] }) {
    const created = await settleInBatches(added, IMPORT_CONCURRENCY, createStudent);
    const changed = await settleInBatches(updated, IMPORT_CONCURRENCY, async (s) => {
      await updateEnrollment(s);
      return s;
    });

    const ok = [...created, ...changed].flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    const failures = [...created, ...changed].flatMap((r) => (r.status === "rejected" ? [r.reason as unknown] : []));
    const okAdded = created.filter((r) => r.status === "fulfilled").length;
    const okUpdated = ok.length - okAdded;

    if (ok.length === 0) {
      throw new Error(`Nothing was imported. ${getStudentsErrorMessage(failures[0])}`);
    }

    setStudents((list) => {
      const byNo = new Map(ok.map((s) => [s.studentNo, s]));
      const known = new Set(list.map((s) => s.studentNo));
      return [...ok.filter((s) => !known.has(s.studentNo)), ...list.map((s) => byNo.get(s.studentNo) ?? s)];
    });
    revealAdded(ok.map((s) => s.studentNo));

    const summary = `Imported ${okAdded} new · ${okUpdated} updated.`;
    if (failures.length) {
      say(`${summary} ${failures.length} failed: ${getStudentsErrorMessage(failures[0])}`, "error");
    } else {
      say(summary);
    }
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
        count={selected.size}
        busy={bulkBusy}
        onSetTerm={() => {
          if (!currentTermId) return;
          void bulkUpdate({ term: currentTermId }, (n) => `Set term → ${currentTermId} for ${n}.`);
        }}
        onSetYear={(year: YearLevel) => {
          void bulkUpdate({ year }, (n) => `Set year → ${formatYear(year)} for ${n}.`);
        }}
        onUpsert={() => {
          if (!currentTermId) return;
          void bulkUpdate(
            { term: currentTermId, status: "Active" },
            (n) => `Enrolled ${n} as active in ${currentTermId}.`,
          );
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
            role={notice.tone === "error" ? "alert" : undefined}
            className="flex max-w-sm animate-in items-start gap-2.5 rounded-lg border border-border bg-popover px-3.5 py-2.5 text-[0.8125rem] leading-5 text-popover-foreground shadow-[0_14px_36px_-14px_rgb(15_23_42/0.4)] duration-300 fade-in slide-in-from-bottom-2 motion-reduce:animate-none"
          >
            {notice.tone === "error" ? (
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
            ) : (
              <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-blue dark:text-[#7aa7e6]" />
            )}
            {notice.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}
