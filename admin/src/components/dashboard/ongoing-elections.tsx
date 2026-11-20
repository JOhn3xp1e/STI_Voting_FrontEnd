"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronRight } from "lucide-react";

import { useElectionsNav } from "@/components/elections/elections-nav";
import motion from "@/components/elections/elections.module.css";
import { electionPageHref } from "@/config/navigation";
import { formatVotingDates, votingCountdown } from "@/lib/elections";
import { cn } from "@/lib/utils";
import type { Election } from "@/types/election.types";

const cardClassName = cn(
  "group/election relative block w-full overflow-hidden rounded-[0.375rem] border border-[#e2e8f0] bg-card outline-none dark:border-border",
  "shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition-[translate,border-color,box-shadow] duration-300 ease-out",
  "hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-[0_16px_32px_-20px_rgb(15_76_158/0.5)]",
  "focus-visible:border-brand-blue/50 focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand-blue)_22%,transparent)]",
  "active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
);

function OngoingCard({ election, index, now }: { election: Election; index: number; now: Date }) {
  const countdown = votingCountdown(election, now);
  return (
    <Link
      href={electionPageHref(election.id, "manage")}
      className={cn(cardClassName, "animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both")}
      style={{ animationDelay: `${index * 70}ms` }}
    >
      {/* Banner: the election's image, or the brand gradient when it has none. */}
      <div
        className={cn(
          "relative h-35 overflow-hidden",
          !election.photoUrl && "bg-[linear-gradient(135deg,#1d6fd1_0%,var(--color-brand-blue)_55%,#0b3a7a_100%)]",
        )}
      >
        {election.photoUrl ? (
          <span
            aria-hidden
            className="absolute inset-0 bg-cover bg-center transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/election:scale-[1.045] motion-reduce:transition-none"
            style={{ backgroundImage: `url("${election.photoUrl}")` }}
          />
        ) : (
          <span
            aria-hidden
            className="absolute -inset-y-10 -left-1/2 w-1/2 -skew-x-12 bg-linear-to-r from-transparent via-white/10 to-transparent opacity-0 transition-[translate,opacity] duration-1000 ease-out group-hover/election:translate-x-[300%] group-hover/election:opacity-100 motion-reduce:hidden"
          />
        )}
        <span className="absolute top-3.5 left-3.5 inline-flex h-5 items-center gap-1.5 rounded-full bg-brand-gold px-3 font-mono text-[0.625rem] font-semibold tracking-[0.1em] text-brand-navy uppercase">
          <span aria-hidden className="relative flex size-1.5">
            <span className={cn("absolute inset-0 rounded-full bg-current", motion.liveDot)} />
            <span className="relative size-1.5 rounded-full bg-current" />
          </span>
          Ongoing
        </span>
      </div>

      <div className="flex items-end gap-3 px-4.5 pt-3.5 pb-4">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base leading-5.5 font-semibold text-brand-navy dark:text-foreground">{election.title}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <p className="font-mono text-[0.6875rem] text-muted-foreground">
              {election.id} <span aria-hidden>·</span> {election.termId}
            </p>
            <span className="inline-flex h-5 items-center rounded-[0.1875rem] border border-[#e2e8f0] px-2 font-mono text-[0.625rem] font-semibold tracking-[0.06em] text-brand-navy uppercase dark:border-border dark:text-foreground">
              {election.category}
            </span>
          </div>
          <p className="mt-2.5 flex items-center gap-2 text-[0.78125rem] text-muted-foreground">
            <CalendarDays aria-hidden className="size-3.5 shrink-0" strokeWidth={1.75} />
            <span className="truncate">
              {formatVotingDates(election.startsAt, election.endsAt)}
              {countdown ? <span className="text-foreground"> · {countdown}</span> : null}
            </span>
          </p>
        </div>
        <ChevronRight
          aria-hidden
          strokeWidth={1.75}
          className="mb-0.5 size-4 shrink-0 text-muted-foreground transition-[translate,color] duration-300 ease-out group-hover/election:translate-x-1 group-hover/election:text-brand-blue dark:group-hover/election:text-[#7aa7e6]"
        />
      </div>
    </Link>
  );
}

function CardSkeleton() {
  return (
    <div aria-hidden className="w-full overflow-hidden rounded-[0.375rem] border border-[#e2e8f0] bg-card dark:border-border">
      <div className="h-35 animate-pulse bg-[color-mix(in_oklab,var(--color-brand-muted)_14%,white)] dark:bg-white/6" />
      <div className="space-y-2 px-4.5 pt-3.5 pb-4">
        <div className="h-4.5 w-3/4 animate-pulse rounded-sm bg-muted" />
        <div className="h-3 w-1/2 animate-pulse rounded-sm bg-muted" />
        <div className="h-3 w-2/3 animate-pulse rounded-sm bg-muted" />
      </div>
    </div>
  );
}

/**
 * Dashboard home's "Ongoing elections": every election open for voting right now,
 * soonest to close first. Uses the dashboard's shared election list (the same one as the sidebar).
 */
export function OngoingElections() {
  const { elections, loaded } = useElectionsNav();
  const [now] = useState(() => new Date());
  const ongoing = elections
    .filter((e) => e.status === "Ongoing")
    .sort((a, b) => a.endsAt.localeCompare(b.endsAt) || a.id.localeCompare(b.id));

  if (!loaded) {
    return (
      <ul className="flex flex-wrap gap-4" aria-busy="true" aria-label="Loading ongoing elections">
        <li className="w-full max-w-[23.625rem]">
          <CardSkeleton />
        </li>
      </ul>
    );
  }

  if (ongoing.length === 0) {
    return (
      <div className="flex max-w-[23.625rem] flex-col items-start gap-2 rounded-[0.375rem] border border-dashed border-[#d5dbe3] px-4.5 py-5 animate-in fade-in duration-500 dark:border-border">
        <p className="text-[0.875rem] font-medium text-foreground">No elections are open for voting right now.</p>
        <p className="text-[0.78125rem] leading-4.5 text-muted-foreground">An election shows up here once its voting period starts.</p>
        <Link
          href="/elections"
          className="mt-1 rounded-sm text-[0.8125rem] font-medium text-brand-blue outline-none hover:underline hover:underline-offset-2 focus-visible:ring-2 focus-visible:ring-brand-blue/30 dark:text-[#7aa7e6]"
        >
          Go to Elections
        </Link>
      </div>
    );
  }

  return (
    <ul className="flex flex-wrap gap-4">
      {ongoing.map((election, index) => (
        <li key={election.id} className="w-full max-w-[23.625rem]">
          <OngoingCard election={election} index={index} now={now} />
        </li>
      ))}
    </ul>
  );
}
