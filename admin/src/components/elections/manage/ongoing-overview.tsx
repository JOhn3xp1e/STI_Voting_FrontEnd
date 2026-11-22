"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, LoaderCircle } from "lucide-react";

import { CareerBadge, careerStyle, outlineButtonClassName } from "@/components/elections/create/create-election-ui";
import wizard from "@/components/elections/create/wizard.module.css";
import { StatusAction } from "@/components/elections/status-action";
import motion from "@/components/shared/motion.module.css";
import { cardClassName } from "@/components/shared/section-card";
import { env } from "@/config/env";
import { electionPageHref } from "@/config/navigation";
import {
  enrollmentsByStudent,
  percent,
  standingsOf,
  timeLeft,
  turnoutBreakdown,
  turnoutNow,
  type CareerTurnout,
  type PartyStanding,
  type PositionStanding,
  type Standings,
  type TurnoutNow,
} from "@/lib/election-live";
import { count, plural } from "@/lib/election-manage";
import { formatDayTime, instantToLocal, levelLabel } from "@/lib/elections";
import { careerColor } from "@/lib/programs";
import { formatStudentName, getStudentInitials } from "@/lib/students";
import { cn } from "@/lib/utils";
import { isApiError } from "@/services/api/client";
import { getApiErrorMessage } from "@/services/api/error-message";
import { fetchElectionTally, type ElectionTally } from "@/services/elections/live.service";
import { fetchStudents } from "@/services/students/students.service";
import { fetchVoterRows, queueVoterEmails, type VoterRow } from "@/services/voters/voters.service";
import type { Candidate, Position } from "@/types/ballot.types";
import type { Election, ElectionStatus, VoterEnrollment } from "@/types/election.types";
import type { Partylist } from "@/types/partylist.types";
import type { Career } from "@/types/program.types";
import type { Student } from "@/types/student.types";

import { TurnoutTimeline } from "./turnout-timeline";
import { TurnoutDonuts, TurnoutViewSwitch, type TurnoutView } from "./turnout-charts";
import { VotesRace, useTallyTimeline, type RaceFrames } from "./votes-race";

/** How often the live numbers refresh while the tab is visible. */
const REFRESH_MS = 30_000;

/** `/elections/[id]/qr`: the full-screen QR viewer. */
export const electionQrHref = (electionId: string) => `/elections/${encodeURIComponent(electionId)}/qr`;

/* -------------------------------------------------------------------------- */
/*                                  Live data                                 */
/* -------------------------------------------------------------------------- */

interface LiveData {
  voters: VoterRow[] | null;
  tally: ElectionTally | null;
  /** When `tally` was fetched (ms). */
  tallyAt: number | null;
  /** The server has no tally endpoint yet (404). */
  tallyMissing: boolean;
  students: Map<string, Student> | null;
  /** Last refresh that failed (the previous numbers stay on screen). */
  error: string | null;
}

/** Voters and the tally, refreshed every 30 s while the tab is visible; students once. */
function useLiveData(electionId: string): LiveData {
  const [data, setData] = useState<LiveData>({ voters: null, tally: null, tallyAt: null, tallyMissing: false, students: null, error: null });

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    fetchStudents({ signal })
      .then((list) => setData((d) => ({ ...d, students: new Map(list.map((s) => [s.studentNo, s])) })))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let controller: AbortController | null = null;
    async function refresh() {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      const { signal } = current;
      const [voters, tally] = await Promise.allSettled([fetchVoterRows(electionId, { signal }), fetchElectionTally(electionId, { signal })]);
      if (signal.aborted) return;
      setData((d) => ({
        ...d,
        voters: voters.status === "fulfilled" ? voters.value : d.voters,
        tally: tally.status === "fulfilled" ? tally.value : d.tally,
        tallyAt: tally.status === "fulfilled" ? Date.now() : d.tallyAt,
        tallyMissing: tally.status === "rejected" && isApiError(tally.reason) && tally.reason.isNotFound,
        error: voters.status === "rejected" ? getApiErrorMessage(voters.reason) : null,
      }));
    }
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      controller?.abort();
    };
  }, [electionId]);

  return data;
}

/* -------------------------------------------------------------------------- */
/*                                  Overview                                  */
/* -------------------------------------------------------------------------- */

