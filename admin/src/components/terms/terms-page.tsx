"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, CircleCheck, LoaderCircle, Plus, Search, X } from "lucide-react";

import { usePageDescription } from "@/components/dashboard/page-description";
import { Caret, OptionMenu } from "@/components/students/option-menu";
import { primaryButtonClassName, toolbarButtonClassName } from "@/components/students/student-toolbar-styles";
import { formatDate, todayIso, type IsoDate } from "@/lib/dates";
import { formatAcadYear, formatTermTitle, getTermStatus, sortTerms } from "@/lib/terms";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/services/api/error-message";
import {
  createTerm,
  deleteTerm,
  fetchElectionTermIds,
  fetchEnrollmentSummaries,
  fetchTerms,
  moveEnrollmentsToTerm,
  updateTermDates,
} from "@/services/terms/terms.service";
import type { EnrollmentSummary, NewTermInput, Term, TermUsage } from "@/types/term.types";

import { NewTermForm } from "./new-term-form";
import { RolloverDialog } from "./rollover-dialog";
import { DeleteTermDialog, EditTermDialog } from "./term-dialogs";
import { TermTabs, type TermTab } from "./term-tabs";
import { TermsTable } from "./terms-table";
import styles from "./terms.module.css";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      terms: Term[];
      /** `null` when the list couldn't be loaded (usage counts are then unknown). */
      enrollments: EnrollmentSummary[] | null;
      electionTermIds: string[] | null;
      today: IsoDate;
    };

/**
 * Terms page: loads the terms (plus enrollments and elections, for usage counts
 * and the roll-over) from the ASP.NET Core Web API, then renders the workspace.
 */
export function TermsPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    Promise.all([
      fetchTerms({ signal }),
      // Optional: the page still works without them.
      fetchEnrollmentSummaries({ signal }).catch(() => null),
      fetchElectionTermIds({ signal }).catch(() => null),
    ])
      .then(([terms, enrollments, electionTermIds]) =>
        setState({ status: "ready", terms, enrollments, electionTermIds, today: todayIso() }),
      )
      .catch((error: unknown) => {
        if (!signal.aborted) setState({ status: "error", message: getApiErrorMessage(error) });
      });

    return () => controller.abort();
  }, [attempt]);

  if (state.status === "loading") {
    return (
      <div className="flex min-h-80 items-center justify-center gap-2.5 px-4 text-[0.875rem] text-muted-foreground" role="status">
        <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
        Loading terms…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex min-h-80 flex-col items-center justify-center gap-3 px-4 text-center">
        <CircleAlert aria-hidden className="size-6 text-destructive" strokeWidth={1.75} />
        <div>
          <p className="text-[0.9375rem] font-semibold text-foreground">Couldn&apos;t load the terms</p>
          <p role="alert" className="mt-1 max-w-md text-[0.8125rem] leading-5 text-muted-foreground">
            {state.message}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setState({ status: "loading" });
            setAttempt((n) => n + 1);
          }}
          className={cn(toolbarButtonClassName, "h-8 px-3.5 text-[0.8125rem]")}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <TermsWorkspace
      key={attempt}
      initialTerms={state.terms}
      initialEnrollments={state.enrollments}
      electionTermIds={state.electionTermIds}
      today={state.today}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Workspace                                 */
/* -------------------------------------------------------------------------- */

interface Notice {
  id: number;
  text: string;
  tone: "success" | "error";
}

interface WorkspaceProps {
  initialTerms: Term[];
  initialEnrollments: EnrollmentSummary[] | null;
  electionTermIds: string[] | null;
  today: IsoDate;
}

