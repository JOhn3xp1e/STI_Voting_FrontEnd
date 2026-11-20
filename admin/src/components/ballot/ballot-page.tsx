"use client";

import { useDeferredValue, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Check, ChevronDown, Pencil, Plus, RotateCw, Trash2, X } from "lucide-react";

import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import styles from "@/components/shared/motion.module.css";
import { PageError, SearchInput, Toast, useNotice } from "@/components/shared/page-feedback";
import { BallotSkeleton } from "./ballot-skeleton";
import { SelectionBar } from "@/components/shared/selection-bar";
import { Caret, OptionMenu } from "@/components/students/option-menu";
import { checkboxClassName } from "@/components/students/student-table";
import { primaryButtonClassName, toolbarButtonClassName } from "@/components/students/student-toolbar-styles";
import { CareerCode } from "@/components/programs/careers-table";
import { Checkbox } from "@/components/ui/checkbox";
import { useLeaving } from "@/hooks/use-leaving";
import { positionSummary, sortPositions, toCandidateRow, type CandidateRow } from "@/lib/ballot";
import { normalizeHex, sortPartylists } from "@/lib/partylists";
import { careerColor, sortCareers } from "@/lib/programs";
import { formatYear } from "@/lib/students";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/services/api/error-message";
import { deleteCandidate, deletePosition, fetchCandidates, fetchPositions } from "@/services/ballot/ballot.service";
import { fetchPartylists } from "@/services/partylists/partylists.service";
import { fetchCareers } from "@/services/programs/programs.service";
import { fetchStudents } from "@/services/students/students.service";
import type { Candidate, Position } from "@/types/ballot.types";
import type { Partylist } from "@/types/partylist.types";
import type { Career } from "@/types/program.types";
import type { Student } from "@/types/student.types";

import { CandidateDialog, type CandidateDialogTarget } from "./candidate-dialog";
import { CreatePositionDialog } from "./create-position-dialog";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      positions: Position[];
      candidates: Candidate[];
      parties: Partylist[];
      /** For candidates' names (`null` when the list couldn't be loaded; ids are shown instead). */
      students: Student[] | null;
      /** For the career tags' colors (`null` when the list couldn't be loaded; plain codes are shown instead). */
      careers: Career[] | null;
    };

/** Party filter value for candidates without a party. */
const INDEPENDENT = "__independent__";

/** Columns of the list view: checkbox, name, [career, program, level,] party list, photo, edit. */
const listGridClassName =
  "grid-cols-[2.375rem_minmax(0,1fr)_3rem] sm:grid-cols-[2.375rem_minmax(0,1fr)_9rem_5.5rem_3rem] xl:grid-cols-[2.375rem_minmax(0,1fr)_8.5rem_10rem_4.75rem_8rem_5.5rem_3.5rem]";

const iconButtonClassName =
  "flex size-7.5 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand-blue/30 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground";

/** Ballot checkboxes: navy with a gold tick when checked (gold with a navy tick in dark mode); the tick pops in. */
const ballotCheckboxClassName = cn(
  checkboxClassName,
  "data-checked:border-brand-navy data-checked:bg-brand-navy data-checked:text-brand-gold data-indeterminate:border-brand-navy data-indeterminate:bg-brand-navy data-indeterminate:text-brand-gold",
  "dark:data-checked:border-brand-gold dark:data-checked:bg-brand-gold dark:data-checked:text-brand-navy dark:data-indeterminate:border-brand-gold dark:data-indeterminate:bg-brand-gold dark:data-indeterminate:text-brand-navy",
  "[&_[data-slot=checkbox-indicator]]:animate-in [&_[data-slot=checkbox-indicator]]:zoom-in-50 [&_[data-slot=checkbox-indicator]]:duration-200 motion-reduce:[&_[data-slot=checkbox-indicator]]:animate-none",
);

