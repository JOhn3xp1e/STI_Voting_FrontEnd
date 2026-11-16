"use client";

import { useDeferredValue, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Check, ChevronDown, Pencil, Plus, Trash2, X } from "lucide-react";

import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import styles from "@/components/shared/motion.module.css";
import { PageError, PageLoading, SearchInput, Toast, useNotice } from "@/components/shared/page-feedback";
import { SelectionBar } from "@/components/shared/selection-bar";
import { Caret, OptionMenu } from "@/components/students/option-menu";
import { checkboxClassName } from "@/components/students/student-table";
import { primaryButtonClassName, toolbarButtonClassName } from "@/components/students/student-toolbar-styles";
import { Checkbox } from "@/components/ui/checkbox";
import { positionSummary, sortPositions, toCandidateRow, type CandidateRow } from "@/lib/ballot";
import { normalizeHex, sortPartylists } from "@/lib/partylists";
import { formatYear } from "@/lib/students";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/services/api/error-message";
import { deleteCandidate, deletePosition, fetchCandidates, fetchPositions } from "@/services/ballot/ballot.service";
import { fetchPartylists } from "@/services/partylists/partylists.service";
import { fetchStudents } from "@/services/students/students.service";
import type { Candidate, Position } from "@/types/ballot.types";
import type { Partylist } from "@/types/partylist.types";
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
    };

/** Party filter value for candidates without a party. */
const INDEPENDENT = "__independent__";

/** Columns of the list view: checkbox, name, [career, program, level,] party list, photo, edit. */
const listGridClassName =
  "grid-cols-[2.375rem_minmax(0,1fr)_3rem] sm:grid-cols-[2.375rem_minmax(0,1fr)_9rem_5.5rem_3rem] xl:grid-cols-[2.375rem_minmax(0,1fr)_8.5rem_10rem_4.75rem_8rem_5.5rem_3.5rem]";

const iconButtonClassName =
  "flex size-7.5 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand-blue/30 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground";

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
    ])
      .then(([positions, candidates, parties, students]) =>
        setState({ status: "ready", positions: sortPositions(positions), candidates, parties: sortPartylists(parties), students }),
      )
      .catch((error: unknown) => {
        if (!signal.aborted) setState({ status: "error", message: getApiErrorMessage(error) });
      });
    return () => controller.abort();
  }, [electionId, attempt]);

  if (state.status === "loading") return <PageLoading label="Loading the ballot…" />;
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
}

function BallotWorkspace({ electionId, initialPositions, initialCandidates, parties, students }: WorkspaceProps) {
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
  const { notice, say } = useNotice();

  const partyById = useMemo(() => new Map(parties.map((p) => [p.id, p])), [parties]);
  const studentById = useMemo(() => new Map((students ?? []).map((s) => [s.studentNo, s])), [students]);

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

  async function deleteSelected() {
    const ids = [...selected];
    const results = await Promise.allSettled(ids.map((id) => deleteCandidate(id)));
    const deleted = new Set(ids.filter((_, index) => results[index].status === "fulfilled"));
    const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    setCandidates((current) => current.filter((c) => !deleted.has(c.id)));
    setSelected((current) => new Set([...current].filter((id) => !deleted.has(id))));
    if (failed) say(`Deleted ${deleted.size} of ${ids.length}. ${getApiErrorMessage(failed.reason)}`, "error");
    else say(`Deleted ${deleted.size} ${deleted.size === 1 ? "candidate" : "candidates"}.`);
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
      <div className="flex flex-wrap items-center justify-between gap-3 pb-5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
          <SearchInput value={query} onChange={setQuery} placeholder="Search candidates" />
          <OptionMenu label="Filter by position" value={positionFilter} options={positionOptions} onChange={setPositionFilter} clearLabel="All positions" triggerClassName={filterTriggerClassName}>
            <span className={cn("max-w-36 truncate", positionFilter && "font-medium text-foreground")}>{positionLabel}</span>
            <Caret />
          </OptionMenu>
          <OptionMenu label="Filter by party list" value={partyFilter} options={partyOptions} onChange={setPartyFilter} clearLabel="All party lists" triggerClassName={filterTriggerClassName}>
            <span className={cn("max-w-36 truncate", partyFilter && "font-medium text-foreground")}>{partyLabel}</span>
            <Caret />
          </OptionMenu>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <PhotoToggle checked={showPhotos} onChange={setShowPhotos} />
          <button type="button" onClick={() => setCreatingPosition(true)} className={cn(primaryButtonClassName, "gap-1.5")}>
            <Plus aria-hidden className="size-4" strokeWidth={2.2} />
            Create position
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
          groups.map(({ position, total, rows: shown }, index) => {
            const ids = shown.map((r) => r.candidate.id);
            const checkedCount = ids.filter((id) => selected.has(id)).length;
            const open = !collapsed.has(position.id);
            return (
              <section key={position.id} aria-labelledby={`position-${position.id}`} className={cn(index < 12 && styles.rowIn)} style={index < 12 ? { animationDelay: `${index * 32}ms` } : undefined}>
                {/* Position header */}
                <div className="group/pos flex h-9.5 items-center border-b border-border bg-muted/45 pr-2 dark:bg-white/3">
                  <span className="flex w-9.5 shrink-0 justify-center">
                    <Checkbox
                      aria-label={`Select the candidates for ${position.title}`}
                      checked={ids.length > 0 && checkedCount === ids.length}
                      indeterminate={checkedCount > 0 && checkedCount < ids.length}
                      disabled={ids.length === 0}
                      onCheckedChange={(checked) => setChecked(ids, checked)}
                      className={checkboxClassName}
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

                {/* Candidates */}
                {open ? (
                  shown.length === 0 ? (
                    <p className="border-b border-border py-3.5 pl-17 text-[0.8125rem] text-muted-foreground">No candidates yet.</p>
                  ) : showPhotos ? (
                    <div className="flex flex-wrap gap-3 border-b border-border py-3 pl-15.5 pr-2">
                      {shown.map((row) => (
                        <CandidateCard key={row.candidate.id} row={row} party={partyById.get(row.candidate.partylistId ?? "")} checked={selected.has(row.candidate.id)} onCheck={(checked) => setChecked([row.candidate.id], checked)} onEdit={() => setCandidateTarget({ mode: "edit", candidate: row.candidate })} />
                      ))}
                    </div>
                  ) : (
                    <ul>
                      {shown.map((row) => (
                        <CandidateListRow key={row.candidate.id} row={row} party={partyById.get(row.candidate.partylistId ?? "")} checked={selected.has(row.candidate.id)} onCheck={(checked) => setChecked([row.candidate.id], checked)} onEdit={() => setCandidateTarget({ mode: "edit", candidate: row.candidate })} />
                      ))}
                    </ul>
                  )
                ) : null}
              </section>
            );
          })
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
          setCandidates((current) => current.filter((c) => c.id !== removed.id));
          setSelected((current) => new Set([...current].filter((id) => id !== removed.id)));
          say("Removed the candidate.");
        }}
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
  checked: boolean;
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