function TermsWorkspace({ initialTerms, initialEnrollments, electionTermIds, today }: WorkspaceProps) {
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const [terms, setTerms] = useState<Term[]>(() => sortTerms(initialTerms));
  const [enrollments, setEnrollments] = useState(initialEnrollments);
  const [tab, setTab] = useState<TermTab>("all");
  const [query, setQuery] = useState("");
  const [schoolYear, setSchoolYear] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [flashed, setFlashed] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState<Term | null>(null);
  const [deleting, setDeleting] = useState<Term | null>(null);
  const [rolloverOpen, setRolloverOpen] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), notice.tone === "error" ? 7000 : 3800);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (flashed.size === 0) return;
    const timer = setTimeout(() => setFlashed(new Set()), 2500);
    return () => clearTimeout(timer);
  }, [flashed]);

  const say = (text: string, tone: Notice["tone"] = "success") => setNotice({ id: Date.now(), text, tone });

  /* --------------------------------- derived --------------------------------- */

  const currentTerm = terms.find((t) => getTermStatus(t, today) === "current") ?? null;

  usePageDescription(
    currentTerm
      ? `School terms · current term ${currentTerm.id} · ${currentTerm.acadYear} Term ${currentTerm.termNumber}`
      : "School terms · no current term",
  );

  const usage = useMemo(() => {
    if (enrollments === null || electionTermIds === null) return null;
    const byTerm = new Map<string, TermUsage>();
    const entry = (id: string) => byTerm.get(id) ?? byTerm.set(id, { enrollments: 0, elections: 0 }).get(id)!;
    for (const e of enrollments) entry(e.termId).enrollments++;
    for (const id of electionTermIds) entry(id).elections++;
    return byTerm;
  }, [enrollments, electionTermIds]);
  const usageOf = useCallback(
    (id: string): TermUsage | null => (usage ? (usage.get(id) ?? { enrollments: 0, elections: 0 }) : null),
    [usage],
  );

  const counts = useMemo(() => {
    const c: Record<TermTab, number> = { all: terms.length, current: 0, upcoming: 0, ended: 0 };
    for (const t of terms) c[getTermStatus(t, today)]++;
    return c;
  }, [terms, today]);

  const schoolYears = useMemo(() => [...new Set(terms.map((t) => t.acadYear))].sort().reverse(), [terms]);

  const visible = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    return terms.filter((t) => {
      if (tab !== "all" && getTermStatus(t, today) !== tab) return false;
      if (schoolYear && t.acadYear !== schoolYear) return false;
      if (!needle) return true;
      const haystack = [t.id, t.acadYear, formatTermTitle(t), `term ${t.termNumber}`, formatDate(t.startDate), formatDate(t.endDate)]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [terms, tab, schoolYear, deferredQuery, today]);

  const resultKey = `${tab}|${schoolYear ?? ""}|${deferredQuery.trim().toLowerCase()}`;
  const filtersActive = query.trim() !== "" || schoolYear !== null;

  /* --------------------------------- actions --------------------------------- */

  const toggle = useCallback((id: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
    setConfirmBulk(false);
  }, []);

  function toggleAll(checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const t of visible) {
        if (checked) next.add(t.id);
        else next.delete(t.id);
      }
      return next;
    });
    setConfirmBulk(false);
  }

  /** Makes sure a term is visible after it's created or changed. */
  function reveal(term: Term) {
    const status = getTermStatus(term, today);
    if (tab !== "all" && tab !== status) setTab("all");
    if (schoolYear && schoolYear !== term.acadYear) setSchoolYear(null);
    setQuery("");
    setFlashed(new Set([term.id]));
  }

  async function handleCreate(input: NewTermInput) {
    let created: Term;
    try {
      created = await createTerm(input);
    } catch (error) {
      throw new Error(getApiErrorMessage(error));
    }
    setTerms((list) => sortTerms([created, ...list]));
    reveal(created);
    say(`Created ${created.id} · ${formatAcadYear(created.acadYear)} Term ${created.termNumber}.`);
  }

  async function handleSave(term: Term, startDate: IsoDate, endDate: IsoDate) {
    let saved: Term;
    try {
      saved = await updateTermDates(term.id, startDate, endDate);
    } catch (error) {
      throw new Error(getApiErrorMessage(error));
    }
    setTerms((list) => sortTerms(list.map((t) => (t.id === saved.id ? saved : t))));
    reveal(saved);
    say(`Saved ${saved.id} · ${formatDate(saved.startDate)} – ${formatDate(saved.endDate)}.`);
  }

  async function handleDelete(term: Term) {
    try {
      await deleteTerm(term.id);
    } catch (error) {
      throw new Error(getApiErrorMessage(error));
    }
    setTerms((list) => list.filter((t) => t.id !== term.id));
    setSelected((current) => {
      const next = new Set(current);
      next.delete(term.id);
      return next;
    });
    say(`Deleted ${term.id}.`);
  }

  async function handleRollover(from: Term, to: Term, studentIds: string[]) {
    let moved: number;
    try {
      moved = await moveEnrollmentsToTerm(studentIds, to.id);
    } catch (error) {
      throw new Error(getApiErrorMessage(error));
    }
    const ids = new Set(studentIds);
    setEnrollments((list) => list?.map((e) => (ids.has(e.studentId) ? { ...e, termId: to.id } : e)) ?? list);
    reveal(to);
    say(`Moved ${moved} student${moved === 1 ? "" : "s"} from ${from.id} to ${to.id}.`);
  }

  /** Deletes the selected terms that aren't in use; reports the rest. */
  async function deleteSelected() {
    const chosen = terms.filter((t) => selected.has(t.id));
    const deletable = chosen.filter((t) => {
      const u = usageOf(t.id);
      return u === null || u.enrollments + u.elections === 0;
    });
    setBulkBusy(true);
    const results = await Promise.allSettled(deletable.map((t) => deleteTerm(t.id).then(() => t.id)));
    setBulkBusy(false);
    setConfirmBulk(false);

    const deleted = new Set(results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])));
    setTerms((list) => list.filter((t) => !deleted.has(t.id)));
    setSelected(new Set());
    const kept = chosen.length - deleted.size;
    if (kept === 0) say(`Deleted ${deleted.size} term${deleted.size === 1 ? "" : "s"}.`);
    else say(`Deleted ${deleted.size} · ${kept} kept because enrollments or elections still use them.`, kept === chosen.length ? "error" : "success");
  }

  /* ---------------------------------- render ---------------------------------- */

  return (
    <div className="px-4 pt-4 pb-28 sm:px-6 lg:px-8">
      <TermTabs
        value={tab}
        onChange={(next) => {
          setTab(next);
          setSelected(new Set());
        }}
        counts={counts}
      />

      <div className="mt-5 grid grid-cols-1 items-start gap-x-6 gap-y-5 min-[85rem]:grid-cols-[minmax(0,1fr)_22.5rem]">
        {/* Toolbar */}
        <div className={cn("flex flex-wrap items-center gap-2.5 min-[85rem]:col-span-2", styles.riseIn)}>
          <div className="relative min-w-0 flex-1 sm:w-60 sm:flex-none">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.25 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && query) {
                  e.preventDefault();
                  setQuery("");
                }
              }}
              placeholder="Search terms"
              aria-label="Search terms"
              className={cn(
                "h-8.5 w-full rounded-md border border-border bg-background pl-8.75 text-[0.875rem] text-foreground outline-none placeholder:text-muted-foreground",
                query ? "pr-8" : "pr-2",
                "transition-[border-color,box-shadow] duration-200 hover:border-[color-mix(in_oklab,var(--color-brand-muted)_38%,transparent)]",
                "focus:border-brand-blue/60 focus:ring-3 focus:ring-brand-blue/15 [&::-webkit-search-cancel-button]:hidden",
              )}
            />
            <button
              type="button"
              aria-label="Clear search"
              tabIndex={query ? 0 : -1}
              aria-hidden={!query}
              onClick={() => setQuery("")}
              className={cn(
                "absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-muted-foreground",
                "transition-[opacity,scale,background-color,color] duration-200 hover:bg-muted hover:text-foreground",
                query ? "scale-100 opacity-100" : "pointer-events-none scale-75 opacity-0",
              )}
            >
              <X aria-hidden className="size-3.5" />
            </button>
          </div>

          <OptionMenu<string>
            label="Filter by school year"
            value={schoolYear}
            options={schoolYears.map((y) => ({ value: y, label: formatAcadYear(y) }))}
            onChange={(y) => setSchoolYear(y)}
            clearLabel="All school years"
            triggerClassName={cn(toolbarButtonClassName, "gap-1 px-3", schoolYear && "border-[color-mix(in_oklab,var(--color-brand-navy)_35%,transparent)] dark:border-white/25")}
          >
            {schoolYear ? formatAcadYear(schoolYear) : "School year"}
            <Caret />
          </OptionMenu>

          <div className="flex w-full items-center gap-2.5 sm:ml-auto sm:w-auto">
            <button type="button" onClick={() => setRolloverOpen(true)} className={cn(toolbarButtonClassName, "gap-2 px-3.5")}>
              <Plus aria-hidden className="size-4" strokeWidth={1.75} />
              Roll over enrollment
            </button>
            <button
              type="button"
              onClick={() => {
                const field = firstFieldRef.current;
                field?.scrollIntoView({ behavior: "smooth", block: "center" });
                field?.focus({ preventScroll: true });
              }}
              className={primaryButtonClassName}
            >
              + New term
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="min-w-0 min-[85rem]:col-start-1 min-[85rem]:row-start-2">
          <TermsTable
            terms={visible}
            today={today}
            selected={selected}
            onToggle={toggle}
            onToggleAll={toggleAll}
            onOpen={setEditing}
            flashed={flashed}
            resultKey={resultKey}
            empty={
              <>
                <p className="text-[0.875rem] font-medium text-foreground">
                  {terms.length === 0 ? "No terms yet" : filtersActive ? "No terms match" : `No ${tab} terms`}
                </p>
                <p className="mt-1 text-[0.8125rem] text-muted-foreground">
                  {terms.length === 0 ? "Create the first one with the New term form." : filtersActive ? "Try another search or school year." : "Terms move here based on their dates."}
                </p>
                {filtersActive ? (
                  <button
                    type="button"
                    className={cn(toolbarButtonClassName, "mt-3.5 h-8 text-[0.8125rem]")}
                    onClick={() => {
                      setQuery("");
                      setSchoolYear(null);
                    }}
                  >
                    Clear search &amp; school year
                  </button>
                ) : null}
              </>
            }
          />
          <p className="px-2 pt-4 font-mono text-[0.6875rem] text-muted-foreground">
            Status comes from start/end dates. Students need a new enrollment row each term.
          </p>
        </div>

        <NewTermForm
          terms={terms}
          today={today}
          onCreate={handleCreate}
          firstFieldRef={firstFieldRef}
          className="min-[85rem]:col-start-2 min-[85rem]:row-start-2"
        />
      </div>

      {/* Selection bar */}
      <div
        role="toolbar"
        aria-label="Actions for selected terms"
        aria-hidden={selected.size === 0}
        inert={selected.size === 0}
        className={cn(
          "fixed bottom-6 left-1/2 z-40 max-w-[calc(100%-2rem)] -translate-x-1/2 md:left-[calc(16rem+(100%-16rem)/2)] min-[85rem]:left-[calc(18rem+(100%-44rem)/2)]",
          "flex items-center gap-1.5 rounded-[0.625rem] bg-brand-navy py-1.5 pr-1.5 pl-4",
          "shadow-[0_18px_40px_-14px_rgb(11_18_32/0.55),0_2px_6px_rgb(11_18_32/0.2)] dark:shadow-[0_0_0_1px_rgb(255_255_255/0.08),0_18px_40px_-14px_rgb(0_0_0/0.8)]",
          "transition-[opacity,translate] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-opacity",
          selected.size > 0 ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
        )}
      >
        <p className="shrink-0 pr-1.5 font-mono text-[0.75rem] whitespace-nowrap text-white/55" aria-live="polite">
          Selected: <span className="text-white/80 tabular-nums">{selected.size}</span>
        </p>
        <span aria-hidden className="h-4.5 w-px shrink-0 bg-white/18" />
        <button
          type="button"
          disabled={bulkBusy}
          onClick={() => (confirmBulk ? void deleteSelected() : setConfirmBulk(true))}
          className={cn(
            "inline-flex h-7.5 shrink-0 cursor-pointer items-center rounded-md px-2.5 text-[0.8125rem] font-medium whitespace-nowrap outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-white/30 disabled:cursor-wait disabled:opacity-60",
            confirmBulk ? "bg-[#d92d20] text-white hover:bg-[#b42318]" : "text-white hover:bg-white/10",
          )}
        >
          {bulkBusy ? "Deleting…" : confirmBulk ? `Confirm delete ${selected.size}?` : "Delete"}
        </button>
        <button
          type="button"
          onClick={() => {
            setSelected(new Set());
            setConfirmBulk(false);
          }}
          className="h-7.5 shrink-0 cursor-pointer rounded-md bg-white px-3.5 text-[0.8125rem] font-semibold text-brand-navy outline-none transition-colors duration-150 hover:bg-white/88 focus-visible:ring-2 focus-visible:ring-white/50"
        >
          Clear
        </button>
      </div>

      <EditTermDialog
        term={editing}
        terms={terms}
        today={today}
        onClose={() => setEditing(null)}
        onSave={handleSave}
        onRequestDelete={(term) => {
          setEditing(null);
          setDeleting(term);
        }}
      />
      <DeleteTermDialog
        term={deleting}
        usage={deleting ? usageOf(deleting.id) : null}
        today={today}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
      />
      <RolloverDialog
        open={rolloverOpen}
        onOpenChange={setRolloverOpen}
        terms={terms}
        enrollments={enrollments}
        currentTerm={currentTerm}
        onRollover={handleRollover}
      />

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