interface OngoingOverviewProps {
  election: Election;
  careers: Career[];
  positions: Position[];
  candidates: Candidate[];
  parties: Partylist[];
  enrollments: VoterEnrollment[] | null;
  now: number;
  onMove: (status: ElectionStatus, message: string) => Promise<void>;
  say: (text: string, tone?: "success" | "error") => void;
}

const rise = (index: number) => ({ animationDelay: `${index * 80}ms` });

function SectionLabel({ children, meta }: { children: ReactNode; meta?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="font-mono text-[0.6875rem] font-semibold tracking-[0.16em] text-foreground uppercase">{children}</h2>
      {meta ? <p className="text-[0.65625rem] text-muted-foreground">{meta}</p> : null}
    </div>
  );
}

/** Manage → Overview while voting is open: live bar, turnout, breakdown, leading candidates, parties and who's left. */
export function OngoingOverview({ election, careers, positions, candidates, parties, enrollments, now, onMove, say }: OngoingOverviewProps) {
  const live = useLiveData(election.id);
  const { voters, tally } = live;

  // Recomputed when the data refreshes, not on every clock tick (the hour windows move by at most 30 s).
  const minute = Math.floor(now / 60_000);
  const turnout = useMemo(() => (voters ? turnoutNow(voters, election.startsAt, minute * 60_000) : null), [voters, election.startsAt, minute]);
  const breakdown = useMemo(() => {
    if (!voters || !enrollments) return null;
    return turnoutBreakdown(voters, enrollmentsByStudent(enrollments, election.termId), careers);
  }, [voters, enrollments, election.termId, careers]);
  const [view, setView] = useState<TurnoutView>("bar");
  const standings = useMemo(() => (tally ? standingsOf(tally, positions, candidates, parties) : null), [tally, positions, candidates, parties]);
  const colors = useMemo(() => new Map(careers.map((c) => [c.code, careerColor(c, careers)])), [careers]);
  const race = useTallyTimeline(election.id, election.startsAt, tally, live.tallyAt);

  return (
    <>
      <section className={motion.riseIn} style={rise(1)}>
        <LiveBar election={election} now={now} onMove={onMove} />
        {live.error ? (
          <p role="status" className="mt-2 text-[0.75rem] text-muted-foreground">
            Couldn&apos;t refresh the numbers ({live.error}). Trying again in a moment.
          </p>
        ) : null}
      </section>

      <section className={motion.riseIn} style={rise(2)}>
        <SectionLabel meta="every participating voter · by career, program or level">Votes over time</SectionLabel>
        <TurnoutTimeline election={election} voters={voters} enrollments={enrollments} careers={careers} colors={colors} now={now} />
      </section>

      <section className={motion.riseIn} style={rise(2)}>
        <SectionLabel>Turnout</SectionLabel>
        <StatRow turnout={turnout} standings={standings} positions={positions.length} tallyMissing={live.tallyMissing} />
      </section>

      <section className={motion.riseIn} style={rise(3)}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-mono text-[0.6875rem] font-semibold tracking-[0.16em] text-foreground uppercase">Turnout breakdown</h2>
          <TurnoutViewSwitch value={view} onChange={setView} />
        </div>
        <Breakdown breakdown={breakdown} view={view} colors={colors} loading={!voters} scope={election.careerScope} />
      </section>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_21.25rem]">
        <section className={motion.riseIn} style={rise(4)}>
          <SectionLabel meta="unofficial · updates live">Leading candidates</SectionLabel>
          <LeadingCandidates
            election={election}
            standings={standings}
            tallyMissing={live.tallyMissing}
            race={race}
            positions={positions}
            candidates={candidates}
            students={live.students}
            parties={parties}
            careers={careers}
            colors={colors}
          />
        </section>
        <div className="space-y-6">
          <section className={motion.riseIn} style={rise(5)}>
            <SectionLabel>Party lists</SectionLabel>
            <PartyCard standings={standings} tallyMissing={live.tallyMissing} positions={positions.length} />
          </section>
          <section className={motion.riseIn} style={rise(6)}>
            <SectionLabel>Still to vote</SectionLabel>
            <StillToVote election={election} turnout={turnout} voters={voters} say={say} />
          </section>
        </div>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Live bar                                  */
/* -------------------------------------------------------------------------- */

function LiveBar({ election, now, onMove }: { election: Election; now: number; onMove: OngoingOverviewProps["onMove"] }) {
  const qrHref = electionQrHref(election.id);
  const liveHref = env.livePageUrl ? env.livePageUrl.replaceAll("{id}", encodeURIComponent(election.id)) : null;
  const closes = formatDayTime(instantToLocal(election.endsAt));
  return (
    <div className={cn(cardClassName, "flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-3.5")}>
      <span aria-hidden className="relative flex size-2.5 shrink-0">
        <span className="absolute inset-0 animate-ping rounded-full bg-[#22c55e] opacity-60 motion-reduce:animate-none" />
        <span className="relative size-2.5 rounded-full bg-[#22c55e]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.875rem] font-semibold text-foreground">Voting is live</p>
        <p className="text-[0.71875rem] text-muted-foreground">
          Opened {formatDayTime(instantToLocal(election.startsAt))} · closes {closes} · {timeLeft(election.endsAt, now)}
        </p>
        <Link href={qrHref} target="_blank" className="text-[0.6875rem] font-medium text-brand-blue hover:underline dark:text-[#7aa7e6]">
          QR viewer · {qrHref}
        </Link>
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <StatusAction
          className="w-48"
          label="Close voting now"
          variant="danger"
          confirmTitle="Close voting now?"
          confirmBody={<>Voting ends right away instead of on {closes}. Nobody else can vote, and this can&apos;t be undone.</>}
          confirmLabel="Close voting"
          onConfirm={() => onMove("Completed", "Voting is closed.")}
        />
        <a href={qrHref} target="_blank" rel="noopener" className={cn(outlineButtonClassName, "gap-1.5 text-[0.8125rem] font-semibold")}>
          QR viewer
          <ArrowUpRight aria-hidden className="size-3.5" />
        </a>
        {liveHref ? (
          <a
            href={liveHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8.5 items-center gap-1.5 rounded-[0.25rem] bg-brand-navy px-4 text-[0.8125rem] font-semibold text-white outline-none hover:bg-brand-navy/85 focus-visible:ring-3 focus-visible:ring-brand-blue/30 dark:bg-white dark:text-brand-navy dark:hover:bg-white/85"
          >
            Open live page
            <ArrowUpRight aria-hidden className="size-3.5" />
          </a>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Stat row                                  */
/* -------------------------------------------------------------------------- */

function Sparkline({ values, tone }: { values: number[]; tone: "blue" | "gold" }) {
  if (values.length < 2) return null;
  const width = 76;
  const height = 26;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`).join(" ");
  return (
    <svg
      aria-hidden
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("absolute right-6 bottom-5.5 hidden overflow-visible sm:block", tone === "blue" ? "text-brand-blue dark:text-[#7aa7e6]" : "text-brand-gold")}
    >
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatCard({ label, value, detail, accent = true, spark }: { label: string; value: ReactNode; detail: ReactNode; accent?: boolean; spark?: ReactNode }) {
  return (
    <div className="relative flex min-w-0 flex-col gap-1 px-6 py-4.5">
      <p className="text-[0.75rem] text-muted-foreground">{label}</p>
      <p className="truncate pr-20 text-[1.625rem] leading-8 font-medium tracking-[-0.02em] text-foreground tabular-nums">{value}</p>
      <p className={cn("text-[0.65625rem]", accent ? "text-brand-blue dark:text-[#7aa7e6]" : "text-foreground")}>{detail}</p>
      {spark}
    </div>
  );
}

function StatRow({ turnout, standings, positions, tallyMissing }: { turnout: TurnoutNow | null; standings: Standings | null; positions: number; tallyMissing: boolean }) {
  const t = turnout;
  const diff = t ? t.lastHour - t.hourBefore : 0;
  const leading = standings?.leadingParty ?? null;
  return (
    <div className="grid grid-cols-1 divide-y divide-[#e2e8f0] sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x dark:divide-border">
      <StatCard
        label="Votes cast"
        value={t ? `${count(t.voted)} / ${count(t.total)}` : "—"}
        detail={t ? `${t.total ? percent(t.voted / t.total) : "0.0%"} turnout` : "Loading…"}
        spark={t ? <Sparkline values={t.cumulative} tone="blue" /> : null}
      />
      <StatCard
        label="Haven’t voted"
        value={t ? `${count(t.total - t.voted)} / ${count(t.total)}` : "—"}
        detail={t ? `${count(t.notStarted)} not started · ${count(t.draft)} draft` : "Loading…"}
        accent={false}
        spark={t ? <Sparkline values={t.cumulative.map((n) => t.total - n)} tone="gold" /> : null}
      />
      <StatCard
        label="Last hour"
        value={t ? plural(t.lastHour, "vote") : "—"}
        detail={t ? (diff === 0 ? "same as the hour before" : `${diff > 0 ? "+" : "−"}${count(Math.abs(diff))} vs. the hour before`) : "Loading…"}
        spark={t ? <Sparkline values={t.hourly} tone="blue" /> : null}
      />
      <StatCard
        label="Leading party"
        value={leading ? leading.name : "—"}
        detail={
          tallyMissing ? "Tally not available yet" : leading ? `${leading.leading} of ${positions} positions` : standings ? "No party leads yet" : "Loading…"
        }
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Breakdown                                 */
/* -------------------------------------------------------------------------- */

function Bar({ label, voted, total, delay }: { label: string; voted: number; total: number; delay: number }) {
  const share = total ? voted / total : 0;
  return (
    <div className="space-y-1.25">
      <div className="flex items-baseline gap-1.5">
        <p className="min-w-0 flex-1 truncate text-[0.78125rem] font-medium text-foreground">{label}</p>
        <p className="text-[0.6875rem] text-muted-foreground tabular-nums">
          {count(voted)} / {count(total)}
        </p>
        <p className="w-12 text-right text-[0.75rem] font-semibold text-foreground tabular-nums">{percent(share)}</p>
      </div>
      <div className="h-1.5 overflow-hidden rounded-[3px] bg-[#f4f6fa] dark:bg-white/10">
        <div className={cn("h-full rounded-[3px] bg-(--career)", wizard.barGrow)} style={{ width: `${share * 100}%`, animationDelay: `${delay}ms` }} />
      </div>
    </div>
  );
}

function CareerCard({ group, color }: { group: CareerTurnout; color: string }) {
  const { career, voted, total, programs, levels } = group;
  const share = total ? voted / total : 0;
  return (
    <div style={careerStyle(color)} className={cn(cardClassName, "overflow-hidden")}>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-[#e2e8f0] px-4.5 py-3 dark:border-border">
        <CareerBadge code={career.code} />
        <p className="text-[0.875rem] font-semibold text-foreground">{career.name}</p>
        <span className="flex-1" />
        <p className="text-[0.75rem] text-muted-foreground tabular-nums">
          {count(voted)} / {count(total)} voted
        </p>
        <p className="text-[0.875rem] font-semibold text-foreground tabular-nums">{percent(share)}</p>
        <div className="h-1.5 w-40 overflow-hidden rounded-[3px] bg-[#f4f6fa] dark:bg-white/10">
          <div className={cn("h-full rounded-[3px] bg-(--career)", wizard.barGrow)} style={{ width: `${share * 100}%` }} />
        </div>
      </div>
      <div className={cn("grid grid-cols-1 gap-x-8 gap-y-5 px-4.5 py-4", programs.length ? "md:grid-cols-2" : null)}>
        {programs.length ? (
          <div className="space-y-3">
            <p className="text-[0.65625rem] font-medium tracking-[0.04em] text-muted-foreground uppercase">By program</p>
            {programs.map((p, i) => (
              <Bar key={p.key} label={p.label} voted={p.voted} total={p.total} delay={200 + i * 60} />
            ))}
          </div>
        ) : null}
        <div className="space-y-3">
          <p className="text-[0.65625rem] font-medium tracking-[0.04em] text-muted-foreground uppercase">By {levels[0] && !levelLabel(levels[0].level, career).endsWith("year") ? "grade level" : "year level"}</p>
          {levels.map((l, i) => (
            <Bar key={l.level} label={levelLabel(l.level, career)} voted={l.voted} total={l.total} delay={200 + i * 60} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Breakdown({
  breakdown,
  view,
  colors,
  loading,
  scope,
}: {
  breakdown: ReturnType<typeof turnoutBreakdown> | null;
  view: TurnoutView;
  colors: ReadonlyMap<string, string>;
  loading: boolean;
  /** The election's career scope (empty = every career). */
  scope: readonly string[];
}) {
  if (!breakdown) {
    return (
      <div className={cn(cardClassName, "flex items-center gap-2 px-5 py-6 text-[0.8125rem] text-muted-foreground")}>
        {loading ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}
        {loading ? "Counting turnout…" : "Couldn't load the students' enrollments, so turnout can't be grouped."}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {view === "donut" ? (
        <TurnoutDonuts careers={breakdown.careers} colors={colors} />
      ) : (
        breakdown.careers.map((group) => <CareerCard key={group.career.code} group={group} color={colors.get(group.career.code) ?? "#0f4c9e"} />)
      )}
      {breakdown.outOfScope.map((career) => (
        <div key={career.code} style={careerStyle(colors.get(career.code) ?? "#0f4c9e")} className={cn(cardClassName, "flex items-center gap-2.5 px-4.5 py-3 opacity-60")}>
          <CareerBadge code={career.code} />
          <p className="text-[0.875rem] font-semibold text-foreground">{career.name}</p>
          <span className="flex-1" />
          <p className="text-[0.75rem] text-muted-foreground">
            {scope.length === 0 || scope.includes(career.code) ? "No voters from this career" : "Not in this election’s scope"}
          </p>
        </div>
      ))}
      {breakdown.unknown ? (
        <p className="text-[0.75rem] text-muted-foreground">{plural(breakdown.unknown, "voter has", "voters have")} no enrollment record, so they aren&apos;t grouped here.</p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Leading candidates                            */
/* -------------------------------------------------------------------------- */

function TallyMissing({ children }: { children: ReactNode }) {
  return <p className="px-5 py-8 text-center text-[0.8125rem] leading-5 text-muted-foreground">{children}</p>;
}

interface LeadingProps {
  election: Election;
  standings: Standings | null;
  tallyMissing: boolean;
  race: RaceFrames;
  positions: Position[];
  candidates: Candidate[];
  students: Map<string, Student> | null;
  parties: Partylist[];
  careers: Career[];
  colors: ReadonlyMap<string, string>;
}

function LeadingCandidates({ election, standings, tallyMissing, race, positions, candidates, students, parties, careers, colors }: LeadingProps) {
  if (!standings) {
    return (
      <div className={cardClassName}>
        <TallyMissing>
          {tallyMissing ? "Vote counts aren't available yet: the server doesn't tally ballots for admins yet. Leading candidates show here once it does." : "Counting votes…"}
        </TallyMissing>
      </div>
    );
  }
  const rows = standings.positions;
  return (
    <div className={cn(cardClassName, "overflow-hidden")}>
      {race.frames ? (
        <VotesRace
          frames={race.frames}
          replay={race.replay}
          minBallotsPerStep={race.minBallotsPerStep}
          positions={positions}
          candidates={candidates}
          students={students}
          parties={parties}
        />
      ) : (
        <TallyMissing>Loading the replay…</TallyMissing>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left">
          <thead>
            <tr className="border-y border-[#e2e8f0] text-[0.65625rem] font-medium tracking-[0.04em] text-muted-foreground uppercase dark:border-border">
              <th className="w-[8.75rem] px-4 py-2.5 font-medium">Position</th>
              <th className="px-2 py-2.5 font-medium">Leading</th>
              <th className="w-[13.5rem] px-2 py-2.5 font-medium">Votes</th>
              <th className="w-[6.5rem] px-4 py-2.5 font-medium">Lead</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e2e8f0] dark:divide-border">
            {rows.map((row) => (
              <LeaderRow key={row.position.id} row={row} students={students} parties={parties} careers={careers} colors={colors} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e2e8f0] px-4 py-2.5 dark:border-border">
        <p className="text-[0.6875rem] text-muted-foreground">Leads are unofficial until results are tallied and published.</p>
        <Link href={electionPageHref(election.id, "ballot")} className="group inline-flex items-center gap-1 text-[0.6875rem] font-medium text-brand-blue hover:underline dark:text-[#7aa7e6]">
          See all candidates
          <ArrowRight aria-hidden className="size-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}

function LeaderRow({ row, students, parties, careers, colors }: { row: PositionStanding; students: Map<string, Student> | null; parties: Partylist[]; careers: Career[]; colors: ReadonlyMap<string, string> }) {
  const leader = row.leader;
  const student = leader ? students?.get(leader.candidate.studentId) : undefined;
  const career = student?.careerCode ? careers.find((c) => c.code === student.careerCode) : undefined;
  const party = leader?.candidate.partylistId ? parties.find((p) => p.id === leader.candidate.partylistId) : null;
  const detail = leader
    ? [party?.name ?? "Independent", student?.program, student?.year != null ? levelLabel(student.year, career).replace(/ year$/, "") : null].filter(Boolean).join(" · ")
    : "";

  return (
    <tr className="h-14">
      <td className="px-4 text-[0.8125rem] text-foreground">{row.position.title}</td>
      <td className="px-2">
        {leader ? (
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-7.5 shrink-0 items-center justify-center rounded-full bg-[#f4f6fa] text-[0.65625rem] font-semibold text-brand-blue dark:bg-white/8 dark:text-[#7aa7e6]">
              {student ? getStudentInitials(student) : "?"}
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5">
                <span className="truncate text-[0.8125rem] font-medium text-foreground">{student ? formatStudentName(student) : leader.candidate.studentId}</span>
                {student?.careerCode ? (
                  <span style={careerStyle(colors.get(student.careerCode) ?? "#0f4c9e")}>
                    <CareerBadge code={student.careerCode} className="h-4.5 px-1.5 text-[0.59375rem]" />
                  </span>
                ) : null}
              </p>
              <p className="truncate text-[0.6875rem] text-muted-foreground">{detail}</p>
            </div>
          </div>
        ) : (
          <span className="text-[0.8125rem] text-muted-foreground">No votes yet</span>
        )}
      </td>
      <td className="px-2">
        {leader ? (
          <div className="space-y-1.25">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[0.78125rem] text-foreground tabular-nums">{plural(leader.votes, "vote")}</span>
              <span className="text-[0.6875rem] text-muted-foreground tabular-nums">{percent(row.share)}</span>
            </div>
            <div className="h-1.25 overflow-hidden rounded-full bg-[#f4f6fa] dark:bg-white/10">
              <div className={cn("h-full rounded-full bg-brand-blue dark:bg-[#7aa7e6]", wizard.barGrow)} style={{ width: `${row.share * 100}%` }} />
            </div>
          </div>
        ) : null}
      </td>
      <td className="px-4">
        {!leader ? null : row.lead === null ? (
          <Lead value="—" note="unopposed" />
        ) : row.lead === 0 ? (
          <Lead value="Tied" note="with runner-up" warn />
        ) : (
          <Lead value={`+${count(row.lead)}`} note={row.close ? "close race" : "over runner-up"} warn={row.close} />
        )}
      </td>
    </tr>
  );
}

function Lead({ value, note, warn = false }: { value: string; note: string; warn?: boolean }) {
  return (
    <div>
      <p className={cn("text-[0.8125rem] font-semibold tabular-nums", warn ? "text-[#d99a00] dark:text-brand-gold" : "text-foreground")}>{value}</p>
      <p className="text-[0.65625rem] text-muted-foreground">{note}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 Party lists                                */
/* -------------------------------------------------------------------------- */

function PartyCard({ standings, tallyMissing, positions }: { standings: Standings | null; tallyMissing: boolean; positions: number }) {
  if (!standings) {
    return (
      <div className={cardClassName}>
        <TallyMissing>{tallyMissing ? "Party standings show here once the server tallies votes." : "Counting votes…"}</TallyMissing>
      </div>
    );
  }
  return (
    <ul className={cn(cardClassName, "divide-y divide-[#e2e8f0] overflow-hidden dark:divide-border")}>
      {standings.parties.map((party, i) => (
        <PartyRow key={party.key} party={party} positions={positions} delay={i * 70} />
      ))}
    </ul>
  );
}

function PartyRow({ party, positions, delay }: { party: PartyStanding; positions: number; delay: number }) {
  const muted = party.key === "independent" || party.key === "abstain";
  const color = muted ? undefined : (party.color ?? undefined);
  return (
    <li className="space-y-1.5 px-4 py-3">
      <div className="flex items-center gap-2">
        <span aria-hidden className={cn("size-2 shrink-0 rounded-[2px]", muted ? "bg-[#94a3b8]" : !color && "bg-brand-blue")} style={color ? { backgroundColor: color } : undefined} />
        <p className="min-w-0 flex-1 truncate text-[0.8125rem] font-medium text-foreground">{party.name}</p>
        {party.key === "abstain" ? null : <p className="text-[0.6875rem] text-muted-foreground">leading {party.leading} of {positions}</p>}
      </div>
      <div className="flex items-center gap-3">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-[#f4f6fa] dark:bg-white/10">
          <div
            className={cn("h-full rounded-full", wizard.barGrow, muted ? "bg-[#94a3b8]" : !color && "bg-brand-blue")}
            style={{ width: `${party.share * 100}%`, animationDelay: `${delay}ms`, ...(color ? { backgroundColor: color } : null) }}
          />
        </div>
        <p className="w-24 text-right text-[0.6875rem] text-muted-foreground tabular-nums">{percent(party.share)} of votes</p>
      </div>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Still to vote                               */
/* -------------------------------------------------------------------------- */

function StillToVote({ election, turnout, voters, say }: { election: Election; turnout: TurnoutNow | null; voters: VoterRow[] | null; say: OngoingOverviewProps["say"] }) {
  const [step, setStep] = useState<"idle" | "confirm" | "sending">("idle");
  const [error, setError] = useState<string | null>(null);
  const recipients = useMemo(() => (voters ?? []).filter((v) => v.isActive && v.voteStatus !== "completed" && v.email), [voters]);
  const left = turnout ? turnout.total - turnout.voted : null;

  async function send() {
    setStep("sending");
    setError(null);
    try {
      const result = await queueVoterEmails(
        election.id,
        recipients.map((v) => v.id),
        true,
      );
      setStep("idle");
      const skipped = result.skipped.length ? ` · ${count(result.skipped.length)} skipped` : "";
      say(`Reminder queued for ${plural(result.queued, "voter")}${skipped}${result.dryRun ? " (test mode: nothing is emailed)" : ""}`);
    } catch (cause) {
      setStep("confirm");
      setError(getApiErrorMessage(cause));
    }
  }

  return (
    <div className={cn(cardClassName, "p-4")}>
      <p className="flex items-baseline gap-2">
        <span className="text-[1.625rem] leading-8 font-medium tracking-[-0.02em] text-foreground tabular-nums">{left === null ? "—" : count(left)}</span>
        {turnout ? <span className="text-[0.75rem] text-muted-foreground">of {plural(turnout.total, "voter")}</span> : null}
      </p>
      <dl className="mt-2.5 space-y-1.5 text-[0.78125rem]">
        <Row label="Not started" value={turnout?.notStarted} />
        <Row label="Draft · ballot saved" value={turnout?.draft} />
        <Row label="Login email failed" value={turnout?.emailFailed} />
      </dl>
      {step === "idle" ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link href={`${electionPageHref(election.id, "settings")}#voters`} className={cn(outlineButtonClassName, "text-[0.8125rem] font-semibold")}>
            View voters
          </Link>
          <button type="button" disabled={!recipients.length} onClick={() => setStep("confirm")} className={cn(outlineButtonClassName, "text-[0.8125rem] font-semibold")}>
            Send reminder
          </button>
        </div>
      ) : (
        <div className="mt-4 rounded-[0.375rem] border border-[#e2e8f0] bg-[#f8fafc] p-3 dark:border-border dark:bg-white/3">
          <p className="text-[0.8125rem] leading-5 text-foreground">
            Email a new passcode to the {plural(recipients.length, "voter")} who haven&apos;t voted? Passcodes they already have stop working.
          </p>
          {error ? (
            <p role="alert" className="mt-2 text-[0.75rem] text-destructive">
              {error}
            </p>
          ) : null}
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" disabled={step === "sending"} onClick={() => setStep("idle")} className={cn(outlineButtonClassName, "h-8 px-3 text-[0.8125rem]")}>
              Cancel
            </button>
            <button
              type="button"
              disabled={step === "sending"}
              onClick={() => void send()}
              className="inline-flex h-8 items-center gap-1.5 rounded-[0.25rem] bg-brand-navy px-3 text-[0.8125rem] font-semibold text-white outline-none hover:bg-brand-navy/85 focus-visible:ring-3 focus-visible:ring-brand-blue/30 disabled:opacity-60 dark:bg-white dark:text-brand-navy"
            >
              {step === "sending" ? <LoaderCircle aria-hidden className="size-3.5 animate-spin" /> : null}
              Send reminder
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground tabular-nums">{value === undefined ? "—" : count(value)}</dd>
    </div>
  );
}
