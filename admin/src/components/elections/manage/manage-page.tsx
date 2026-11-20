"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Check, Lock, SearchX } from "lucide-react";

import { CareerBadge, careerStyle, outlineButtonClassName } from "@/components/elections/create/create-election-ui";
import { termOptionLabel } from "@/components/elections/create/create-election-steps";
import wizard from "@/components/elections/create/wizard.module.css";
import motion from "@/components/shared/motion.module.css";
import { cardClassName } from "@/components/shared/section-card";
import { PageError, Toast, useNotice } from "@/components/shared/page-feedback";
import { useElectionsNav } from "@/components/elections/elections-nav";
import { StatusAction } from "@/components/elections/status-action";
import { PageSkeleton } from "@/components/shared/skeleton";
import { AnimatedNumber } from "@/components/students/animated-number";
import { toolbarButtonClassName } from "@/components/students/student-toolbar-styles";
import { electionPageHref } from "@/config/navigation";
import { buildChecklist, count, countdownTo, plural, stageOf, turnoutOf, type ChecklistItem } from "@/lib/election-manage";
import {
  electionEditHref,
  takeNotice,
  electionToForm,
  formatDay,
  formatDayTime,
  formatLevelScope,
  instantToLocal,
  levelGroupLabel,
  levelLabel,
  levelPicks,
  programGroupLabel,
  programPicks,
  programsByCareer,
  voterPool,
} from "@/lib/elections";
import { careerColor, sortCareers } from "@/lib/programs";
import { cn } from "@/lib/utils";
import { isApiError } from "@/services/api/client";
import { getApiErrorMessage } from "@/services/api/error-message";
import { fetchCandidates, fetchPositions } from "@/services/ballot/ballot.service";
import { fetchElection, fetchVoterEnrollments, setElectionStatus } from "@/services/elections/elections.service";
import { fetchPartylists } from "@/services/partylists/partylists.service";
import { fetchCareers } from "@/services/programs/programs.service";
import { fetchTerms } from "@/services/terms/terms.service";
import { fetchElectionVoters, fetchVoterEmailSummary, type VoterEmailSummary, type VoterRecord } from "@/services/voters/voters.service";
import type { Candidate, Position } from "@/types/ballot.types";
import type { Election, ElectionStatus, VoterEnrollment } from "@/types/election.types";
import type { Partylist } from "@/types/partylist.types";
import type { Career } from "@/types/program.types";
import type { Term } from "@/types/term.types";

/* -------------------------------------------------------------------------- */
/*                                   Loading                                  */
/* -------------------------------------------------------------------------- */

interface Data {
  election: Election;
  terms: Term[];
  careers: Career[];
  positions: Position[];
  candidates: Candidate[];
  parties: Partylist[];
  /** The rest are extras: `null` when they couldn't be loaded. */
  enrollments: VoterEnrollment[] | null;
  voters: VoterRecord[] | null;
  emails: VoterEmailSummary | null;
}

type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "not-found" } | { status: "ready"; data: Data };

/** `/elections/[id]/manage`: progress, election info, the preparation checklist and what happens next. */
export function ManagePage({ electionId }: { electionId: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([
      fetchElection(electionId, { signal }),
      fetchTerms({ signal }),
      fetchCareers({ signal }),
      fetchPositions(electionId, { signal }),
      fetchCandidates(electionId, { signal }),
      fetchPartylists(electionId, { signal }),
      fetchVoterEnrollments({ signal }).catch(() => null),
      fetchElectionVoters(electionId, { signal }).catch(() => null),
      fetchVoterEmailSummary(electionId, { signal }).catch(() => null),
    ])
      .then(([election, terms, careers, positions, candidates, parties, enrollments, voters, emails]) =>
        setState({ status: "ready", data: { election, terms, careers: sortCareers(careers), positions, candidates, parties, enrollments, voters, emails } }),
      )
      .catch((error: unknown) => {
        if (signal.aborted) return;
        if (isApiError(error) && error.isNotFound) setState({ status: "not-found" });
        else setState({ status: "error", message: getApiErrorMessage(error) });
      });
    return () => controller.abort();
  }, [electionId, attempt]);

  if (state.status === "loading") return <PageSkeleton label="Loading the election…" />;
  if (state.status === "not-found") {
    return (
      <div className="flex min-h-80 flex-col items-center justify-center gap-3 px-4 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <SearchX aria-hidden className="size-4.5" strokeWidth={1.75} />
        </span>
        <p className="text-[0.9375rem] font-semibold text-foreground">{electionId} wasn&apos;t found</p>
        <Link href="/elections" className={cn(toolbarButtonClassName, "h-8 px-3.5 text-[0.8125rem]")}>
          Back to elections
        </Link>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <PageError
        title="Couldn't load the election"
        message={state.message}
        onRetry={() => {
          setState({ status: "loading" });
          setAttempt((n) => n + 1);
        }}
      />
    );
  }
  return (
    <ManageWorkspace
      data={state.data}
      onElection={(election) => setState((current) => (current.status === "ready" ? { ...current, data: { ...current.data, election } } : current))}
    />
  );
}

