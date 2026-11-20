"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, RotateCw } from "lucide-react";

import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { PageError, Toast, useNotice } from "@/components/shared/page-feedback";
import { ElectionsGridSkeleton } from "./elections-skeleton";
import { UnderlineTabs, type UnderlineTab } from "@/components/shared/underline-tabs";
import { OptionMenu } from "@/components/students/option-menu";
import { primaryButtonClassName } from "@/components/students/student-toolbar-styles";
import { countEligibleVoters, takeSavedElection } from "@/lib/elections";
import { formatTermTitle, sortTerms } from "@/lib/terms";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/services/api/error-message";
import { deleteElection, fetchElections, fetchVoterEnrollments } from "@/services/elections/elections.service";
import { fetchTerms } from "@/services/terms/terms.service";
import type { Election, ElectionStatus, VoterEnrollment } from "@/types/election.types";
import type { Term } from "@/types/term.types";

import { ElectionCard } from "./election-card";
import { useElectionsNav } from "./elections-nav";
import motion from "./elections.module.css";

type ElectionTab = "all" | Lowercase<ElectionStatus>;

const TAB_LABELS: [ElectionTab, string][] = [
  ["all", "All"],
  ["ongoing", "Ongoing"],
  ["upcoming", "Upcoming"],
  ["draft", "Draft"],
  ["completed", "Completed"],
  ["cancelled", "Cancelled"],
];

export const NEW_ELECTION_HREF = "/elections/new";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  /** `now`: when the list loaded, for "opens in 6 days". */
  | { status: "ready"; elections: Election[]; terms: Term[]; now: Date };

