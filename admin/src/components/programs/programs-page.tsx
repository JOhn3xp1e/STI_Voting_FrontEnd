"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
import { Plus, RotateCw } from "lucide-react";

import styles from "@/components/shared/motion.module.css";
import { PageError, SearchInput, Toast, useNotice } from "@/components/shared/page-feedback";
import { ProgramsSkeleton } from "./programs-skeleton";
import { SelectionBar } from "@/components/shared/selection-bar";
import { UnderlineTabs } from "@/components/shared/underline-tabs";
import { Caret, OptionMenu } from "@/components/students/option-menu";
import { toolbarButtonClassName } from "@/components/students/student-toolbar-styles";
import { todayIso } from "@/lib/dates";
import { careerColor, careerTabLabel, sortCareers, sortPrograms, type ProgramImportRow } from "@/lib/programs";
import { getTermStatus, sortTerms } from "@/lib/terms";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/services/api/error-message";
import {
  createCareer,
  createProgram,
  deleteCareer,
  deleteProgram,
  fetchCareers,
  fetchElectionScopes,
  fetchPrograms,
  updateCareer,
  updateProgram,
} from "@/services/programs/programs.service";
import { fetchEnrollmentSummaries, fetchTerms } from "@/services/terms/terms.service";
import type { Career, CareerInput, ElectionScope, Program, ProgramInput } from "@/types/program.types";
import type { EnrollmentSummary, Term } from "@/types/term.types";

import { CareersTable } from "./careers-table";
import { ImportProgramsDialog } from "./import-programs-dialog";
import { CareerDialog, DeleteCareerDialog, DeleteProgramDialog, ProgramDialog, type EditorState, type Usage } from "./program-dialogs";
import { ProgramsTable, type ProgramCareer } from "./programs-table";

interface PageData {
  careers: Career[];
  programs: Program[];
  /** Optional data (`null` when it couldn't be loaded). */
  enrollments: EnrollmentSummary[] | null;
  terms: Term[] | null;
  elections: ElectionScope[] | null;
}

type LoadState = { status: "loading" } | { status: "error"; message: string } | ({ status: "ready" } & PageData);

/** Careers and programs are required; the rest only adds counts and delete warnings. */
async function loadPageData(signal?: AbortSignal): Promise<PageData> {
  const [careers, programs, enrollments, terms, elections] = await Promise.all([
    fetchCareers({ signal }),
    fetchPrograms({ signal }),
    fetchEnrollmentSummaries({ signal }).catch(() => null),
    fetchTerms({ signal }).catch(() => null),
    fetchElectionScopes({ signal }).catch(() => null),
  ]);
  return { careers, programs, enrollments, terms, elections };
}

/** Programs & careers: loads both lists (plus enrollments, terms and elections for counts) from the Web API. */
export function ProgramsPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    loadPageData(signal)
      .then((data) => setState({ status: "ready", ...data }))
      .catch((error: unknown) => {
        if (!signal.aborted) setState({ status: "error", message: getApiErrorMessage(error) });
      });

    return () => controller.abort();
  }, [attempt]);

  if (state.status === "loading") return <ProgramsSkeleton />;
  if (state.status === "error") {
    return (
      <PageError
        title="Couldn't load programs & careers"
        message={state.message}
        onRetry={() => {
          setState({ status: "loading" });
          setAttempt((n) => n + 1);
        }}
      />
    );
  }

  return (
    <ProgramsWorkspace key={attempt} initial={state} />
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Workspace                                 */
/* -------------------------------------------------------------------------- */

/** Dark square "+" at the right of a section heading. */
function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex size-6 cursor-pointer items-center justify-center rounded-md bg-brand-background text-white outline-none dark:bg-white dark:text-brand-background",
        "transition-[background-color,translate,box-shadow,scale] duration-200 ease-out",
        "hover:-translate-y-px hover:bg-[color-mix(in_oklab,var(--color-brand-background)_84%,var(--color-brand-blue))] hover:shadow-[0_8px_16px_-8px_var(--color-brand-blue)]",
        "focus-visible:ring-3 focus-visible:ring-brand-blue/30 active:translate-y-0 active:scale-95 motion-reduce:hover:translate-y-0 dark:hover:bg-white/90",
      )}
    >
      <Plus aria-hidden className="size-4" strokeWidth={2.4} />
    </button>
  );
}

function SectionHeading({ title, hint, action }: { title: string; hint: string; action: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3">
      <h2 className="flex min-w-0 items-baseline gap-2">
        <span className="font-mono text-[0.75rem] font-semibold tracking-[0.14em] text-foreground uppercase">{title}</span>
        <span className="truncate font-mono text-[0.65625rem] text-muted-foreground">{hint}</span>
      </h2>
      {action}
    </div>
  );
}