/** The current time, ticking every second (for the countdowns). */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

const rise = (index: number): CSSProperties => ({ animationDelay: `${index * 80}ms` });

function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 font-mono text-[0.6875rem] font-semibold tracking-[0.16em] text-foreground uppercase">{children}</h2>;
}

/* -------------------------------------------------------------------------- */
/*                                  Workspace                                 */
/* -------------------------------------------------------------------------- */

function ManageWorkspace({ data, onElection }: { data: Data; onElection: (election: Election) => void }) {
  const { election, terms, careers, positions, candidates, parties, enrollments, voters, emails } = data;
  const now = useNow();
  const { notice, say } = useNotice();
  const { refresh: refreshElectionsNav } = useElectionsNav();
  // e.g. "Saved as a draft, but it couldn't be scheduled: …" left by the wizard.
  const [leftNotice, setLeftNotice] = useState(() => takeNotice(election.id));

  /** Moves the election to another status (the server checks the move), then says what happened. */
  async function move(status: ElectionStatus, message: string) {
    const saved = await setElectionStatus(election.id, status);
    onElection(saved);
    refreshElectionsNav();
    setLeftNotice(null);
    say(message);
  }

  const scope = useMemo(() => {
    const programs = programsByCareer(careers, enrollments ?? []);
    const form = electionToForm(election, careers, programs);
    const pool = enrollments ? voterPool(enrollments, form, careers, programs) : null;
    const colors = new Map(careers.map((c) => [c.code, careerColor(c, careers)]));
    return { programs, form, pool, colors };
  }, [election, careers, enrollments]);

  const eligible = scope.pool?.total ?? null;
  const checklist = useMemo(
    () => buildChecklist({ parties, positions, candidates, voters, emails, eligible }),
    [parties, positions, candidates, voters, emails, eligible],
  );
  const done = checklist.filter((i) => i.done).length;
  const turnout = turnoutOf(voters);
  const voterCount = voters?.length ?? 0;
  const term = terms.find((t) => t.id === election.termId);

  return (
    <div className="space-y-7 px-4 pb-16 sm:px-6 lg:px-8">
      {leftNotice ? (
        <p
          role={leftNotice.tone === "warn" ? "alert" : "status"}
          className={cn(
            "flex items-start gap-2.5 rounded-[0.375rem] border px-4 py-3 text-[0.8125rem] leading-5 animate-in fade-in slide-in-from-top-1 duration-300 motion-reduce:animate-none",
            leftNotice.tone === "warn"
              ? "border-[#fcd34d] bg-[#fffbeb] text-[#92400e] dark:border-brand-gold/30 dark:bg-brand-gold/8 dark:text-brand-gold"
              : "border-[#86efac] bg-[#f0fdf4] text-[#166534] dark:border-[#22c55e]/30 dark:bg-[#22c55e]/8 dark:text-[#4ade80]",
          )}
        >
          {leftNotice.tone === "success" ? <Check aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2.5} /> : null}
          <span className="min-w-0 flex-1">{leftNotice.text}</span>
          <button type="button" onClick={() => setLeftNotice(null)} className="shrink-0 cursor-pointer font-medium underline-offset-2 hover:underline">
            Dismiss
          </button>
        </p>
      ) : null}
      <section className={motion.riseIn} style={rise(0)}>
        <SectionLabel>Election progress</SectionLabel>
        <ProgressCard election={election} done={done} total={checklist.length} />
      </section>

      <section className={motion.riseIn} style={rise(1)}>
        <SectionLabel>Election info</SectionLabel>
        <div className={cn(cardClassName, "grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_11rem] xl:grid-cols-[minmax(0,1fr)_11rem_minmax(0,23rem)]")}>
          {/* Details */}
          <div className="min-w-0 px-5 py-4.5">
            <p className="flex flex-wrap items-baseline gap-x-2.5">
              <span className="text-[1.0625rem] font-semibold text-foreground">{election.title}</span>
              <span className="font-mono text-[0.6875rem] text-muted-foreground">{election.id}</span>
            </p>
            <dl className="mt-3.5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              <InfoField label="Category">{election.category}</InfoField>
              <InfoField label="Term">{term ? termOptionLabel(term) : election.termId}</InfoField>
              <InfoField label="Rules">{election.rules?.trim() || "—"}</InfoField>
              <InfoField label="Opens">{formatDayTime(instantToLocal(election.startsAt))}</InfoField>
              <InfoField label="Closes">{formatDayTime(instantToLocal(election.endsAt))}</InfoField>
            </dl>
          </div>

          {/* Voters */}
          <div className="border-t border-[#e2e8f0] px-5 py-4.5 lg:border-t-0 lg:border-l dark:border-border">
            <p className="font-mono text-[0.625rem] tracking-[0.1em] text-muted-foreground uppercase">Voters</p>
            <AnimatedNumber
              value={voterCount || (eligible ?? 0)}
              from={0}
              duration={1000}
              className="mt-1.5 block text-[1.875rem] leading-9 font-semibold tracking-tight text-foreground tabular-nums"
            />
            <p className="text-[0.8125rem] text-muted-foreground">{voterCount ? (voterCount === 1 ? "voter" : "voters") : "eligible voters"}</p>
            {turnout && election.status !== "Draft" && election.status !== "Upcoming" ? (
              <p className="mt-2 text-[0.75rem] text-foreground">
                {count(turnout.voted)} voted · {Math.round((turnout.voted / turnout.total) * 100)}%
              </p>
            ) : null}
          </div>

          {/* Who can vote */}
          <div className="border-t border-[#e2e8f0] px-5 py-4.5 lg:col-span-2 xl:col-span-1 xl:border-t-0 xl:border-l dark:border-border">
            <p className="font-mono text-[0.625rem] tracking-[0.1em] text-muted-foreground uppercase">Who can vote</p>
            <WhoCanVote scope={scope} />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_21.25rem]">
        <section className={motion.riseIn} style={rise(2)}>
          <SectionLabel>Preparation checklist</SectionLabel>
          <Checklist election={election} items={checklist} done={done} />
        </section>
        <section className={motion.riseIn} style={rise(3)}>
          <SectionLabel>{STAGE_TITLE[election.status]}</SectionLabel>
          <StageCard election={election} now={now} checklist={checklist} voters={voterCount} eligible={eligible} turnout={turnout} positions={positions.length} onMove={move} />
        </section>
      </div>

      <Toast notice={notice} />
    </div>
  );
}

