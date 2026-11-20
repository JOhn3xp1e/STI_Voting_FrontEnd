"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu } from "@base-ui/react/menu";
import { CalendarDays, ChevronRight, Ellipsis, Pencil, Trash2, Users } from "lucide-react";

import { menuItemClassName, popupClassName } from "@/components/dashboard/popup-styles";
import { AnimatedNumber } from "@/components/students/animated-number";
import {
  canDeleteElection,
  canEditElection,
  editBlockedReason,
  electionEditHref,
  formatLevelScopeShort,
  formatProgramScope,
  formatVotingDates,
  votingCountdown,
} from "@/lib/elections";
import { cn } from "@/lib/utils";
import type { Election, ElectionStatus } from "@/types/election.types";

import motion from "./elections.module.css";

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

/**
 * Footer note under the turnout bar (turnout itself comes with the voters module):
 * "312 voters · opens in 6 days", "voters not generated yet", "cancelled before voting".
 */
function FooterNote({ election, voters, now }: { election: Election; voters: number | null; now: Date }) {
  if (election.status === "Draft") return <>voters not generated yet</>;
  if (election.status === "Cancelled") return <>cancelled before voting</>;
  const countdown = votingCountdown(election, now);
  return (
    <>
      {voters !== null ? (
        <span className="animate-in fade-in duration-500 motion-reduce:animate-none">
          <AnimatedNumber value={voters} from={0} duration={900} /> {voters === 1 ? "voter" : "voters"}
          {countdown ? <span aria-hidden> · </span> : null}
        </span>
      ) : null}
      {countdown}
    </>
  );
}

