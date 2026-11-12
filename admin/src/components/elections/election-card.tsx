import { CalendarDays, ChevronRight, Users } from "lucide-react";

import { formatLevelScopeShort, formatProgramScope, formatVotingDates } from "@/lib/elections";
import { cn } from "@/lib/utils";
import type { Election, ElectionStatus } from "@/types/election.types";

/** Banner fill when the election has no banner image yet, and the status pill colours. */
const STATUS_STYLES: Record<ElectionStatus, { banner: string; pill: string }> = {
  Ongoing: {
    banner: "bg-[linear-gradient(135deg,#1d6fd1_0%,var(--color-brand-blue)_55%,#0b3a7a_100%)]",
    pill: "bg-brand-gold text-brand-navy",
  },
  Upcoming: {
    banner: "bg-[linear-gradient(160deg,var(--color-brand-background)_0%,#0d2a5c_55%,var(--color-brand-blue)_100%)]",
    pill: "bg-white/85 text-brand-navy/75",
  },
  Draft: {
    banner: "bg-[linear-gradient(160deg,var(--color-brand-background)_0%,#0e1830_100%)]",
    pill: "bg-white/85 text-brand-navy/70",
  },
  Completed: {
    banner: "bg-[linear-gradient(160deg,#b9a21a_0%,#4f7d5a_45%,var(--color-brand-blue)_100%)]",
    pill: "bg-[#22c55e] text-white",
  },
  Cancelled: {
    banner: "bg-[linear-gradient(160deg,#9aa1ab_0%,#6b7280_100%)]",
    pill: "bg-[#f87171] text-white",
  },
};

/** Footer note while voters aren't generated (turnout comes with the voters module). */
function turnoutNote(status: ElectionStatus): string {
  return status === "Cancelled" ? "cancelled before voting" : "voters not generated yet";
}

export function ElectionCard({ election }: { election: Election }) {
  const styles = STATUS_STYLES[election.status];
  const cancelled = election.status === "Cancelled";

  return (
    <article
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-[0.375rem] border border-[#e2e8f0] bg-card shadow-[0_1px_2px_rgb(15_23_42/0.04)] dark:border-border",
        "transition-[translate,border-color,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:border-brand-blue/25 hover:shadow-[0_16px_32px_-22px_rgb(15_76_158/0.55)]",
        "motion-reduce:transition-none motion-reduce:hover:translate-y-0",
      )}
    >
      {/* Banner (3:1 slot) */}
      <div
        className={cn("relative h-35 bg-cover bg-center", !election.photoPath && styles.banner)}
        style={election.photoPath ? { backgroundImage: `url("${election.photoPath}")` } : undefined}
      >
        <span
          className={cn(
            "absolute top-3.5 left-3.5 inline-flex h-5 items-center rounded-full px-3 font-mono text-[0.625rem] font-semibold tracking-[0.1em] uppercase",
            styles.pill,
          )}
        >
          {election.status}
        </span>
        {!election.photoPath ? (
          <span className="absolute right-3 bottom-2.5 font-mono text-[0.625rem] tracking-[0.08em] text-white/55 uppercase">
            Banner <span aria-hidden>·</span> 3:1
          </span>
        ) : null}
      </div>

      <div className={cn("flex-1 px-4.5 pt-3.5 pb-4", cancelled && "opacity-55")}>
        <h3 className="truncate text-base leading-5.5 font-semibold text-brand-navy dark:text-foreground">{election.title}</h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <p className="font-mono text-[0.6875rem] text-muted-foreground">
            {election.id} <span aria-hidden>·</span> {election.termId}
          </p>
          <span className="inline-flex h-5 items-center rounded-[0.1875rem] border border-[#e2e8f0] px-2 font-mono text-[0.625rem] font-semibold tracking-[0.06em] text-brand-navy uppercase dark:border-border dark:text-foreground">
            {election.category}
          </span>
        </div>

        <ul className="mt-3.5 space-y-1 text-[0.8125rem] leading-5 text-muted-foreground">
          <li className="flex items-center gap-2">
            <CalendarDays aria-hidden className="size-3.5 shrink-0" strokeWidth={1.75} />
            {formatVotingDates(election.startsAt, election.endsAt)}
          </li>
          <li className="flex items-center gap-2">
            <Users aria-hidden className="size-3.5 shrink-0" strokeWidth={1.75} />
            {formatProgramScope(election.programScope)} <span aria-hidden>·</span> {formatLevelScopeShort(election.levelScope)}
          </li>
        </ul>
      </div>

      {/* Turnout (filled in once voters exist) */}
      <div className={cn("flex items-center gap-4 border-t border-[#e2e8f0] px-4.5 pt-3.5 pb-3.5 dark:border-border", cancelled && "opacity-55")}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between text-[0.6875rem] text-muted-foreground">
            <span>Turnout</span>
            <span className="font-mono text-foreground">—</span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-[#e8edf3] dark:bg-white/8" />
          <p className="mt-2 font-mono text-[0.65625rem] text-muted-foreground">{turnoutNote(election.status)}</p>
        </div>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
      </div>
    </article>
  );
}
