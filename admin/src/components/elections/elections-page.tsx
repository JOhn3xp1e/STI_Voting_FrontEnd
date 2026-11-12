"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { PageError, PageLoading } from "@/components/shared/page-feedback";
import { UnderlineTabs, type UnderlineTab } from "@/components/shared/underline-tabs";
import { OptionMenu } from "@/components/students/option-menu";
import { primaryButtonClassName } from "@/components/students/student-toolbar-styles";
import { formatTermTitle, sortTerms } from "@/lib/terms";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/services/api/error-message";
import { fetchElections } from "@/services/elections/elections.service";
import { fetchTerms } from "@/services/terms/terms.service";
import type { Election, ElectionStatus } from "@/types/election.types";
import type { Term } from "@/types/term.types";

import { ElectionCard } from "./election-card";

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
  | { status: "ready"; elections: Election[]; terms: Term[] };

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
        <Plus className="size-4.5" strokeWidth={1.75} />
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

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([fetchElections({ signal }), fetchTerms({ signal })])
      .then(([elections, terms]) => setState({ status: "ready", elections, terms: sortTerms(terms) }))
      .catch((error: unknown) => {
        if (!signal.aborted) setState({ status: "error", message: getApiErrorMessage(error) });
      });
    return () => controller.abort();
  }, [attempt]);

  const elections = useMemo(() => (state.status === "ready" ? state.elections : []), [state]);
  const terms = state.status === "ready" ? state.terms : [];

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

          <Link href={NEW_ELECTION_HREF} className={cn(primaryButtonClassName, "rounded-[0.25rem] px-4 text-[0.875rem]")}>
            + New election
          </Link>
        </div>
      </div>

      {/* Election grid */}
      <div className="mt-6">
        {state.status === "loading" ? (
          <PageLoading label="Loading elections…" />
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
          <ul className="grid grid-cols-1 gap-x-5 gap-y-5.5 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((election) => (
              <li key={election.id}>
                <ElectionCard election={election} />
              </li>
            ))}
            <li>
              <CreateElectionCard />
            </li>
          </ul>
        )}
      </div>
    </div>
  );
}