function ProgramsWorkspace({ initial }: { initial: PageData }) {
  const [careers, setCareers] = useState(() => sortCareers(initial.careers));
  const [programs, setPrograms] = useState(() => sortPrograms(initial.programs));
  const [{ enrollments, terms, elections }, setExtras] = useState(() => ({ enrollments: initial.enrollments, terms: initial.terms, elections: initial.elections }));
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [flashed, setFlashed] = useState<Set<string>>(() => new Set());
  const [careerEditor, setCareerEditor] = useState<EditorState<Career>>(null);
  const [programEditor, setProgramEditor] = useState<EditorState<Program>>(null);
  const [deletingCareer, setDeletingCareer] = useState<Career | null>(null);
  const [deletingProgram, setDeletingProgram] = useState<Program | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const { notice, say } = useNotice();

  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    if (flashed.size === 0) return;
    const timer = setTimeout(() => setFlashed(new Set()), 2500);
    return () => clearTimeout(timer);
  }, [flashed]);

  /* --------------------------------- derived --------------------------------- */

  // Student counts come from the current term (else the newest one).
  const countTerm = useMemo(() => {
    if (!terms?.length) return null;
    const today = todayIso();
    return terms.find((t) => getTermStatus(t, today) === "current") ?? sortTerms(terms)[0];
  }, [terms]);

  const studentsByProgram = useMemo(() => {
    if (!enrollments || !countTerm) return null;
    const counts = new Map<string, number>();
    for (const e of enrollments) {
      // Students without a program (careers with no programs, e.g. JHS) don't count toward any program.
      if (e.termId === countTerm.id && e.status.toLowerCase() === "active" && e.programCode) {
        const key = e.programCode.toUpperCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return counts;
  }, [enrollments, countTerm]);

  const studentsOf = useCallback((code: string) => (studentsByProgram ? (studentsByProgram.get(code.toUpperCase()) ?? 0) : null), [studentsByProgram]);

  /** Every enrollment (any term) and election voter filter that points at a code. */
  const usageOf = useCallback(
    (kind: "career" | "program", code: string): Usage => {
      const key = code.toUpperCase();
      return {
        enrollments: enrollments ? enrollments.filter((e) => (kind === "career" ? e.careerCode : e.programCode)?.toUpperCase() === key).length : null,
        elections: elections
          ? elections.filter((e) => (kind === "career" ? e.careerScope : e.programScope).some((c) => c.toUpperCase() === key)).map((e) => e.title)
          : null,
      };
    },
    [enrollments, elections],
  );

  const colorOf = useCallback((career: Career) => careerColor(career, careers), [careers]);

  /** Program code -> the career that lists it (a program belongs to one career). */
  const careerByProgram = useMemo(() => {
    const map = new Map<string, ProgramCareer>();
    for (const career of careers) {
      const entry = { code: career.code, color: careerColor(career, careers) };
      for (const code of career.programScope) if (!map.has(code.toUpperCase())) map.set(code.toUpperCase(), entry);
    }
    return map;
  }, [careers]);

  const careerOf = useCallback((code: string) => careerByProgram.get(code.toUpperCase()) ?? null, [careerByProgram]);

  const needle = deferredQuery.trim().toLowerCase();
  const matches = (item: { code: string; name: string }) => !needle || `${item.code} ${item.name}`.toLowerCase().includes(needle);

  // The career tabs narrow both lists: the career itself, and the programs it lists.
  const visibleCareers = careers.filter((c) => (tab === "all" || c.code === tab) && matches(c));
  const visiblePrograms = programs.filter((p) => (tab === "all" || careerOf(p.code)?.code === tab) && matches(p));

  const tabs = useMemo(() => [{ value: "all", label: "All" }, ...careers.map((c) => ({ value: c.code, label: careerTabLabel(c) }))], [careers]);
  const resultKey = `${tab}|${needle}`;

  /* --------------------------------- actions --------------------------------- */

  const toggle = useCallback((code: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(code);
      else next.delete(code);
      return next;
    });
  }, []);

  function toggleAll(checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const p of visiblePrograms) {
        if (checked) next.add(p.code);
        else next.delete(p.code);
      }
      return next;
    });
  }

  function flash(code: string) {
    setQuery("");
    setFlashed(new Set([code]));
  }

  /** Reloads every list in place, keeping the tab, search and selection. */
  async function refresh() {
    setRefreshing(true);
    try {
      const data = await loadPageData();
      setCareers(sortCareers(data.careers));
      setPrograms(sortPrograms(data.programs));
      setExtras({ enrollments: data.enrollments, terms: data.terms, elections: data.elections });
      const known = new Set(data.programs.map((p) => p.code));
      setSelected((current) => new Set([...current].filter((code) => known.has(code))));
      if (tab !== "all" && !data.careers.some((c) => c.code === tab)) setTab("all");
    } catch (error) {
      say(`Couldn't refresh. ${getApiErrorMessage(error)}`, "error");
    } finally {
      setRefreshing(false);
    }
  }

  /** Runs an API call; rethrows its failure as a user-facing message. */
  async function call<T>(request: Promise<T>): Promise<T> {
    try {
      return await request;
    } catch (error) {
      throw new Error(getApiErrorMessage(error));
    }
  }

  async function saveCareer(input: CareerInput, editingCode?: string) {
    if (editingCode) {
      const saved = await call(updateCareer(editingCode, { name: input.name, minLevel: input.minLevel, maxLevel: input.maxLevel, color: input.color, programScope: input.programScope }));
      setCareers((list) => sortCareers(list.map((c) => (c.code === editingCode ? saved : c))));
      flash(saved.code);
      say(`Saved ${saved.code} · ${saved.name}.`);
    } else {
      const created = await call(createCareer(input));
      setCareers((list) => sortCareers([...list, created]));
      setTab("all");
      flash(created.code);
      say(`Created ${created.code} · ${created.name}.`);
    }
  }

  async function saveProgram(input: ProgramInput, editingCode?: string) {
    if (editingCode) {
      const saved = await call(updateProgram(editingCode, input.name));
      setPrograms((list) => sortPrograms(list.map((p) => (p.code === editingCode ? saved : p))));
      flash(saved.code);
      say(`Saved ${saved.code} · ${saved.name}.`);
    } else {
      const created = await call(createProgram(input));
      setPrograms((list) => sortPrograms([...list, created]));
      flash(created.code);
      say(`Created ${created.code} · ${created.name}.`);
    }
  }

  async function removeCareer(career: Career) {
    await call(deleteCareer(career.code));
    setCareers((list) => list.filter((c) => c.code !== career.code));
    if (tab === career.code) setTab("all");
    say(`Deleted ${career.code}.`);
  }

  async function removeProgram(program: Program) {
    await call(deleteProgram(program.code));
    setPrograms((list) => list.filter((p) => p.code !== program.code));
    setSelected((current) => {
      const next = new Set(current);
      next.delete(program.code);
      return next;
    });
    say(`Deleted ${program.code}.`);
  }

  async function deleteSelected() {
    const chosen = programs.filter((p) => selected.has(p.code));
    const free = chosen.filter((p) => {
      const u = usageOf("program", p.code);
      return !u.enrollments && !u.elections?.length;
    });
    const results = await Promise.allSettled(free.map((p) => deleteProgram(p.code).then(() => p.code)));
    const deleted = new Set(results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])));
    setPrograms((list) => list.filter((p) => !deleted.has(p.code)));
    setSelected(new Set());
    const kept = chosen.length - deleted.size;
    if (kept === 0) say(`Deleted ${deleted.size} program${deleted.size === 1 ? "" : "s"}.`);
    else say(`Deleted ${deleted.size} · ${kept} kept because students or elections still use them.`, kept === chosen.length ? "error" : "success");
  }

  async function applyImport(rows: Extract<ProgramImportRow, { name: string }>[]) {
    const saved: Program[] = [];
    const failures: unknown[] = [];
    // One at a time keeps the order and the backend load predictable.
    for (const row of rows) {
      try {
        saved.push(row.action === "new" ? await createProgram({ code: row.code, name: row.name }) : await updateProgram(row.code, row.name));
      } catch (error) {
        failures.push(error);
      }
    }
    if (saved.length === 0) throw new Error(`Nothing was imported. ${getApiErrorMessage(failures[0])}`);

    setPrograms((list) => {
      const byCode = new Map(saved.map((p) => [p.code, p]));
      const known = new Set(list.map((p) => p.code));
      return sortPrograms([...list.map((p) => byCode.get(p.code) ?? p), ...saved.filter((p) => !known.has(p.code))]);
    });
    setQuery("");
    setFlashed(new Set(saved.map((p) => p.code)));
    const added = rows.filter((r) => r.action === "new").length;
    const summary = `Imported ${saved.length} program${saved.length === 1 ? "" : "s"}${added ? ` · ${added} new` : ""}.`;
    if (failures.length) say(`${summary} ${failures.length} failed: ${getApiErrorMessage(failures[0])}`, "error");
    else say(summary);
  }

  /* ---------------------------------- render ---------------------------------- */

  return (
    <div className="px-4 pt-4 pb-28 sm:px-6 lg:px-8">
      <UnderlineTabs label="Filter careers" tabs={tabs} value={tab} onChange={setTab} />

      {/* Toolbar */}
      <div className={cn("mt-5 flex flex-wrap items-center gap-2.5", styles.riseIn)}>
        <SearchInput value={query} onChange={setQuery} placeholder="Search programs" />
        <OptionMenu<string>
          label="Filter by career"
          value={tab === "all" ? null : tab}
          options={careers.map((c) => ({ value: c.code, label: c.code, hint: c.name }))}
          onChange={(code) => setTab(code ?? "all")}
          clearLabel="All careers"
          triggerClassName={cn(toolbarButtonClassName, "gap-1 px-3", tab !== "all" && "border-[color-mix(in_oklab,var(--color-brand-navy)_35%,transparent)] dark:border-white/25")}
        >
          {tab === "all" ? "Career" : tab}
          <Caret />
        </OptionMenu>
        <button type="button" onClick={() => setImportOpen(true)} className={cn(toolbarButtonClassName, "gap-2 px-3.5 sm:ml-auto")}>
          <Plus aria-hidden className="size-4" strokeWidth={1.75} />
          Import CSV
        </button>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          aria-label="Refresh"
          title="Refresh"
          className={cn(toolbarButtonClassName, "w-8.5 justify-center px-0 disabled:cursor-wait")}
        >
          <RotateCw aria-hidden className={cn("size-4", refreshing && "animate-spin motion-reduce:animate-none")} strokeWidth={1.75} />
        </button>
      </div>

      {/* Careers */}
      <section aria-label="Careers" className={cn("mt-6", styles.riseIn)} style={{ animationDelay: "60ms" }}>
        <SectionHeading title="Careers" hint="code · name · grade levels" action={<AddButton label="New career" onClick={() => setCareerEditor({ mode: "new" })} />} />
        <CareersTable
          careers={visibleCareers}
          flashed={flashed}
          resultKey={resultKey}
          onEdit={(career) => setCareerEditor({ mode: "edit", item: career })}
          colorOf={colorOf}
          emptyText={careers.length === 0 ? "No careers yet. Add one with the + button." : "No careers match."}
        />
      </section>

      {/* Programs */}
      <section aria-label="Programs" className={cn("mt-6", styles.riseIn)} style={{ animationDelay: "120ms" }}>
        <SectionHeading
          title="Programs"
          hint="filter by career with the tabs above"
          action={<AddButton label="New program" onClick={() => setProgramEditor({ mode: "new" })} />}
        />
        <ProgramsTable
          programs={visiblePrograms}
          studentsOf={studentsOf}
          careerOf={careerOf}
          selected={selected}
          onToggle={toggle}
          onToggleAll={toggleAll}
          onOpen={(program) => setProgramEditor({ mode: "edit", item: program })}
          flashed={flashed}
          resultKey={resultKey}
          empty={
            <>
              <p className="text-[0.875rem] font-medium text-foreground">{programs.length === 0 ? "No programs yet" : "No programs match"}</p>
              <p className="mt-1 text-[0.8125rem] text-muted-foreground">
                {programs.length === 0
                  ? "Add one with the + button, or import a CSV."
                  : tab !== "all" && !needle
                    ? `No programs are listed under ${tab} yet. Add them from Edit career.`
                    : "Try another search."}
              </p>
            </>
          }
        />
        <p className="px-2 pt-4 font-mono text-[0.6875rem] text-muted-foreground">
          Each program belongs to a career.{" "}
          {countTerm ? `Student counts come from active ${countTerm.id} enrollment.` : "Student counts appear once a term has enrollments."}
        </p>
      </section>

      <SelectionBar count={selected.size} noun="programs" onDelete={deleteSelected} onClear={() => setSelected(new Set())} />

      <CareerDialog
        state={careerEditor}
        careers={careers}
        programs={programs}
        onClose={() => setCareerEditor(null)}
        onSave={saveCareer}
        onRequestDelete={(career) => {
          setCareerEditor(null);
          setDeletingCareer(career);
        }}
      />
      <ProgramDialog
        state={programEditor}
        programs={programs}
        onClose={() => setProgramEditor(null)}
        onSave={saveProgram}
        onRequestDelete={(program) => {
          setProgramEditor(null);
          setDeletingProgram(program);
        }}
      />
      <DeleteCareerDialog career={deletingCareer} usageOf={(code) => usageOf("career", code)} onClose={() => setDeletingCareer(null)} onConfirm={removeCareer} />
      <DeleteProgramDialog program={deletingProgram} usageOf={(code) => usageOf("program", code)} onClose={() => setDeletingProgram(null)} onConfirm={removeProgram} />
      <ImportProgramsDialog open={importOpen} onOpenChange={setImportOpen} programs={programs} onApply={applyImport} />

      <Toast notice={notice} />
    </div>
  );
}
