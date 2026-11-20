"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Flag, Pencil, Plus, Trash2 } from "lucide-react";

import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import styles from "@/components/shared/motion.module.css";
import { PageError, SearchInput, Toast, useNotice } from "@/components/shared/page-feedback";
import { PartyListsSkeleton } from "./party-lists-skeleton";
import { SelectionBar } from "@/components/shared/selection-bar";
import { checkboxClassName } from "@/components/students/student-table";
import { primaryButtonClassName } from "@/components/students/student-toolbar-styles";
import { Checkbox } from "@/components/ui/checkbox";
import { mottoText, partyColorFallbackClassName, partyColorStyle, partyListEditHref, partyListNewHref, sortPartylists } from "@/lib/partylists";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/services/api/error-message";
import { fetchCandidates, fetchPositions } from "@/services/ballot/ballot.service";
import { deletePartylist, fetchPartylists } from "@/services/partylists/partylists.service";
import type { Candidate, Position } from "@/types/ballot.types";
import type { Partylist } from "@/types/partylist.types";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      parties: Partylist[];
      /** For the Candidates column (`null` when they couldn't be loaded). */
      candidates: Candidate[] | null;
      positions: Position[] | null;
    };

const INTRO_ROWS = 12;

const iconButtonClassName =
  "flex size-7.5 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand-blue/30";

/** Square in the party's colour: its logo, or a flag when it has none. */
function PartyMark({ party }: { party: Partylist }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md bg-cover bg-center",
        !partyColorStyle(party.color) && partyColorFallbackClassName,
      )}
      style={{ ...partyColorStyle(party.color), ...(party.logoUrl ? { backgroundImage: `url("${party.logoUrl}")` } : null) }}
    >
      {party.logoUrl ? null : <Flag className="size-4" strokeWidth={2} />}
    </span>
  );
}