/** `/elections/[id]/ballot`: positions with their candidates, from `/api/admin/positions` and `/api/admin/candidates`. */
export function BallotPage({ electionId }: { electionId: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([
      fetchPositions(electionId, { signal }),
      fetchCandidates(electionId, { signal }),
      fetchPartylists(electionId, { signal }),
      fetchStudents({ signal }).catch(() => null),
      fetchCareers({ signal }).catch(() => null),
    ])
      .then(([positions, candidates, parties, students, careers]) =>
        setState({ status: "ready", positions: sortPositions(positions), candidates, parties: sortPartylists(parties), students, careers }),
      )
      .catch((error: unknown) => {
        if (!signal.aborted) setState({ status: "error", message: getApiErrorMessage(error) });
      });
    return () => controller.abort();
  }, [electionId, attempt]);

  if (state.status === "loading") return <BallotSkeleton />;
  if (state.status === "error") {
    return (
      <PageError
        title="Couldn't load the ballot"
        message={state.message}
        onRetry={() => {
          setState({ status: "loading" });
          setAttempt((n) => n + 1);
        }}
      />
    );
  }
  return (
    <BallotWorkspace
      key={attempt}
      electionId={electionId}
      initialPositions={state.positions}
      initialCandidates={state.candidates}
      parties={state.parties}
      students={state.students}
      careers={state.careers}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Workspace                                 */
/* -------------------------------------------------------------------------- */

interface WorkspaceProps {
  electionId: string;
  initialPositions: Position[];
  initialCandidates: Candidate[];
  parties: Partylist[];
  students: Student[] | null;
  careers: Career[] | null;
}

function BallotWorkspace({ electionId, initialPositions, initialCandidates, parties, students, careers }: WorkspaceProps) {
  const [positions, setPositions] = useState(initialPositions);
  const [candidates, setCandidates] = useState(initialCandidates);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [positionFilter, setPositionFilter] = useState<string | null>(null);
  const [partyFilter, setPartyFilter] = useState<string | null>(null);
  const [showPhotos, setShowPhotos] = useState(false);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [creatingPosition, setCreatingPosition] = useState(false);
  const [deletingPosition, setDeletingPosition] = useState<Position | null>(null);
  const [candidateTarget, setCandidateTarget] = useState<CandidateDialogTarget>(null);
  /** The candidate whose card "Delete" is being confirmed. */
  const [deletingCandidate, setDeletingCandidate] = useState<Candidate | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  /** Bumped by Refresh, so the positions replay their entrance. */
  const [revision, setRevision] = useState(0);
  const { leaving, leave } = useLeaving();
  const { notice, say } = useNotice();

  const partyById = useMemo(() => new Map(parties.map((p) => [p.id, p])), [parties]);
  const studentById = useMemo(() => new Map((students ?? []).map((s) => [s.studentNo, s])), [students]);

  /** Career code -> its color, matching the Programs & careers page. */
  const careerColorByCode = useMemo(() => {
    const sorted = sortCareers(careers ?? []);
    return new Map(sorted.map((c) => [c.code.toUpperCase(), careerColor(c, sorted)]));
  }, [careers]);
  const colorOfCareer = (code: string | null | undefined) => (code ? careerColorByCode.get(code.toUpperCase()) : undefined);

  const rows = useMemo(
    () =>
      candidates
        .map((c) => toCandidateRow(c, studentById.get(c.studentId)))
        .sort((a, b) => a.name.localeCompare(b.name) || a.candidate.id.localeCompare(b.candidate.id)),
    [candidates, studentById],
  );

  const filtering = deferredQuery.trim() !== "" || partyFilter !== null;

  /** Each shown position with its candidates that match the search and party filter. */
  const groups = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    const matches = (row: CandidateRow) =>
      (!needle || row.name.toLowerCase().includes(needle) || row.candidate.studentId.includes(needle)) &&
      (partyFilter === null || (partyFilter === INDEPENDENT ? row.candidate.partylistId === null : row.candidate.partylistId === partyFilter));
    return positions
      .filter((p) => positionFilter === null || p.id === positionFilter)
      .map((position) => {
        const all = rows.filter((r) => r.candidate.positionId === position.id);
        return { position, total: all.length, rows: all.filter(matches) };
      })
      // While searching or filtering by party, positions without a match are hidden.
      .filter((group) => !filtering || group.rows.length > 0);
  }, [positions, rows, deferredQuery, partyFilter, positionFilter, filtering]);

  const positionOptions = positions.map((p) => ({ value: p.id, label: p.title }));
  const partyOptions = [...parties.map((p) => ({ value: p.id, label: p.name })), { value: INDEPENDENT, label: "Independent" }];
  const positionLabel = positions.find((p) => p.id === positionFilter)?.title ?? "Position";
  const partyLabel = partyFilter === INDEPENDENT ? "Independent" : (partyById.get(partyFilter ?? "")?.name ?? "Party list");

  function setChecked(ids: readonly string[], checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function toggleCollapsed(positionId: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(positionId)) next.delete(positionId);
      else next.add(positionId);
      return next;
    });
  }

  /** Plays the rows' / cards' exit, then drops the candidates from the ballot. */
  function removeCandidates(ids: ReadonlySet<string>) {
    setSelected((current) => new Set([...current].filter((id) => !ids.has(id))));
    leave(ids, () => setCandidates((current) => current.filter((c) => !ids.has(c.id))));
  }

  async function deleteSelected() {
    const ids = [...selected];
    const results = await Promise.allSettled(ids.map((id) => deleteCandidate(id)));
    const deleted = new Set(ids.filter((_, index) => results[index].status === "fulfilled"));
    const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    removeCandidates(deleted);
    if (failed) say(`Deleted ${deleted.size} of ${ids.length}. ${getApiErrorMessage(failed.reason)}`, "error");
    else say(`Deleted ${deleted.size} ${deleted.size === 1 ? "candidate" : "candidates"}.`);
  }

  async function confirmDeleteCandidate(candidate: Candidate) {
    try {
      await deleteCandidate(candidate.id);
    } catch (cause) {
      // Shown inside the dialog, which stays open.
      throw new Error(getApiErrorMessage(cause));
    }
    removeCandidates(new Set([candidate.id]));
    say("Removed the candidate.");
  }

  /** Reloads positions and candidates in place (no skeleton), keeping filters and the selection that still exists. */
  async function refresh() {
    setRefreshing(true);
    try {
      const [nextPositions, nextCandidates] = await Promise.all([fetchPositions(electionId), fetchCandidates(electionId)]);
      setPositions(sortPositions(nextPositions));
      setCandidates(nextCandidates);
      const known = new Set(nextCandidates.map((c) => c.id));
      setSelected((current) => new Set([...current].filter((id) => known.has(id))));
      if (positionFilter && !nextPositions.some((p) => p.id === positionFilter)) setPositionFilter(null);
      setRevision((n) => n + 1);
    } catch (error) {
      say(`Couldn't refresh. ${getApiErrorMessage(error)}`, "error");
    } finally {
      setRefreshing(false);
    }
  }

  async function confirmDeletePosition(position: Position) {
    try {
      await deletePosition(position.id);
    } catch (cause) {
      // Shown inside the dialog, which stays open.
      throw new Error(getApiErrorMessage(cause));
    }
    const removed = new Set(candidates.filter((c) => c.positionId === position.id).map((c) => c.id));
    setPositions((current) => current.filter((p) => p.id !== position.id));
    setCandidates((current) => current.filter((c) => !removed.has(c.id)));
    setSelected((current) => new Set([...current].filter((id) => !removed.has(id))));
    if (positionFilter === position.id) setPositionFilter(null);
    say(`Deleted ${position.title}.`);
  }

  const filterTriggerClassName = cn(toolbarButtonClassName, "gap-1");

  return (
    <div className="px-4 pb-24 sm:px-6 lg:px-8">
      {/* Toolbar */}
      <div className={cn("flex flex-wrap items-center justify-between gap-3 pb-5", styles.riseIn)}>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
          <SearchInput value={query} onChange={setQuery} placeholder="Search candidates" className="sm:w-44" />
          <OptionMenu label="Filter by position" value={positionFilter} options={positionOptions} onChange={setPositionFilter} clearLabel="All positions" triggerClassName={filterTriggerClassName}>
            <span className={cn("max-w-36 truncate", positionFilter && "font-medium text-foreground")}>{positionLabel}</span>
            <Caret />
          </OptionMenu>
          <OptionMenu label="Filter by party list" value={partyFilter} options={partyOptions} onChange={setPartyFilter} clearLabel="All party lists" triggerClassName={filterTriggerClassName}>
            <span className={cn("max-w-36 truncate", partyFilter && "font-medium text-foreground")}>{partyLabel}</span>
            <Caret />
          </OptionMenu>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <PhotoToggle checked={showPhotos} onChange={setShowPhotos} />
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            aria-label="Refresh"
            title="Refresh"
            className={cn(toolbarButtonClassName, "ml-1.5 w-8.5 justify-center px-0 disabled:cursor-wait")}
          >
            <RotateCw aria-hidden className={cn("size-4", refreshing && "animate-spin motion-reduce:animate-none")} strokeWidth={1.75} />
          </button>
          <button type="button" onClick={() => setCreatingPosition(true)} className={primaryButtonClassName}>
            + Create position
          </button>
        </div>
      </div>

      {/* Positions */}
      <div className="border-t border-border">
        <div className={cn("grid h-10.5 items-center border-b border-border font-mono text-[0.65625rem] tracking-[0.08em] text-muted-foreground uppercase", listGridClassName)}>
          <span />
          <span>{showPhotos ? "Position / candidates" : "Position / candidate"}</span>
          {showPhotos ? null : (
            <>
              <span className="hidden xl:block">Career</span>
              <span className="hidden xl:block">Program</span>
              <span className="hidden xl:block">Level</span>
              <span className="hidden sm:block">Party list</span>
              <span className="hidden sm:block">Photo</span>
            </>
          )}
        </div>

        {positions.length === 0 ? (
          <EmptyState title="No positions yet" detail="Create a position (e.g. President), then add its candidates." />
        ) : groups.length === 0 ? (
          <EmptyState title="No candidates match" detail="Try a different name, student number or party list." />
        ) : (
          // Keyed by the view and refreshes, so switching list ↔ photos replays the entrance.
          <div key={`${showPhotos ? "photos" : "list"}|${revision}`}>
          {groups.map(({ position, total, rows: shown }, index) => {
            const ids = shown.map((r) => r.candidate.id);
            const checkedCount = ids.filter((id) => selected.has(id)).length;
            const open = !collapsed.has(position.id);
            return (
              <section key={position.id} aria-labelledby={`position-${position.id}`} className={cn(index < 12 && styles.rowIn)} style={index < 12 ? { animationDelay: `${index * 40}ms` } : undefined}>
                {/* Position header */}
                <div className="group/pos flex h-9.5 items-center border-b border-border bg-muted/45 pr-2 transition-colors duration-200 hover:bg-muted/70 dark:bg-white/3 dark:hover:bg-white/5">
                  <span className="flex w-9.5 shrink-0 justify-center">
                    <Checkbox
                      aria-label={`Select the candidates for ${position.title}`}
                      checked={ids.length > 0 && checkedCount === ids.length}
                      indeterminate={checkedCount > 0 && checkedCount < ids.length}
                      disabled={ids.length === 0}
                      onCheckedChange={(checked) => setChecked(ids, checked)}
                      className={ballotCheckboxClassName}
                    />
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleCollapsed(position.id)}
                    aria-expanded={open}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30"
                  >
                    <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200", !open && "-rotate-90")} />
                    <span id={`position-${position.id}`} className="truncate text-[0.875rem] font-semibold text-foreground">
                      {position.title}
                    </span>
                    <span className="shrink-0 text-[0.75rem] text-muted-foreground">{positionSummary(position, total)}</span>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setDeletingPosition(position)}
                      aria-label={`Delete ${position.title}`}
                      title="Delete position"
                      className={cn(iconButtonClassName, "size-6.5 opacity-0 group-hover/pos:opacity-100 hover:text-destructive focus-visible:opacity-100")}
                    >
                      <Trash2 aria-hidden className="size-3.5" strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setCandidateTarget({ mode: "create", positionId: position.id })}
                      aria-label={`Add a candidate for ${position.title}`}
                      title="Add candidate"
                      className="flex size-6.5 cursor-pointer items-center justify-center rounded-md border border-border bg-background text-foreground outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand-blue/30"
                    >
                      <Plus aria-hidden className="size-3.5" strokeWidth={2} />
                    </button>
                  </div>
                </div>

                {/* Candidates (folds open and closed) */}
                <div className={styles.fold} data-open={open} inert={!open}>
                  <div>
                    {shown.length === 0 ? (
                      <p className="border-b border-border py-3.5 pl-17 text-[0.8125rem] text-muted-foreground">No candidates yet.</p>
                    ) : showPhotos ? (
                      <div className="flex flex-wrap items-start gap-3 border-b border-border py-3 pr-2 pl-15.5">
                        {shown.map((row, cardIndex) => (
                          <CandidateCard
                            key={row.candidate.id}
                            row={row}
                            index={cardIndex}
                            positionTitle={position.title}
                            party={partyById.get(row.candidate.partylistId ?? "")}
                            careerColor={colorOfCareer(row.student?.careerCode)}
                            checked={selected.has(row.candidate.id)}
                            leaving={leaving.has(row.candidate.id)}
                            onCheck={(checked) => setChecked([row.candidate.id], checked)}
                            onEdit={() => setCandidateTarget({ mode: "edit", candidate: row.candidate })}
                            onDelete={() => setDeletingCandidate(row.candidate)}
                          />
                        ))}
                      </div>
                    ) : (
                      <ul>
                        {shown.map((row) => (
                          <CandidateListRow
                            key={row.candidate.id}
                            row={row}
                            party={partyById.get(row.candidate.partylistId ?? "")}
                            careerColor={colorOfCareer(row.student?.careerCode)}
                            checked={selected.has(row.candidate.id)}
                            leaving={leaving.has(row.candidate.id)}
                            onCheck={(checked) => setChecked([row.candidate.id], checked)}
                            onEdit={() => setCandidateTarget({ mode: "edit", candidate: row.candidate })}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </section>
            );
          })}
          </div>
        )}
      </div>

      <SelectionBar count={selected.size} noun="candidates" onDelete={deleteSelected} onClear={() => setSelected(new Set())} />

      <CreatePositionDialog
        open={creatingPosition}
        electionId={electionId}
        positions={positions}
        onClose={() => setCreatingPosition(false)}
        onCreated={(position) => {
          setPositions((current) => sortPositions([...current, position]));
          say(`Created ${position.title}.`);
        }}
      />

      <CandidateDialog
        target={candidateTarget}
        electionId={electionId}
        positions={positions}
        parties={parties}
        students={students}
        candidates={candidates}
        onClose={() => setCandidateTarget(null)}
        onSaved={(saved, created) => {
          setCandidates((current) => (created ? [...current, saved] : current.map((c) => (c.id === saved.id ? saved : c))));
          // Show the position the candidate is in, even if it was collapsed.
          setCollapsed((current) => (current.has(saved.positionId) ? new Set([...current].filter((id) => id !== saved.positionId)) : current));
          say(created ? "Added the candidate." : "Saved the candidate.");
        }}
        onPortraitSaved={(saved) => {
          setCandidates((current) => current.map((c) => (c.id === saved.id ? saved : c)));
          say("Saved the new photo.");
        }}
        onRemoved={(removed) => {
          removeCandidates(new Set([removed.id]));
          say("Removed the candidate.");
        }}
      />

      <ConfirmDeleteDialog
        item={deletingCandidate}
        getKey={(candidate) => candidate.id}
        title={(candidate) => `Remove ${rows.find((r) => r.candidate.id === candidate.id)?.name ?? "this candidate"}?`}
        description={() => "They're taken off the ballot. This can't be undone."}
        summary={(candidate) => {
          const position = positions.find((p) => p.id === candidate.positionId);
          return `${candidate.studentId}${position ? ` · ${position.title}` : ""}`;
        }}
        confirmLabel="Remove candidate"
        onClose={() => setDeletingCandidate(null)}
        onConfirm={confirmDeleteCandidate}
      />

      <ConfirmDeleteDialog
        item={deletingPosition}
        getKey={(position) => position.id}
        title={(position) => `Delete ${position.title}?`}
        description={(position) => {
          const count = candidates.filter((c) => c.positionId === position.id).length;
          return count === 0
            ? "It has no candidates. This can't be undone."
            : `Its ${count} ${count === 1 ? "candidate is" : "candidates are"} removed from the ballot too. This can't be undone.`;
        }}
        summary={(position) => `${position.id} · ${position.title}`}
        confirmLabel="Delete position"
        onClose={() => setDeletingPosition(null)}
        onConfirm={confirmDeletePosition}
      />

      <Toast notice={notice} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Pieces                                   */
/* -------------------------------------------------------------------------- */

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className={cn("flex h-40 flex-col items-center justify-center border-b border-border text-center", styles.rowIn)}>
      <p className="text-[0.875rem] font-medium text-foreground">{title}</p>
      <p className="mt-1 text-[0.8125rem] text-muted-foreground">{detail}</p>
    </div>
  );
}

function PhotoToggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-[0.84375rem] text-foreground/85">
      Show photos
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-5.5 w-9.5 shrink-0 cursor-pointer rounded-full outline-none transition-colors duration-200 focus-visible:ring-3 focus-visible:ring-brand-blue/25",
          checked ? "bg-brand-blue" : "bg-[#d5dbe3] dark:bg-white/15",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute top-0.75 left-0.75 size-4 rounded-full bg-white shadow-sm transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
            checked && "translate-x-4",
          )}
        />
      </button>
    </label>
  );
}

