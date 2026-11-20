"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";

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

import { AddStudentDialog } from "./add-student-dialog";
import { BulkActionBar } from "./bulk-action-bar";
import { CsvImportDialog, type ImportOutcome } from "./csv-import-dialog";
import { StudentCatalogProvider, useStudentCatalog } from "./student-catalog";
import { StudentStats, type StudentStat } from "./student-stats";
import { StudentTable } from "./student-table";
import { StudentToolbar } from "./student-toolbar";
import { toolbarButtonClassName } from "./student-toolbar-styles";
import { StudentsSkeleton } from "./students-skeleton";

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

  const setCatalog = useCallback(
    (catalog: StudentCatalog) => setState((current) => (current.status === "ready" ? { ...current, catalog } : current)),
    [],
  );

  if (state.status === "loading") return <StudentsSkeleton />;

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
      <StudentsRoster key={attempt} initialStudents={state.students} loadedAt={state.loadedAt} onCatalog={setCatalog} />
    </StudentCatalogProvider>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Helpers                                  */
/* -------------------------------------------------------------------------- */

/** Runs `task` over `items`, a few at a time, never rejects, and reports how many are done. */
async function settleInBatches<T, R>(items: readonly T[], size: number, task: (item: T) => Promise<R>, onSettled?: (count: number) => void) {
  const results: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += size) {
    results.push(...(await Promise.allSettled(items.slice(i, i + size).map(task))));
    onSettled?.(results.length);
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

// No program check: careers without programs (e.g. JHS) enroll students with program = null.
const hasEnrollment = (s: Student) => s.careerCode !== null && s.year !== null && s.term !== null;

/** "Tertiary" stays a word; longer career names ("Senior High School") use their code. */
const careerWord = (career: { code: string; name: string }) => (career.name.length <= 10 ? career.name : career.code);

/* -------------------------------------------------------------------------- */
/*                                   Roster                                   */
/* -------------------------------------------------------------------------- */

interface Notice {
  id: number;
  text: string;
  tone: "success" | "error";
}

interface RosterProps {
  initialStudents: Student[];
  loadedAt: number;
  /** Replaces the catalog after a refresh. */
  onCatalog: (catalog: StudentCatalog) => void;
}

function StudentsRoster({ initialStudents, loadedAt, onCatalog }: RosterProps) {
  const catalog = useStudentCatalog();
  const currentTerm = catalog.currentTerm;
  const currentTermId = currentTerm?.id ?? null;

  const [students, setStudents] = useState<Student[]>(initialStudents);
  const [query, setQuery] = useState("");
  const [facets, setFacets] = useState<FacetFilters>(NO_FACETS);
  const [career, setCareer] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [highlighted, setHighlighted] = useState<Set<string>>(() => new Set());
  /** Bumped when rows are added or reloaded, so the table replays its entrance from the top. */
  const [revision, setRevision] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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

  const inCareer = useCallback((s: Student) => career === null || s.careerCode === career, [career]);

  const visible = useMemo(
    () => students.filter((s) => inCareer(s) && matchesFilters(s, deferredQuery, facets, currentTermId)),
    [students, inCareer, deferredQuery, facets, currentTermId],
  );

  const countMatches = useCallback(
    (draft: FacetFilters) => students.reduce((n, s) => n + (inCareer(s) && matchesFilters(s, query, draft, currentTermId) ? 1 : 0), 0),
    [students, inCareer, query, currentTermId],
  );

  const counts = useMemo(() => countByStatus(students, currentTermId), [students, currentTermId]);

  const careerCounts = useMemo(() => {
    const byCareer: Record<string, number> = {};
    for (const s of students) if (s.careerCode) byCareer[s.careerCode] = (byCareer[s.careerCode] ?? 0) + 1;
    return { total: students.length, byCareer };
  }, [students]);

  const addedThisTerm = useMemo(() => {
    if (!currentTerm) return 0;
    const start = Date.parse(currentTerm.startDate);
    return students.filter((s) => s.createdAt && Date.parse(s.createdAt) >= start).length;
  }, [students, currentTerm]);

  const totalTrend = useMemo(() => growthTrend(students, loadedAt), [students, loadedAt]);

  const careerBreakdown = catalog.careers
    .filter((c) => careerCounts.byCareer[c.code])
    .map((c) => `${careerCounts.byCareer[c.code].toLocaleString("en-US")} ${careerWord(c)}`)
    .join(" · ");

  const termName = currentTermId ?? "the current term";
  const stats: StudentStat[] = [
    {
      label: "Total students",
      value: students.length,
      detail: catalog.careers.length > 1 && careerBreakdown ? careerBreakdown : currentTerm ? `+${addedThisTerm} this term` : "no term yet",
      tone: "blue",
      trend: totalTrend,
    },
    { label: "Enrolled this term", value: counts.enrolled, detail: `in ${termName}`, tone: "blue" },
    { label: "Not updated", value: counts["not-updated"], detail: `need ${termName} enrollment`, tone: "gold" },
    { label: "On leave (LOA)", value: counts.loa, detail: "not eligible to vote", tone: "gold" },
  ];

  const existingStudentNos = useMemo(() => new Set(students.map((s) => s.studentNo)), [students]);
  const existingEmails = useMemo(() => new Set(students.map((s) => s.email.toLowerCase())), [students]);

  const resultKey = `${deferredQuery.trim().toLowerCase()}|${JSON.stringify(facets)}|${career ?? ""}|${revision}`;

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

  /* ------------------------------------ data ------------------------------------- */

  /** Reloads the roster and catalog in place, keeping search, filters and the selection that still exists. */
  async function refresh() {
    setRefreshing(true);
    try {
      const [nextCatalog, nextStudents] = await Promise.all([fetchStudentCatalog(), fetchStudents()]);
      onCatalog(nextCatalog);
      setStudents(nextStudents);
      const known = new Set(nextStudents.map((s) => s.studentNo));
      setSelected((current) => new Set([...current].filter((no) => known.has(no))));
      setRevision((r) => r + 1);
    } catch (error) {
      say(`Couldn't refresh. ${getStudentsErrorMessage(error)}`, "error");
    } finally {
      setRefreshing(false);
    }
  }

  /** Shows every student again so new rows are visible at the top. */
  function revealAdded(studentNos: string[]) {
    setQuery("");
    setFacets(NO_FACETS);
    setCareer(null);
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

  async function applyImport(
    { added, updated }: { added: Student[]; updated: Student[] },
    onProgress: (done: number, total: number) => void,
  ): Promise<ImportOutcome> {
    const total = added.length + updated.length;
    const created = await settleInBatches(added, IMPORT_CONCURRENCY, createStudent, (n) => onProgress(n, total));
    const changed = await settleInBatches(
      updated,
      IMPORT_CONCURRENCY,
      async (s) => {
        await updateEnrollment(s);
        return s;
      },
      (n) => onProgress(added.length + n, total),
    );

    const ok = [...created, ...changed].flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    const failures = [...created, ...changed].flatMap((r) => (r.status === "rejected" ? [r.reason as unknown] : []));
    const okAdded = created.filter((r) => r.status === "fulfilled").length;

    if (ok.length > 0) {
      setStudents((list) => {
        const byNo = new Map(ok.map((s) => [s.studentNo, s]));
        const known = new Set(list.map((s) => s.studentNo));
        return [...ok.filter((s) => !known.has(s.studentNo)), ...list.map((s) => byNo.get(s.studentNo) ?? s)];
      });
      revealAdded(ok.map((s) => s.studentNo));
    }

    return {
      added: okAdded,
      updated: ok.length - okAdded,
      failed: failures.length,
      firstError: failures.length ? getStudentsErrorMessage(failures[0]) : null,
    };
  }

  const filtersActive = query.trim() !== "" || countFacets(facets) > 0 || career !== null;

  return (
    <div className="px-4 pt-0 pb-28 sm:px-6 lg:px-8">
      <StudentStats stats={stats} />

      <StudentToolbar
        query={query}
        onQueryChange={setQuery}
        facets={facets}
        onFacetsChange={setFacets}
        countMatches={countMatches}
        careers={catalog.careers}
        careerCounts={careerCounts}
        career={career}
        onCareerChange={setCareer}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        onImport={() => setImportOpen(true)}
        onAddStudent={() => setAddOpen(true)}
        className="mt-5"
      />

      <div className="mt-5.5 min-w-0">
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
                  setCareer(null);
                }}
              >
                Clear search &amp; filters
              </button>
            ) : null
          }
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

      <AddStudentDialog open={addOpen} onOpenChange={setAddOpen} existingStudentNos={existingStudentNos} existingEmails={existingEmails} onAdd={addStudent} />
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