/** `/elections/[id]/party-lists`: the election's party lists, loaded from `/api/admin/partylists`. */
export function PartyListsPage({ electionId }: { electionId: string }) {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [deleting, setDeleting] = useState<Partylist | null>(null);
  const { notice, say } = useNotice();

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([
      fetchPartylists(electionId, { signal }),
      fetchCandidates(electionId, { signal }).catch(() => null),
      fetchPositions(electionId, { signal }).catch(() => null),
    ])
      .then(([parties, candidates, positions]) => setState({ status: "ready", parties: sortPartylists(parties), candidates, positions }))
      .catch((error: unknown) => {
        if (!signal.aborted) setState({ status: "error", message: getApiErrorMessage(error) });
      });
    return () => controller.abort();
  }, [electionId, attempt]);

  const parties = useMemo(() => (state.status === "ready" ? state.parties : []), [state]);
  const candidates = state.status === "ready" ? state.candidates : null;
  const positions = state.status === "ready" ? state.positions : null;

  const visible = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    if (!needle) return parties;
    return parties.filter((p) => [p.name, p.motto, p.id].some((text) => text.toLowerCase().includes(needle)));
  }, [parties, deferredQuery]);

  /** "7 / 7": the party's candidates out of the election's positions. */
  function candidateCount(party: Partylist): string {
    if (!candidates) return "—";
    const count = candidates.filter((c) => c.partylistId === party.id).length;
    return positions ? `${count} / ${positions.length}` : String(count);
  }

  function removeFromList(ids: ReadonlySet<string>) {
    setState((current) => (current.status === "ready" ? { ...current, parties: current.parties.filter((p) => !ids.has(p.id)) } : current));
    setSelected((current) => new Set([...current].filter((id) => !ids.has(id))));
  }

  async function confirmDelete(party: Partylist) {
    try {
      await deletePartylist(party.id);
    } catch (cause) {
      // Shown inside the dialog, which stays open.
      throw new Error(getApiErrorMessage(cause));
    }
    removeFromList(new Set([party.id]));
    say(`Deleted ${party.id} · ${party.name}.`);
  }

  async function deleteSelected() {
    const ids = [...selected];
    const results = await Promise.allSettled(ids.map((id) => deletePartylist(id)));
    const deleted = new Set(ids.filter((_, index) => results[index].status === "fulfilled"));
    const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    removeFromList(deleted);
    if (failed) {
      say(`Deleted ${deleted.size} of ${ids.length}. ${getApiErrorMessage(failed.reason)}`, "error");
    } else {
      say(`Deleted ${deleted.size} party ${deleted.size === 1 ? "list" : "lists"}.`);
    }
  }

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  if (state.status === "loading") return <PartyListsSkeleton />;
  if (state.status === "error") {
    return (
      <PageError
        title="Couldn't load the party lists"
        message={state.message}
        onRetry={() => {
          setState({ status: "loading" });
          setAttempt((n) => n + 1);
        }}
      />
    );
  }

  const selectedVisible = visible.reduce((n, p) => n + (selected.has(p.id) ? 1 : 0), 0);
  const allChecked = visible.length > 0 && selectedVisible === visible.length;

  return (
    <div className="px-4 pb-24 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-5">
        <SearchInput value={query} onChange={setQuery} placeholder="Search party lists" />
        <Link href={partyListNewHref(electionId)} className={cn(primaryButtonClassName, "gap-1.5")}>
          <Plus aria-hidden className="size-4" strokeWidth={2.2} />
          Add party list
        </Link>
      </div>

      <div className="overflow-x-auto border-t border-border scrollbar-thin">
        <table className="w-full min-w-140 table-fixed border-separate border-spacing-0 text-left">
          <caption className="sr-only">
            Party lists, {visible.length} {visible.length === 1 ? "result" : "results"}
          </caption>
          <colgroup>
            <col className="w-9.5" />
            <col />
            <col className="w-27.5" />
            <col className="w-27.5" />
            <col className="w-22" />
          </colgroup>
          <thead>
            <tr className="h-10.5 font-mono text-[0.65625rem] tracking-[0.08em] text-muted-foreground uppercase">
              <th scope="col" className="border-b border-border pl-2 font-normal">
                <Checkbox
                  aria-label={allChecked ? "Deselect all party lists" : "Select all party lists"}
                  checked={allChecked}
                  indeterminate={selectedVisible > 0 && !allChecked}
                  disabled={visible.length === 0}
                  onCheckedChange={(checked) => setSelected(checked ? new Set(visible.map((p) => p.id)) : new Set())}
                  className={checkboxClassName}
                />
              </th>
              <th scope="col" className="border-b border-border font-normal">Party list</th>
              <th scope="col" className="border-b border-border font-normal">ID</th>
              <th scope="col" className="border-b border-border font-normal">Candidates</th>
              <th scope="col" className="border-b border-border font-normal">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody key={deferredQuery}>
            {visible.length === 0 ? (
              <tr className={styles.rowIn}>
                <td colSpan={5} className="h-40 border-b border-border text-center">
                  <p className="text-[0.875rem] font-medium text-foreground">{parties.length === 0 ? "No party lists yet" : "No party lists match your search"}</p>
                  <p className="mt-1 text-[0.8125rem] text-muted-foreground">
                    {parties.length === 0 ? "Add one, then assign its candidates on the Ballot page." : "Try a different name, motto or ID."}
                  </p>
                </td>
              </tr>
            ) : (
              visible.map((party, index) => {
                const checked = selected.has(party.id);
                const href = partyListEditHref(electionId, party.id);
                const motto = mottoText(party.motto);
                return (
                  <tr
                    key={party.id}
                    data-selected={checked || undefined}
                    onClick={() => router.push(href)}
                    style={index < INTRO_ROWS ? { animationDelay: `${index * 32}ms` } : undefined}
                    className={cn(
                      "group/row h-14.5 cursor-pointer transition-colors duration-200 hover:bg-muted/55 data-selected:bg-brand-blue/2.5 dark:hover:bg-white/3",
                      index < INTRO_ROWS && styles.rowIn,
                    )}
                  >
                    <td className="border-b border-border pl-2" onClick={(e) => e.stopPropagation()}>
                      <Checkbox aria-label={`Select ${party.name}`} checked={checked} onCheckedChange={(next) => toggle(party.id, next)} className={checkboxClassName} />
                    </td>
                    <td className="border-b border-border pr-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <PartyMark party={party} />
                        <div className="min-w-0">
                          <Link
                            href={href}
                            onClick={(e) => e.stopPropagation()}
                            className="block max-w-full truncate rounded-sm text-[0.875rem] leading-4.5 font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30"
                          >
                            {party.name}
                          </Link>
                          {motto ? <p className="truncate text-[0.75rem] leading-4 text-muted-foreground">“{motto}”</p> : null}
                        </div>
                      </div>
                    </td>
                    <td className="border-b border-border font-mono text-[0.75rem] text-muted-foreground">{party.id}</td>
                    <td className="border-b border-border text-[0.8125rem] text-foreground tabular-nums">{candidateCount(party)}</td>
                    <td className="border-b border-border pr-1" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-0.5">
                        <Link href={href} aria-label={`Edit ${party.name}`} title="Edit" className={iconButtonClassName}>
                          <Pencil aria-hidden className="size-4" strokeWidth={1.75} />
                        </Link>
                        <button type="button" onClick={() => setDeleting(party)} aria-label={`Delete ${party.name}`} title="Delete" className={cn(iconButtonClassName, "hover:text-destructive")}>
                          <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <SelectionBar count={selected.size} noun="party lists" onDelete={deleteSelected} onClear={() => setSelected(new Set())} />

      <ConfirmDeleteDialog
        item={deleting}
        getKey={(party) => party.id}
        title={(party) => `Delete ${party.name}?`}
        description={() => "Its candidates stay on the ballot and become independent. This can't be undone."}
        summary={(party) => `${party.id} · ${party.name}`}
        confirmLabel="Delete party list"
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />

      <Toast notice={notice} />
    </div>
  );
}