/** Dot in the party's colour plus its name; a light dot and "Independent" without a party. */
function PartyTag({ party }: { party: Partylist | undefined }) {
  const color = party?.color ? normalizeHex(party.color) : null;
  return (
    <span className="flex min-w-0 items-center gap-2 text-[0.8125rem] text-muted-foreground">
      <span
        aria-hidden
        className={cn("size-2 shrink-0 rounded-full", party ? !color && "bg-brand-blue" : "bg-[#e2e8f0] dark:bg-white/15")}
        style={color ? ({ backgroundColor: color } as CSSProperties) : undefined}
      />
      <span className="truncate">{party?.name ?? "Independent"}</span>
    </span>
  );
}

interface CandidateItemProps {
  row: CandidateRow;
  party: Partylist | undefined;
  /** Color of the candidate's career; `undefined` when unknown (the code is shown as plain text). */
  careerColor: string | undefined;
  checked: boolean;
  /** Being deleted: plays the exit animation. */
  leaving: boolean;
  onCheck: (checked: boolean) => void;
  onEdit: () => void;
}

function Initials({ row, className }: { row: CandidateRow; className?: string }) {
  return (
    <span aria-hidden className={cn("flex shrink-0 items-center justify-center rounded-full border border-border bg-background font-mono font-medium text-muted-foreground", className)}>
      {row.initials}
    </span>
  );
}