function InfoField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.75rem] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-[0.8125rem] leading-5 break-words text-foreground">{children}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Progress                                  */
/* -------------------------------------------------------------------------- */

function ProgressCard({ election, done, total }: { election: Election; done: number; total: number }) {
  const cancelled = election.status === "Cancelled";
  const stage = stageOf(election.status);
  const opens = instantToLocal(election.startsAt);
  const closes = instantToLocal(election.endsAt);

  const steps = [
    {
      title: "Preparation",
      detail: cancelled
        ? "Cancelled"
        : election.status === "Draft"
          ? "Draft · not scheduled yet"
          : stage > 0
            ? "Done"
            : done === total
              ? "Ready to start"
              : `${done} of ${total} checks done`,
    },
    {
      title: "Ongoing",
      detail: cancelled
        ? "Didn't run"
        : stage === 0
          ? `Scheduled · ${formatDayTime(opens)}`
          : stage === 1
            ? `Open · closes ${formatDayTime(closes)}`
            : `${formatDay(opens)} → ${formatDay(closes)}`,
    },
    {
      title: "Results",
      detail: cancelled ? "No results" : stage === 2 ? `Voting closed ${formatDayTime(closes)}` : "Tally and publish after voting closes",
    },
  ];

  return (
    <ol className={cn(cardClassName, "flex flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:gap-0")}>
      {steps.map((step, index) => {
        const state = cancelled ? (index === stage ? "cancelled" : "todo") : index < stage ? "done" : index === stage ? "current" : "todo";
        return (
          <li key={step.title} className={cn("flex min-w-0 items-center gap-3", index < steps.length - 1 && "md:flex-1")} aria-current={state === "current" ? "step" : undefined}>
            <span aria-hidden className="relative flex size-6.5 shrink-0 items-center justify-center">
              {state === "current" ? <span className="absolute -inset-0.5 animate-ping rounded-full bg-brand-gold/45 [animation-duration:2s] motion-reduce:animate-none" /> : null}
              <span
                key={state}
                className={cn(
                  "relative flex size-6.5 items-center justify-center rounded-full font-mono text-[0.6875rem] transition-colors duration-300",
                  wizard.stepPop,
                  state === "done" && "bg-[#22c55e] text-white",
                  state === "current" && "bg-brand-navy text-white shadow-[0_0_0_3px_var(--color-brand-gold)] dark:bg-white dark:text-brand-navy",
                  state === "cancelled" && "bg-[#f87171] text-white",
                  state === "todo" && "border border-[#d5dbe3] text-muted-foreground dark:border-border",
                )}
              >
                {state === "done" ? <Check className="size-3.5" strokeWidth={3} /> : index + 1}
              </span>
            </span>
            <span className="min-w-0">
              <span className={cn("block text-[0.9375rem] font-semibold", state === "todo" ? "text-muted-foreground" : "text-foreground")}>{step.title}</span>
              <span className="block truncate text-[0.75rem] text-muted-foreground">{step.detail}</span>
            </span>
            {index < steps.length - 1 ? (
              <span aria-hidden className="relative mx-5 hidden h-px min-w-8 flex-1 overflow-hidden bg-[#e2e8f0] md:block dark:bg-border">
                <span
                  className={cn(
                    "absolute inset-0 origin-left bg-[#22c55e] transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                    !cancelled && index < stage ? "scale-x-100" : "scale-x-0",
                  )}
                />
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Who can vote                                */
/* -------------------------------------------------------------------------- */

interface ScopeData {
  programs: ReturnType<typeof programsByCareer>;
  form: ReturnType<typeof electionToForm>;
  pool: ReturnType<typeof voterPool> | null;
  colors: ReadonlyMap<string, string>;
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-5.5 items-center gap-1 rounded-full bg-(--career) px-2.5 text-[0.71875rem] font-medium whitespace-nowrap text-(--career-fg)">
      <Check aria-hidden className="size-3" strokeWidth={2.6} />
      {children}
    </span>
  );
}

function WhoCanVote({ scope }: { scope: ScopeData }) {
  const { pool, form, programs, colors } = scope;
  if (!pool) return <p className="mt-2 text-[0.8125rem] text-muted-foreground">Couldn&apos;t count the students in this scope.</p>;
  return (
    <>
      <div className="mt-2 space-y-1.5">
        {pool.careers.map(({ career }) => {
          const picks = programPicks(form, career, programs);
          const levels = levelPicks(form, career);
          const hasPrograms = (programs.get(career.code)?.length ?? 0) > 0;
          return (
            <div key={career.code} style={careerStyle(colors.get(career.code)!)} className="flex flex-wrap items-center gap-1.5">
              <CareerBadge code={career.code} className="h-5.5 text-[0.65625rem]" />
              {hasPrograms ? <Pill>{picks.length ? picks.join(", ") : `All ${programGroupLabel(career).toLowerCase()}`}</Pill> : null}
              <Pill>{levels.length ? formatLevelScope(levels, [career]) : `All ${levelGroupLabel(career).toLowerCase()}s`}</Pill>
            </div>
          );
        })}
      </div>
      <div className="mt-3 space-y-2">
        {pool.careers.map(({ career, total, levels, scale }) => (
          <div key={career.code} style={careerStyle(colors.get(career.code)!)} className="rounded-[0.375rem] bg-[#f5f7fa] px-3 py-2.5 dark:bg-white/4">
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <p className="text-[0.8125rem] font-medium text-foreground">{career.name}</p>
              <p className="font-mono text-[0.6875rem] text-foreground">
                <AnimatedNumber value={total} from={0} duration={900} /> · {pool.total ? Math.round((total / pool.total) * 100) : 0}%
              </p>
            </div>
            <ul className="space-y-1">
              {levels.map(({ level, count: n, included }, index) => (
                <li key={level} className={cn("flex items-center gap-3", !included && "opacity-40")}>
                  <span className="w-18 shrink-0 text-[0.75rem] text-muted-foreground">{levelLabel(level, career)}</span>
                  <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[#e3e8ef] dark:bg-white/10">
                    <span className={cn("absolute inset-y-0 left-0 rounded-full bg-(--career)", wizard.barGrow)} style={{ width: `${(n / scale) * 100}%`, animationDelay: `${300 + index * 60}ms` }} />
                  </span>
                  <AnimatedNumber value={n} from={0} duration={900} delay={300 + index * 60} className="w-9 shrink-0 text-right font-mono text-[0.6875rem] text-foreground tabular-nums" />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-[0.75rem] text-muted-foreground">{plural(pool.total, "student matches", "students match")} these filters</p>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Checklist                                 */
/* -------------------------------------------------------------------------- */

const GROUPS: Record<1 | 2, string> = { 1: "1 · Ballot · Election admin", 2: "2 · Voters · Super admin" };

function Checklist({ election, items, done }: { election: Election; items: ChecklistItem[]; done: number }) {
  const total = items.length;
  const preparing = election.status === "Draft" || election.status === "Upcoming";
  const headline = !preparing
    ? election.status === "Cancelled"
      ? "Cancelled. The checklist is kept for the record."
      : election.status === "Completed"
        ? "Voting has ended. The checklist is kept for the record."
        : "Voting has started, so preparation is locked."
    : done === total
      ? "All set. Voting can open on schedule."
      : "Finish every item before voting opens";

  return (
    <div className={cn(cardClassName, "overflow-hidden")}>
      <div className="px-5 pt-4 pb-4">
        <div className="flex items-baseline justify-between gap-3">
          <p key={headline} className={cn("text-[0.9375rem] font-semibold text-foreground", wizard.fadeUp)}>
            {headline}
          </p>
          <p className="shrink-0 text-[0.8125rem] text-muted-foreground tabular-nums">
            {done} of {total} done
          </p>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e3e8ef] dark:bg-white/10">
          <div
            className={cn("h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]", done === total ? "bg-[#22c55e]" : "bg-brand-blue dark:bg-[#7aa7e6]", wizard.barGrow)}
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>
      </div>

      {([1, 2] as const).map((group) => (
        <div key={group}>
          <p className="border-y border-[#e2e8f0] bg-[#f8fafc] px-5 py-2 font-mono text-[0.625rem] tracking-[0.1em] text-muted-foreground uppercase dark:border-border dark:bg-white/3">
            {GROUPS[group]}
          </p>
          <ul className="divide-y divide-[#e2e8f0] dark:divide-border">
            {items
              .filter((item) => item.group === group)
              .map((item, index) => (
                <li key={item.key} style={rise(index + (group - 1) * 2)} className={cn("flex items-center gap-3.5 px-5 py-3.5", motion.riseIn)}>
                  {item.done ? (
                    <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full bg-[#22c55e] text-white", wizard.stepPop)} style={{ animationDelay: `${200 + index * 80}ms` }}>
                      <Check aria-hidden className="size-3.5" strokeWidth={3} />
                    </span>
                  ) : (
                    <span aria-hidden className="size-6 shrink-0 rounded-full border-[1.5px] border-[#cbd5e1] dark:border-white/20" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.875rem] font-medium text-foreground">
                      {item.title}
                      <span className="sr-only">{item.done ? " (done)" : " (not done)"}</span>
                    </p>
                    <p className="truncate text-[0.75rem] text-muted-foreground">{item.detail}</p>
                  </div>
                  <Link
                    href={electionPageHref(election.id, item.page)}
                    className={cn(
                      "group/link inline-flex shrink-0 items-center gap-1 rounded-sm text-[0.8125rem] outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30",
                      item.done || !preparing ? "text-muted-foreground hover:text-foreground" : "font-medium text-brand-blue hover:underline dark:text-[#7aa7e6]",
                    )}
                  >
                    {item.done || !preparing ? "View" : item.action}
                    <ArrowRight aria-hidden className="size-3.5 transition-transform duration-200 group-hover/link:translate-x-0.5" />
                  </Link>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 Stage card                                 */
/* -------------------------------------------------------------------------- */

const STAGE_TITLE: Record<ElectionStatus, string> = {
  Draft: "Schedule election",
  Upcoming: "Start election",
  Ongoing: "Voting",
  Completed: "Results",
  Cancelled: "Status",
};

const STAGE_PILL: Record<ElectionStatus, string> = {
  Draft: "bg-muted text-muted-foreground",
  Upcoming: "bg-[#e8edf3] text-brand-navy/70 dark:bg-white/10 dark:text-foreground/80",
  Ongoing: "bg-brand-gold text-brand-navy",
  Completed: "bg-[#22c55e] text-white",
  Cancelled: "bg-[#f87171] text-white",
};

interface StageCardProps {
  election: Election;
  now: number;
  checklist: ChecklistItem[];
  voters: number;
  eligible: number | null;
  turnout: { voted: number; total: number } | null;
  /** Moves the election to another status; rejects with the server's reason. */
  /** Positions on the ballot (the server needs at least one to schedule). */
  positions: number;
  onMove: (status: ElectionStatus, message: string) => Promise<void>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2">
      <dt className="text-[0.8125rem] text-muted-foreground">{label}</dt>
      <dd className="text-right text-[0.8125rem] text-foreground">{children}</dd>
    </div>
  );
}

/** "Opens in 2d 04:12:33" with digits that roll as they change. */
function CountdownBlock({ label, target, now }: { label: string; target: string; now: number }) {
  const left = countdownTo(target, now);
  const parts: [string, number][] = [
    ["days", left.days],
    ["hrs", left.hours],
    ["min", left.minutes],
    ["sec", left.seconds],
  ];
  return (
    <div className="mt-4">
      <p className="text-[0.75rem] text-muted-foreground">{label}</p>
      <div className="mt-1.5 grid grid-cols-4 gap-2" role="timer" aria-live="off">
        {parts.map(([unit, value]) => (
          <div key={unit} className="rounded-[0.375rem] bg-[#f5f7fa] px-2 py-2 text-center dark:bg-white/5">
            <span className="block h-7 overflow-hidden text-[1.25rem] leading-7 font-semibold text-foreground tabular-nums">
              <span key={value} className="block animate-in fade-in slide-in-from-top-2 duration-300 motion-reduce:animate-none">
                {String(value).padStart(2, "0")}
              </span>
            </span>
            <span className="font-mono text-[0.5625rem] tracking-[0.1em] text-muted-foreground uppercase">{unit}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StageCard({ election, now, checklist, voters, eligible, turnout, positions, onMove }: StageCardProps) {
  const opens = instantToLocal(election.startsAt);
  const closes = instantToLocal(election.endsAt);
  const left = checklist.filter((i) => !i.done);
  const audience = voters || eligible || 0;
  const status = election.status;
  const settingsHref = electionPageHref(election.id, "settings");

  let body: ReactNode;
  let footer: ReactNode = null;

  if (status === "Draft") {
    const opensPassed = new Date(election.startsAt).getTime() <= now;
    body = (
      <>
        <p className="mt-3 text-[0.875rem] leading-5.5 text-foreground">
          This election is still a draft. Scheduling it locks its details and who can vote; voting then opens on its own at the opening time.
        </p>
        <dl className="mt-4 rounded-[0.375rem] bg-[#f5f7fa] dark:bg-white/4">
          <Row label="Opens">{formatDayTime(opens)}</Row>
          <Row label="Closes">{formatDayTime(closes)}</Row>
        </dl>
        <div className="mt-4 space-y-2.5">
          <StatusAction
            label="Schedule election"
            icon={<ArrowRight aria-hidden className="size-4" />}
            disabled={opensPassed}
            confirmTitle="Schedule this election?"
            confirmBody={
              <>
                It becomes Upcoming and opens on its own on {formatDayTime(opens)}. Its details and who can vote lock; you can still move the schedule
                or move it back to draft.
                {left.length ? ` ${plural(left.length, "checklist item")} still open.` : null}
              </>
            }
            confirmLabel="Schedule"
            onConfirm={() => onMove("Upcoming", `Scheduled. Voting opens ${formatDayTime(opens)}.`)}
          />
          <Link href={electionEditHref(election.id)} className={cn(outlineButtonClassName, "w-full justify-between")}>
            Continue editing
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
      </>
    );
    footer = opensPassed ? (
      <Footnote tone="warn">
        The opening time has passed.{" "}
        <Link href={electionEditHref(election.id)} className="font-medium text-brand-blue hover:underline dark:text-[#7aa7e6]">
          Pick a later one
        </Link>{" "}
        to schedule it.
      </Footnote>
    ) : positions === 0 ? (
      <Footnote tone="warn">
        No positions yet. Add them on the{" "}
        <Link href={electionPageHref(election.id, "ballot")} className="font-medium text-brand-blue hover:underline dark:text-[#7aa7e6]">
          Ballot
        </Link>{" "}
        before voting opens.
      </Footnote>
    ) : left.length ? (
      <Footnote tone="warn">
        {plural(left.length, "item")} left · {left[0].title}
      </Footnote>
    ) : (
      <Footnote tone="ok">All {checklist.length} checks complete</Footnote>
    );
  } else if (status === "Upcoming") {
    const overdue = new Date(election.startsAt).getTime() <= now;
    body = (
      <>
        <p className="mt-3 text-[0.875rem] leading-5.5 text-foreground">
          Voting opens on its own for {plural(audience, "voter")} at the scheduled time. Party lists, candidates and the voter list lock then.
        </p>
        {overdue ? (
          <p className="mt-4 rounded-[0.375rem] border border-[#fcd34d] bg-[#fffbeb] px-3 py-2.5 text-[0.8125rem] leading-5 text-[#92400e] dark:border-brand-gold/30 dark:bg-brand-gold/8 dark:text-brand-gold">
            The opening time has passed. Voting opens within a minute once every position has a candidate and voters are set.
          </p>
        ) : (
          <CountdownBlock label="Opens in" target={election.startsAt} now={now} />
        )}
        <dl className="mt-4 rounded-[0.375rem] bg-[#f5f7fa] dark:bg-white/4">
          <Row label="Opens">{formatDayTime(opens)}</Row>
          <Row label="Closes">{formatDayTime(closes)}</Row>
        </dl>
        <div className="mt-4 space-y-2.5">
          <StatusAction
            label="Start voting now"
            icon={<ArrowRight aria-hidden className="size-4" />}
            confirmTitle="Open voting now?"
            confirmBody={<>Voting opens right away instead of on {formatDayTime(opens)}, for {plural(audience, "voter")}. Party lists, candidates and the voter list lock.</>}
            confirmLabel="Start voting"
            onConfirm={() => onMove("Ongoing", "Voting is open.")}
          />
          <Link href={settingsHref} className={cn(outlineButtonClassName, "w-full justify-between")}>
            Change schedule
            <ArrowRight aria-hidden className="size-4" />
          </Link>
          <StatusAction
            label="Move back to draft"
            variant="outline"
            confirmTitle="Move it back to draft?"
            confirmBody="Its details and who can vote unlock for editing. It won't open until it's scheduled again."
            confirmLabel="Move to draft"
            onConfirm={() => onMove("Draft", "Moved back to draft.")}
          />
        </div>
      </>
    );
    footer = left.length ? (
      <Footnote tone="warn">
        {plural(left.length, "item")} left · {left[0].title}
      </Footnote>
    ) : (
      <Footnote tone="ok">All {checklist.length} checks complete</Footnote>
    );
  } else if (status === "Ongoing") {
    body = (
      <>
        <p className="mt-3 text-[0.875rem] leading-5.5 text-foreground">Voting is open. Party lists, candidates and the voter list are locked until it closes.</p>
        <Turnout turnout={turnout} />
        <CountdownBlock label="Closes in" target={election.endsAt} now={now} />
        <dl className="mt-4 rounded-[0.375rem] bg-[#f5f7fa] dark:bg-white/4">
          <Row label="Opened">{formatDayTime(opens)}</Row>
          <Row label="Closes">{formatDayTime(closes)}</Row>
        </dl>
        <StatusAction
          className="mt-4"
          label="Close voting now"
          variant="danger"
          confirmTitle="Close voting now?"
          confirmBody={<>Voting ends right away instead of on {formatDayTime(closes)}. Nobody else can vote, and this can&apos;t be undone.</>}
          confirmLabel="Close voting"
          onConfirm={() => onMove("Completed", "Voting is closed.")}
        />
      </>
    );
    footer = <Footnote tone="live">Live · counts refresh when you reload the page</Footnote>;
  } else if (status === "Completed") {
    body = (
      <>
        <p className="mt-3 text-[0.875rem] leading-5.5 text-foreground">Voting closed {formatDayTime(closes)}.</p>
        <Turnout turnout={turnout} final />
        <dl className="mt-4 rounded-[0.375rem] bg-[#f5f7fa] dark:bg-white/4">
          <Row label="Opened">{formatDayTime(opens)}</Row>
          <Row label="Closed">{formatDayTime(closes)}</Row>
        </dl>
      </>
    );
    footer = <Footnote tone="muted">Tallying and publishing results come with the results module.</Footnote>;
  } else {
    body = (
      <>
        <p className="mt-3 text-[0.875rem] leading-5.5 text-foreground">This election was cancelled. Its ballot and settings are kept, and it can be brought back as a draft.</p>
        <dl className="mt-4 rounded-[0.375rem] bg-[#f5f7fa] dark:bg-white/4">
          <Row label="Was set to open">{formatDayTime(opens)}</Row>
          <Row label="Was set to close">{formatDayTime(closes)}</Row>
        </dl>
      </>
    );
    body = (
      <>
        {body}
        <StatusAction
          className="mt-4"
          label="Move back to draft"
          variant="outline"
          confirmTitle="Bring it back as a draft?"
          confirmBody="It becomes a draft again, so you can edit it and schedule it later."
          confirmLabel="Move to draft"
          onConfirm={() => onMove("Draft", "Moved back to draft.")}
        />
      </>
    );
    footer = <Footnote tone="muted">It won&apos;t open until it&apos;s scheduled again.</Footnote>;
  }

  return (
    <div className={cn(cardClassName, "px-5 pt-4.5 pb-4.5")}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.8125rem] text-muted-foreground">Current stage</p>
        <span key={status} className={cn("inline-flex h-5.5 items-center gap-1.5 rounded-full px-2.5 font-mono text-[0.625rem] font-semibold tracking-[0.1em] uppercase", STAGE_PILL[status], motion.pillPop)}>
          {status === "Ongoing" ? (
            <span aria-hidden className="relative flex size-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-current opacity-60 motion-reduce:animate-none" />
              <span className="relative size-1.5 rounded-full bg-current" />
            </span>
          ) : null}
          {status === "Ongoing" ? "Live" : status}
        </span>
      </div>
      {body}
      {footer ? <div className="mt-3.5">{footer}</div> : null}
    </div>
  );
}

function Turnout({ turnout, final = false }: { turnout: { voted: number; total: number } | null; final?: boolean }) {
  const pct = turnout ? Math.round((turnout.voted / turnout.total) * 100) : null;
  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[0.75rem] text-muted-foreground">{final ? "Final turnout" : "Turnout"}</p>
        <p className="text-[1.125rem] font-semibold text-foreground tabular-nums">{pct === null ? "—" : <><AnimatedNumber value={pct} from={0} duration={1000} />%</>}</p>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#e3e8ef] dark:bg-white/10">
        <div className={cn("h-full rounded-full bg-brand-gold", wizard.barGrow)} style={{ width: `${pct ?? 0}%` }} />
      </div>
      <p className="mt-1.5 text-[0.75rem] text-muted-foreground">
        {turnout
          ? `${count(turnout.voted)} of ${plural(turnout.total, "voter")} voted`
          : final
            ? "No turnout recorded: this election had no voters set."
            : "Turnout shows once voters are set."}
      </p>
    </div>
  );
}

function Footnote({ tone, children }: { tone: "ok" | "warn" | "muted" | "live"; children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-[0.75rem] leading-4.5 text-muted-foreground">
      {tone === "muted" ? (
        <Lock aria-hidden className="size-3 shrink-0" />
      ) : (
        <span aria-hidden className="relative flex size-2 shrink-0">
          {tone === "live" ? <span className="absolute inset-0 animate-ping rounded-full bg-[#22c55e] opacity-60 motion-reduce:animate-none" /> : null}
          <span className={cn("relative size-2 rounded-full", tone === "warn" ? "bg-brand-gold" : "bg-[#22c55e]")} />
        </span>
      )}
      <span className="min-w-0">{children}</span>
    </p>
  );
}