/** "⋯" on the banner: Edit and Delete, each disabled with the reason when not allowed. */
function CardMenu({ election, onDelete }: { election: Election; onDelete: (election: Election) => void }) {
  const router = useRouter();
  const editable = canEditElection(election.status);
  const deletable = canDeleteElection(election.status);

  return (
    <Menu.Root modal={false}>
      <Menu.Trigger
        aria-label={`Options for ${election.title}`}
        className={cn(
          "absolute top-3 right-3 z-10 flex size-7.5 cursor-pointer items-center justify-center rounded-full bg-black/30 text-white outline-none backdrop-blur-sm",
          "transition-[background-color,scale] duration-200 hover:bg-black/50 active:scale-95 data-popup-open:bg-black/55",
          "focus-visible:ring-2 focus-visible:ring-white/80 motion-reduce:active:scale-100",
        )}
      >
        <Ellipsis aria-hidden className="size-4" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50 outline-none">
          <Menu.Popup data-themed className={cn(popupClassName, "w-56 p-1.5")}>
            <Menu.Item disabled={!editable} onClick={() => router.push(electionEditHref(election.id))} className={cn(menuItemClassName, "data-disabled:opacity-50")}>
              <Pencil aria-hidden />
              Edit election
            </Menu.Item>
            <Menu.Item
              disabled={!deletable}
              onClick={() => onDelete(election)}
              className={cn(
                menuItemClassName,
                "text-destructive [&_svg]:text-destructive data-highlighted:bg-destructive/8 data-highlighted:text-destructive data-highlighted:[&_svg]:text-destructive",
                "dark:data-highlighted:bg-destructive/15 dark:data-highlighted:text-destructive data-disabled:opacity-50",
              )}
            >
              <Trash2 aria-hidden />
              Delete
            </Menu.Item>
            {!editable || !deletable ? (
              <p className="px-2.5 pt-1.5 pb-1 text-[0.6875rem] leading-4 text-muted-foreground">
                {!editable ? editBlockedReason(election.status) : "Only drafts can be deleted."}
              </p>
            ) : null}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

interface ElectionCardProps {
  election: Election;
  onDelete: (election: Election) => void;
  /** Students the election's filters let vote; `null` while enrollments load. */
  voters: number | null;
  /** For "opens in 6 days". */
  now: Date;
  /** Just created or saved: the card pulses and scrolls into view. */
  saved?: boolean;
}

/** The whole card opens the edit page (when editable); the "⋯" menu sits above that link. */
export function ElectionCard({ election, onDelete, voters, now, saved = false }: ElectionCardProps) {
  const styles = STATUS_STYLES[election.status];
  const cancelled = election.status === "Cancelled";
  const ongoing = election.status === "Ongoing";
  const editable = canEditElection(election.status);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (saved) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [saved]);

  return (
    <article
      ref={ref}
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-[0.375rem] border border-[#e2e8f0] bg-card shadow-[0_1px_2px_rgb(15_23_42/0.04)] dark:border-border",
        "transition-[translate,border-color,box-shadow] duration-300 ease-out motion-reduce:transition-none",
        editable &&
          "hover:-translate-y-1 hover:border-brand-blue/25 hover:shadow-[0_20px_36px_-22px_rgb(15_76_158/0.6)] motion-reduce:hover:translate-y-0",
        "has-[a:focus-visible]:border-brand-blue/50 has-[a:focus-visible]:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand-blue)_22%,transparent)]",
        saved && cn(motion.saved, "border-brand-blue/45"),
      )}
    >
      {/* Banner (3:1 slot); the image eases in a little on hover. */}
      <div className={cn("relative h-35 overflow-hidden", !election.photoUrl && styles.banner)}>
        {election.photoUrl ? (
          <span
            aria-hidden
            className="absolute inset-0 bg-cover bg-center transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.045] motion-reduce:transition-none"
            style={{ backgroundImage: `url("${election.photoUrl}")` }}
          />
        ) : (
          // Soft light that drifts across empty banners on hover.
          <span
            aria-hidden
            className="absolute -inset-y-10 -left-1/2 w-1/2 -skew-x-12 bg-linear-to-r from-transparent via-white/10 to-transparent opacity-0 transition-[translate,opacity] duration-1000 ease-out group-hover:translate-x-[300%] group-hover:opacity-100 motion-reduce:hidden"
          />
        )}
        <span
          className={cn(
            "absolute top-3.5 left-3.5 inline-flex h-5 items-center gap-1.5 rounded-full px-3 font-mono text-[0.625rem] font-semibold tracking-[0.1em] uppercase",
            styles.pill,
          )}
        >
          {ongoing ? (
            <span aria-hidden className="relative flex size-1.5">
              <span className={cn("absolute inset-0 rounded-full bg-current", motion.liveDot)} />
              <span className="relative size-1.5 rounded-full bg-current" />
            </span>
          ) : null}
          {election.status}
        </span>
        {saved ? (
          <span className={cn("absolute top-3.5 right-12 inline-flex h-5 items-center rounded-full bg-white px-2.5 font-mono text-[0.625rem] font-semibold tracking-[0.08em] text-brand-blue uppercase shadow-sm", motion.savedTag)}>
            Saved
          </span>
        ) : null}
        {!election.photoUrl ? (
          <span className="absolute right-3 bottom-2.5 font-mono text-[0.625rem] tracking-[0.08em] text-white/55 uppercase">
            Banner <span aria-hidden>·</span> 3:1
          </span>
        ) : null}
        <CardMenu election={election} onDelete={onDelete} />
      </div>

      <div className={cn("flex-1 px-4.5 pt-3.5 pb-4", cancelled && "opacity-55")}>
        <h3 className="truncate text-base leading-5.5 font-semibold text-brand-navy dark:text-foreground">
          {editable ? (
            // Stretched over the whole card (see `after:`), below the "⋯" menu.
            <Link href={electionEditHref(election.id)} className="outline-none after:absolute after:inset-0 after:content-['']">
              {election.title}
            </Link>
          ) : (
            election.title
          )}
        </h3>
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
          <p className="mt-2 truncate font-mono text-[0.65625rem] text-muted-foreground">
            <FooterNote election={election} voters={voters} now={now} />
          </p>
        </div>
        <ChevronRight
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-[translate,color] duration-300 ease-out",
            editable ? "group-hover:translate-x-1 group-hover:text-brand-blue dark:group-hover:text-[#7aa7e6]" : "opacity-40",
          )}
          strokeWidth={1.75}
        />
      </div>
    </article>
  );
}