function CandidateListRow({ row, party, careerColor, checked, leaving, onCheck, onEdit }: CandidateItemProps) {
  const hasPhoto = row.candidate.portraitUrl !== null;
  return (
    <li
      data-selected={checked || undefined}
      className={cn(
        "grid h-14 items-center border-b border-border transition-colors duration-200 hover:bg-muted/40 data-selected:bg-brand-blue/3 dark:hover:bg-white/3 dark:data-selected:bg-white/3",
        listGridClassName,
        leaving && styles.rowOut,
      )}
    >
      <span className="flex justify-center">
        <Checkbox aria-label={`Select ${row.name}`} checked={checked} onCheckedChange={onCheck} className={ballotCheckboxClassName} />
      </span>
      <div className="relative flex min-w-0 items-center gap-2.5 pl-6">
        {/* Tree line from the position header. */}
        <span aria-hidden className="absolute top-0 left-2 h-1/2 w-3 rounded-bl-[3px] border-b border-l border-border" />
        <Initials row={row} className="size-7 text-[0.5625rem]" />
        <div className="min-w-0">
          <button
            type="button"
            onClick={onEdit}
            className="block max-w-full cursor-pointer truncate rounded-sm text-left text-[0.875rem] leading-4.5 font-medium text-foreground outline-none hover:underline hover:underline-offset-2 focus-visible:ring-2 focus-visible:ring-brand-blue/30"
          >
            {row.name}
          </button>
          <p className="truncate font-mono text-[0.65625rem] leading-4 text-muted-foreground">{row.candidate.studentId}</p>
        </div>
      </div>
      <CareerCell code={row.student?.careerCode} color={careerColor} />
      <StudentCell value={row.student?.program} />
      <StudentCell value={row.student ? formatYear(row.student.year) : null} />
      <span className="hidden min-w-0 pr-3 sm:block">
        <PartyTag party={party} />
      </span>
      <span className="hidden sm:block">
        <span
          role="img"
          aria-label={hasPhoto ? "Has a photo" : "No photo yet"}
          className={cn("flex size-5 items-center justify-center rounded-full text-white", hasPhoto ? "bg-[#22c55e]" : "bg-[#ef4444]")}
        >
          {hasPhoto ? <Check aria-hidden className="size-3" strokeWidth={3} /> : <X aria-hidden className="size-3" strokeWidth={3} />}
        </span>
      </span>
      <span className="flex items-center justify-center">
        <button type="button" onClick={onEdit} aria-label={`Edit ${row.name}`} title="Edit candidate" className={iconButtonClassName}>
          <Pencil aria-hidden className="size-4" strokeWidth={1.75} />
        </button>
        <span aria-hidden className="ml-1 hidden h-4.5 w-px bg-border xl:block" />
      </span>
    </li>
  );
}