/** Dashed "Create election" tile shown at the end of the election grid. */
function CreateElectionCard() {
  return (
    <Link
      href={NEW_ELECTION_HREF}
      className={cn(
        "group/create flex min-h-79.5 w-full flex-col items-center justify-center rounded-[0.375rem] border border-dashed border-[#d5dbe3] bg-transparent px-6 text-center outline-none dark:border-white/15",
        "transition-[border-color,background-color] duration-300 ease-out",
        "hover:border-brand-blue/45 hover:bg-brand-blue/2.5 dark:hover:border-white/30 dark:hover:bg-white/2.5",
        "focus-visible:border-brand-blue/60 focus-visible:ring-3 focus-visible:ring-brand-blue/15",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-10 items-center justify-center rounded-full border border-[#e2e8f0] bg-card text-brand-navy dark:border-border dark:text-foreground",
          "shadow-[0_1px_2px_rgb(15_23_42/0.05)] transition-[translate,border-color,box-shadow] duration-300 ease-out",
          "group-hover/create:-translate-y-0.5 group-hover/create:border-brand-blue/30 group-hover/create:shadow-[0_10px_20px_-12px_rgb(15_76_158/0.55)]",
          "motion-reduce:transition-none motion-reduce:group-hover/create:translate-y-0",
        )}
      >
        <Plus
          className="size-4.5 transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover/create:rotate-90 motion-reduce:transition-none"
          strokeWidth={1.75}
        />
      </span>
      <span className="mt-2 text-[0.9375rem] leading-5 font-semibold text-brand-navy dark:text-foreground">Create election</span>
      <span className="mt-1.5 font-mono text-[0.6875rem] leading-3.5 text-muted-foreground">
        banner <span aria-hidden>·</span> filters <span aria-hidden>·</span> admins
      </span>
    </Link>
  );
}

/** Elections list, loaded from `/api/admin/election`. */
export function ElectionsPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<ElectionTab>("all");
  const [termId, setTermId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Election | null>(null);
  /** Enrollments for the voter counts on the cards; they load after the list (`null` until then). */
  const [enrollments, setEnrollments] = useState<VoterEnrollment[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  /** The election that was just created or saved: its card pulses once. */
  const [savedId, setSavedId] = useState<string | null>(null);
  const { notice, say } = useNotice();
  const { refresh: refreshElectionsNav } = useElectionsNav();

  async function confirmDelete(election: Election) {
    try {
      await deleteElection(election.id);
    } catch (cause) {
      // Shown inside the dialog, which stays open.
      throw new Error(getApiErrorMessage(cause));
    }
    setState((current) =>
      current.status === "ready" ? { ...current, elections: current.elections.filter((e) => e.id !== election.id) } : current,
    );
    refreshElectionsNav();
    say(`Deleted ${election.id} · ${election.title}.`);
  }

  // Also runs again when this page is shown after the wizard (Next keeps it alive, hidden), so the list is fresh.
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([fetchElections({ signal }), fetchTerms({ signal })])
      .then(([elections, terms]) => {
        setState({ status: "ready", elections, terms: sortTerms(terms), now: new Date() });
        const saved = takeSavedElection();
        if (saved) setSavedId(saved);
      })
      .catch((error: unknown) => {
        if (!signal.aborted) setState({ status: "error", message: getApiErrorMessage(error) });
      })
      .finally(() => {
        if (!signal.aborted) setRefreshing(false);
      });
    // Voter counts are extra: the cards show without them, and a failure only hides them.
    fetchVoterEnrollments({ signal })
      .then(setEnrollments)
      .catch(() => undefined);
    return () => controller.abort();
  }, [attempt]);

  // The pulse plays once; clear it so a later visit doesn't replay it.
  useEffect(() => {
    if (!savedId) return;
    const timer = setTimeout(() => setSavedId(null), 4000);
    return () => clearTimeout(timer);
  }, [savedId]);

  const elections = useMemo(() => (state.status === "ready" ? state.elections : []), [state]);
  const terms = state.status === "ready" ? state.terms : [];
  const now = state.status === "ready" ? state.now : null;

  const voterCounts = useMemo(() => {
    if (!enrollments) return null;
    return new Map(elections.map((e) => [e.id, countEligibleVoters(enrollments, e)]));
  }, [elections, enrollments]);

  const tabs = useMemo<UnderlineTab<ElectionTab>[]>(
    () =>
      TAB_LABELS.map(([value, label]) => {
        const count = elections.filter((e) => value === "all" || e.status.toLowerCase() === value).length;
        return { value, label, description: `${count} ${count === 1 ? "election" : "elections"}` };
      }),
    [elections],
  );

  const visible = useMemo(
    () =>
      elections
        .filter((e) => (tab === "all" || e.status.toLowerCase() === tab) && (!termId || e.termId === termId))
        .sort((a, b) => b.startsAt.localeCompare(a.startsAt) || b.id.localeCompare(a.id)),
    [elections, tab, termId],
  );

  const selectedTerm = terms.find((t) => t.id === termId);

  return (
    <div className="px-4 pb-16 sm:px-6 lg:px-8">
      {/* Tabs + toolbar */}
      <div className="flex flex-col-reverse gap-4 lg:flex-row lg:items-end lg:justify-between">
        <UnderlineTabs label="Filter elections" tabs={tabs} value={tab} onChange={setTab} className="border-b-0" listClassName="gap-6" />

        <div className="flex items-center gap-3">
          <OptionMenu<string>
            label="Filter by term"
            value={termId}
            options={terms.map((t) => ({ value: t.id, label: formatTermTitle(t), hint: t.id }))}
            onChange={setTermId}
            clearLabel="All terms"
            align="end"
            triggerClassName={cn(
              "inline-flex h-10 min-w-0 flex-1 cursor-pointer items-center rounded-[0.25rem] border border-[#e2e8f0] bg-background px-3 text-left text-[0.875rem] text-muted-foreground outline-none sm:w-60 sm:flex-none dark:border-border",
              "transition-[border-color,box-shadow,color] duration-200 ease-out hover:border-[color-mix(in_oklab,var(--color-brand-muted)_38%,transparent)] hover:text-foreground",
              "focus-visible:border-brand-blue/60 focus-visible:ring-3 focus-visible:ring-brand-blue/15 data-popup-open:border-brand-blue/40 data-popup-open:ring-3 data-popup-open:ring-brand-blue/10",
            )}
          >
            <span className="truncate">Term: {selectedTerm ? formatTermTitle(selectedTerm) : "All terms"}</span>
          </OptionMenu>

          <button
            type="button"
            aria-label="Refresh elections"
            title="Refresh"
            disabled={refreshing || state.status === "loading"}
            onClick={() => {
              setRefreshing(true);
              setAttempt((n) => n + 1);
            }}
            className={cn(
              "group/refresh inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-[0.25rem] border border-[#e2e8f0] bg-background text-foreground/80 outline-none dark:border-border",
              "transition-[border-color,background-color,color,scale] duration-200 hover:border-[color-mix(in_oklab,var(--color-brand-muted)_38%,transparent)] hover:bg-muted/60 hover:text-foreground active:scale-95",
              "focus-visible:border-brand-blue/60 focus-visible:ring-3 focus-visible:ring-brand-blue/15 disabled:cursor-wait motion-reduce:active:scale-100",
            )}
          >
            <RotateCw
              aria-hidden
              className={cn("size-4 transition-transform duration-500", refreshing ? "animate-spin motion-reduce:animate-none" : "group-hover/refresh:rotate-45")}
              strokeWidth={1.75}
            />
          </button>

          <Link href={NEW_ELECTION_HREF} className={cn(primaryButtonClassName, "group/new gap-1.5 rounded-[0.25rem] px-4 text-[0.875rem]")}>
            <Plus aria-hidden className="size-4 transition-transform duration-300 group-hover/new:rotate-90 motion-reduce:transition-none" strokeWidth={2} />
            New election
          </Link>
        </div>
      </div>

      {/* Election grid */}
      <div className="mt-6">
        {state.status === "loading" ? (
          <ElectionsGridSkeleton />
        ) : state.status === "error" ? (
          <PageError
            title="Couldn't load elections"
            message={state.message}
            onRetry={() => {
              setState({ status: "loading" });
              setAttempt((n) => n + 1);
            }}
          />
        ) : (
          <>
            {visible.length === 0 && (tab !== "all" || termId) ? (
              <p className="mb-4 text-[0.875rem] text-muted-foreground animate-in fade-in duration-300 motion-reduce:animate-none">
                No {tab === "all" ? "" : `${TAB_LABELS.find(([value]) => value === tab)?.[1].toLowerCase()} `}elections
                {selectedTerm ? ` in ${formatTermTitle(selectedTerm)}` : ""}.
              </p>
            ) : null}
            {/* Keyed by the filters, so switching tabs or terms deals the cards in again. */}
            <ul key={`${tab}|${termId ?? ""}`} className="grid grid-cols-1 gap-x-5 gap-y-5.5 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((election, index) => (
                <li key={election.id} className={motion.cardIn} style={{ animationDelay: `${Math.min(index, 8) * 65}ms` }}>
                  <ElectionCard
                    election={election}
                    onDelete={setDeleting}
                    voters={voterCounts?.get(election.id) ?? null}
                    now={now!}
                    saved={election.id === savedId}
                  />
                </li>
              ))}
              <li className={motion.cardIn} style={{ animationDelay: `${Math.min(visible.length, 8) * 65}ms` }}>
                <CreateElectionCard />
              </li>
            </ul>
          </>
        )}
      </div>

      <ConfirmDeleteDialog
        item={deleting}
        getKey={(e) => e.id}
        title={(e) => `Delete ${e.id}?`}
        description={(e) => (
          <>
            This permanently deletes the draft <span className="font-medium text-foreground">{e.title}</span>. It can&apos;t be undone.
          </>
        )}
        summary={(e) => `${e.id} · ${e.category} · ${e.termId} · ${e.status}`}
        confirmLabel="Delete election"
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
      <Toast notice={notice} />
    </div>
  );
}