function CandidateListRow({ row, party, checked, onCheck, onEdit }: CandidateItemProps) {
  const hasPhoto = row.candidate.portraitUrl !== null;
  return (
    <li
      data-selected={checked || undefined}
      className={cn(
        "grid h-14 items-center border-b border-border transition-colors duration-200 hover:bg-muted/40 data-selected:bg-brand-blue/2.5 dark:hover:bg-white/3",
        listGridClassName,
      )}
    >
      <span className="flex justify-center">
        <Checkbox aria-label={`Select ${row.name}`} checked={checked} onCheckedChange={onCheck} className={checkboxClassName} />
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
      <StudentCell value={row.student?.careerCode} />
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
      <span className="flex justify-center">
        <button type="button" onClick={onEdit} aria-label={`Edit ${row.name}`} title="Edit candidate" className={iconButtonClassName}>
          <Pencil aria-hidden className="size-4" strokeWidth={1.75} />
        </button>
      </span>
    </li>
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

function CandidateCard({ row, party, checked, onCheck, onEdit }: CandidateItemProps) {
  const portrait = row.candidate.portraitUrl;
  return (
    <div
      data-selected={checked || undefined}
      className="relative w-57.5 overflow-hidden rounded-lg border border-border bg-card transition-[border-color,box-shadow] duration-200 data-selected:border-brand-blue data-selected:shadow-[0_0_0_1px_var(--color-brand-blue)]"
    >
      <div
        className={cn("relative flex h-38 items-center justify-center bg-cover bg-top", portrait ? "bg-muted" : "bg-linear-to-b from-[#e8eef7] to-[#d5deeb] dark:from-white/8 dark:to-white/4")}
        style={portrait ? { backgroundImage: `url("${portrait}")` } : undefined}
      >
        <button
          type="button"
          onClick={onEdit}
          aria-label={portrait ? `Edit ${row.name}` : `Add a photo for ${row.name}`}
          className="group/photo absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-1 outline-none focus-visible:ring-3 focus-visible:ring-brand-blue/30 focus-visible:ring-inset"
        >
          {portrait ? null : (
            <>
              <span className="absolute top-2.5 left-2.5 rounded-[0.1875rem] bg-brand-gold px-1.5 py-0.5 font-mono text-[0.5625rem] font-semibold tracking-wider text-brand-navy">MISSING</span>
              <Plus aria-hidden className="size-5 text-brand-muted transition-transform duration-200 group-hover/photo:scale-110" strokeWidth={1.75} />
              <span className="text-[0.8125rem] text-brand-muted">Add photo</span>
              <span className="font-mono text-[0.625rem] text-brand-muted/80">JPG/PNG · 4:5</span>
            </>
          )}
        </button>
        <span className="absolute top-2.5 right-2.5">
          <Checkbox aria-label={`Select ${row.name}`} checked={checked} onCheckedChange={onCheck} className={checkboxClassName} />
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
        <p className="truncate font-mono text-[0.6875rem] text-muted-foreground">{row.candidate.studentId}</p>
        <div className="mt-2">
          <PartyTag party={party} />
        </div>
      </div>
    </div>
  );
}