/** The career's colored code tag, as on the Programs & careers page; plain text when its color is unknown. */
function CareerCell({ code, color }: { code: string | null | undefined; color: string | undefined }) {
  if (!code || code === "—" || !color) return <StudentCell value={code} />;
  return (
    <span className="hidden min-w-0 pr-3 xl:block">
      <CareerCode code={code} color={color} />
    </span>
  );
}

/** Career, program or level of the candidate's enrollment; "—" when the student has none. */
function StudentCell({ value }: { value: string | null | undefined }) {
  const text = value && value !== "—" ? value : null;
  return (
    <span className={cn("hidden truncate pr-3 text-[0.8125rem] xl:block", text ? "text-foreground/85" : "text-muted-foreground")}>
      {text ?? <span aria-label="None">—</span>}
    </span>
  );
}

/** Small outlined square button on a selected card (Edit, Delete). */
const cardActionClassName =
  "flex size-7 cursor-pointer items-center justify-center rounded-md border border-border bg-background text-muted-foreground outline-none transition-[background-color,color,border-color,scale] duration-150 hover:bg-muted hover:text-foreground active:scale-90 focus-visible:ring-2 focus-visible:ring-brand-blue/30 motion-reduce:active:scale-100";

const initialsPlaceholderClassName =
  "absolute inset-0 flex items-center justify-center text-[2.25rem] font-semibold tracking-wide text-[#64748b]/80 dark:text-white/35";

interface CandidateCardProps extends CandidateItemProps {
  /** Position in its row, for the staggered entrance. */
  index: number;
  positionTitle: string;
  onDelete: () => void;
}

/**
 * Photo view card: the portrait (initials while it loads), or the "No photo yet"
 * mascot; then name, student number and party. Selecting it outlines it and
 * unfolds a footer with its position, Edit and Delete.
 */
function CandidateCard({ row, index, positionTitle, party, careerColor, checked, leaving, onCheck, onEdit, onDelete }: CandidateCardProps) {
  const portrait = row.candidate.portraitUrl;
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  return (
    <div
      data-selected={checked || undefined}
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
      className={cn(
        "group/card relative w-57.5 overflow-hidden rounded-[0.625rem] border border-border bg-card",
        "transition-[border-color,box-shadow,translate] duration-250 ease-out hover:-translate-y-0.5 hover:shadow-[0_14px_28px_-20px_rgb(15_23_42/0.45)] motion-reduce:hover:translate-y-0",
        "data-selected:border-brand-blue data-selected:shadow-[0_0_0_1px_var(--color-brand-blue)] dark:data-selected:border-[#7aa7e6] dark:data-selected:shadow-[0_0_0_1px_#7aa7e6]",
        styles.cellIn,
        leaving && styles.cardOut,
      )}
    >
      <div className="relative h-38 overflow-hidden bg-[#f1f4f8] dark:bg-white/5">
        {portrait !== null ? (
          <>
            <span aria-hidden className={initialsPlaceholderClassName}>
              {row.initials}
            </span>
            {failedSrc !== portrait ? (
              // eslint-disable-next-line @next/next/no-img-element -- portraits come from the API's storage host
              <img
                src={portrait}
                alt=""
                onLoad={() => setLoadedSrc(portrait)}
                onError={() => setFailedSrc(portrait)}
                className={cn(
                  "absolute inset-0 size-full object-cover object-top transition-[opacity,scale] duration-500 ease-out group-hover/card:scale-[1.03] motion-reduce:transition-opacity",
                  loadedSrc === portrait ? "opacity-100" : "opacity-0",
                )}
              />
            ) : null}
          </>
        ) : (
          <span aria-hidden className="absolute inset-0 flex flex-col items-center justify-center pt-2">
            <span className="absolute top-2.5 left-2.5 rounded-[0.1875rem] bg-brand-gold px-1.5 py-0.5 font-mono text-[0.5625rem] font-semibold tracking-wider text-brand-navy">
              MISSING
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element -- tiny static illustration */}
            <img
              src="/images/nophotoyet.png"
              alt=""
              width={60}
              height={79}
              className="h-17 w-auto opacity-90 transition-transform duration-300 ease-out group-hover/card:-translate-y-0.5 group-hover/card:-rotate-3 motion-reduce:transition-none dark:opacity-70 dark:invert"
            />
            <span className="mt-1.5 text-[0.75rem] font-medium text-foreground/80">No photo yet</span>
            <span className="text-[0.65625rem] text-muted-foreground">Add one from Edit</span>
          </span>
        )}
        <button
          type="button"
          onClick={onEdit}
          aria-label={portrait ? `Edit ${row.name}` : `Add a photo for ${row.name}`}
          className="absolute inset-0 cursor-pointer outline-none focus-visible:ring-3 focus-visible:ring-brand-blue/30 focus-visible:ring-inset"
        />
        <span className="absolute top-2.5 right-2.5">
          <Checkbox aria-label={`Select ${row.name}`} checked={checked} onCheckedChange={onCheck} className={cn(ballotCheckboxClassName, "shadow-sm")} />
        </span>
      </div>

      <div className="px-3.5 pt-2.5 pb-3">
        <button
          type="button"
          onClick={onEdit}
          className="block max-w-full cursor-pointer truncate rounded-sm text-left text-[0.9375rem] leading-5 font-semibold text-foreground outline-none hover:underline hover:underline-offset-2 focus-visible:ring-2 focus-visible:ring-brand-blue/30"
        >
          {row.name}
        </button>
        <p className="mt-0.5 truncate font-mono text-[0.6875rem] text-muted-foreground">{row.candidate.studentId}</p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <PartyTag party={party} />
          {careerColor && row.student?.careerCode ? <CareerCode code={row.student.careerCode} color={careerColor} /> : null}
        </div>
      </div>

      {/* Footer of a selected card: its position, Edit and Delete. */}
      <div className={styles.fold} data-open={checked} inert={!checked}>
        <div>
          <div className="flex items-center justify-between gap-2 px-3.5 pb-3">
            <span className="truncate text-[0.75rem] text-muted-foreground">{positionTitle}</span>
            <span className="flex shrink-0 items-center gap-1.5">
              <button type="button" onClick={onEdit} aria-label={`Edit ${row.name}`} title="Edit candidate" className={cardActionClassName}>
                <Pencil aria-hidden className="size-3.5" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                onClick={onDelete}
                aria-label={`Delete ${row.name}`}
                title="Delete candidate"
                className={cn(cardActionClassName, "hover:border-destructive/30 hover:bg-destructive/8 hover:text-destructive")}
              >
                <Trash2 aria-hidden className="size-3.5" strokeWidth={1.75} />
              </button>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
