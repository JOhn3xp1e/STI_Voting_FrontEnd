"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";

import { AnimatedNumber } from "@/components/students/animated-number";
import { plural } from "@/lib/election-manage";
import { formatDayTime, instantToLocal } from "@/lib/elections";
import { formatStudentName, getStudentInitials } from "@/lib/students";
import { cn } from "@/lib/utils";
import { fetchTallyTimeline, type ElectionTally, type TallyFrame, type TallyTimeline } from "@/services/elections/live.service";
import type { Candidate, Position } from "@/types/ballot.types";
import type { Partylist } from "@/types/partylist.types";
import type { Student } from "@/types/student.types";

/*
 * "Bars that overtake each other": one position's candidates, ranked by votes, replayed
 * from the opening of voting to now.
 *
 * The frames come from the server (GET …/tally/timeline), counted from every ballot's time,
 * so the replay is the same in every browser and covers time when no one had the page open.
 * The server only cuts a new frame once a few more ballots are in (`minBallotsPerStep`):
 * admins also see when each voter voted, so a frame that adds one ballot would give that vote away.
 */

/** Time between frames while playing. */
const STEP_MS = 1100;
/** Row height (bar + gap), px. */
const ROW_PX = 44;

/** Colors for candidates without a party color (from the reference design). */
const PALETTE = ["#285f73", "#1aa596", "#f45f22", "#fdbf1c", "#ffa41a", "#7c3aed", "#db2777", "#0891b2"];

export interface RaceFrames {
  /** Oldest first; null until the first answer. */
  frames: TallyFrame[] | null;
  /** The server's replay. False: an older API without the timeline, so only zero → the totals now. */
  replay: boolean;
  minBallotsPerStep: number;
}

/** The race's frames, fetched once the tally is in and again whenever its ballot count changes. */
export function useTallyTimeline(electionId: string, startsAt: string, tally: ElectionTally | null, tallyAt: number | null): RaceFrames {
  const ballots = tally?.ballots ?? null;
  const [timeline, setTimeline] = useState<TallyTimeline | "unavailable" | null>(null);

  useEffect(() => {
    if (ballots === null) return;
    const controller = new AbortController();
    fetchTallyTimeline(electionId, { signal: controller.signal })
      .then(setTimeline)
      .catch(() => {
        // Keep the last replay if there is one; otherwise fall back to the totals.
        if (!controller.signal.aborted) setTimeline((t) => (t && t !== "unavailable" ? t : "unavailable"));
      });
    return () => controller.abort();
  }, [electionId, ballots]);

  const fallback = useMemo(() => {
    if (timeline !== "unavailable" || !tally) return null;
    const start: TallyFrame = { at: Date.parse(startsAt) || 0, ballots: 0, votes: {} };
    if (!tally.ballots) return [start];
    const votes: Record<string, number> = {};
    for (const p of tally.positions) for (const c of p.candidates) votes[c.candidateId] = c.votes;
    return [start, { at: tallyAt ?? start.at, ballots: tally.ballots, votes }];
  }, [timeline, tally, tallyAt, startsAt]);

  if (timeline && timeline !== "unavailable" && timeline.frames.length > 0) {
    return { frames: timeline.frames, replay: true, minBallotsPerStep: timeline.minBallotsPerStep };
  }
  return { frames: fallback, replay: false, minBallotsPerStep: 0 };
}

/* -------------------------------------------------------------------------- */
/*                                    Race                                    */
/* -------------------------------------------------------------------------- */

interface VotesRaceProps {
  frames: TallyFrame[];
  /** False: only zero → the totals now (see `RaceFrames`). */
  replay: boolean;
  minBallotsPerStep: number;
  positions: Position[];
  candidates: Candidate[];
  students: Map<string, Student> | null;
  parties: Partylist[];
}

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function VotesRace({ frames, replay, minBallotsPerStep, positions, candidates, students, parties }: VotesRaceProps) {
  const contested = positions.filter((p) => candidates.some((c) => c.positionId === p.id));
  const [positionId, setPositionId] = useState<string | null>(null);
  const position = contested.find((p) => p.id === positionId) ?? contested[0] ?? null;

  // Plays from the start once on open (unless motion is reduced), then follows new frames live.
  const [index, setIndex] = useState(() => (frames.length > 1 && !prefersReducedMotion() ? 0 : frames.length - 1));
  const [playing, setPlaying] = useState(() => frames.length > 1 && !prefersReducedMotion());
  const [frameCount, setFrameCount] = useState(frames.length);
  if (frames.length !== frameCount) {
    const wasAtEnd = index >= frameCount - 1;
    setFrameCount(frames.length);
    if (wasAtEnd || index > frames.length - 1) setIndex(frames.length - 1);
  }

  const last = frames.length - 1;
  const at = Math.min(index, last);

  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {
      if (at >= last) setPlaying(false);
      else setIndex(at + 1);
    }, at >= last ? 0 : STEP_MS);
    return () => clearTimeout(timer);
  }, [playing, at, last]);

  const partyColors = new Map(parties.map((p) => [p.id, p.color]));
  const field = position ? candidates.filter((c) => c.positionId === position.id) : [];

  const frame = frames[at];
  const ranked = field
    .map((candidate, order) => ({ candidate, order, votes: frame?.votes[candidate.id] ?? 0 }))
    .sort((a, b) => b.votes - a.votes || a.order - b.order);
  const rankOf = new Map(ranked.map((r, i) => [r.candidate.id, i]));
  const max = Math.max(1, ...ranked.map((r) => r.votes));
  const ballots = frame?.ballots ?? 0;

  function togglePlay() {
    if (playing) return setPlaying(false);
    if (at >= last) setIndex(0);
    setPlaying(true);
  }

  if (!position) {
    return <p className="px-5 py-8 text-center text-[0.8125rem] text-muted-foreground">No candidates on the ballot yet.</p>;
  }

  return (
    <div className="px-5 pt-4.5 pb-4">
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 truncate text-[0.875rem] text-foreground">{position.title}</p>
        <p className="shrink-0 font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
          {frame ? formatDayTime(instantToLocal(new Date(frame.at).toISOString())) : "—"}
        </p>
      </div>

      {contested.length > 1 ? (
        <div role="tablist" aria-label="Position" className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
          {contested.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={p.id === position.id}
              onClick={() => setPositionId(p.id)}
              className={cn(
                "h-7 shrink-0 cursor-pointer rounded-full border px-3 text-[0.71875rem] whitespace-nowrap outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-brand-blue/30",
                p.id === position.id
                  ? "border-foreground bg-foreground text-background"
                  : "border-[#e2e8f0] text-muted-foreground hover:border-[#cbd2db] hover:text-foreground dark:border-border",
              )}
            >
              {p.title}
            </button>
          ))}
        </div>
      ) : null}

      <ol aria-label={`${position.title} standings`} className="relative mt-4" style={{ height: ranked.length * ROW_PX }}>
        {field.map((candidate, order) => {
          const rank = rankOf.get(candidate.id) ?? order;
          const votes = frame?.votes[candidate.id] ?? 0;
          const student = students?.get(candidate.studentId);
          const name = student ? formatStudentName(student) : candidate.studentId;
          const color = (candidate.partylistId && partyColors.get(candidate.partylistId)) || PALETTE[order % PALETTE.length];
          return (
            <li
              key={candidate.id}
              className="absolute inset-x-0 top-0 flex h-8 items-center gap-2.5 transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
              style={{ transform: `translateY(${rank * ROW_PX}px)` }}
            >
              <span className="w-4 shrink-0 text-right font-mono text-[0.6875rem] text-muted-foreground tabular-nums">{rank + 1}</span>
              {candidate.portraitUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote portrait from the API
                <img src={candidate.portraitUrl} alt="" className="size-5 shrink-0 rounded-full bg-muted object-cover" />
              ) : (
                <span aria-hidden className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#f4f6fa] text-[0.5rem] font-semibold text-brand-blue dark:bg-white/8 dark:text-[#7aa7e6]">
                  {student ? getStudentInitials(student) : "?"}
                </span>
              )}
              <span className="w-28 shrink-0 truncate text-[0.84375rem] text-foreground sm:w-36" title={name}>
                {name}
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span
                  className="h-7 min-w-1 rounded-md transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                  style={{ width: `calc((100% - 5.5rem) * ${votes / max})`, backgroundColor: color }}
                />
                <span className="shrink-0 font-mono text-[0.71875rem] text-foreground tabular-nums">
                  <AnimatedNumber value={votes} duration={650} />
                  <span className="text-muted-foreground"> · {ballots ? Math.round((votes / ballots) * 100) : 0}%</span>
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-4 flex items-center gap-3 border-t border-[#e2e8f0] pt-3.5 dark:border-border">
        <ControlButton label="Previous step" disabled={at === 0} onClick={() => (setPlaying(false), setIndex(Math.max(0, at - 1)))}>
          <SkipBack aria-hidden className="size-3.5" strokeWidth={1.75} />
        </ControlButton>
        <button
          type="button"
          aria-label={playing ? "Pause" : at >= last ? "Replay" : "Play"}
          disabled={last === 0}
          onClick={togglePlay}
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-brand-navy text-white outline-none transition-[background-color,scale] duration-200 hover:bg-brand-navy/85 focus-visible:ring-3 focus-visible:ring-brand-blue/30 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-brand-navy"
        >
          {playing ? <Pause aria-hidden className="size-3.5" fill="currentColor" strokeWidth={0} /> : <Play aria-hidden className="ml-0.5 size-3.5" fill="currentColor" strokeWidth={0} />}
        </button>
        <ControlButton label="Next step" disabled={at >= last} onClick={() => (setPlaying(false), setIndex(Math.min(last, at + 1)))}>
          <SkipForward aria-hidden className="size-3.5" strokeWidth={1.75} />
        </ControlButton>
        <input
          type="range"
          aria-label="Replay position"
          min={0}
          max={last}
          value={at}
          disabled={last === 0}
          onChange={(event) => {
            setPlaying(false);
            setIndex(Number(event.target.value));
          }}
          className="mx-2 h-1 min-w-0 flex-1 cursor-pointer accent-[#1f5568] disabled:cursor-not-allowed dark:accent-[#7aa7e6]"
        />
        <span className="shrink-0 font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
          {at + 1} / {frames.length}
        </span>
      </div>
      <p className="mt-2 text-[0.65625rem] text-muted-foreground">
        {!replay
          ? "Only the totals so far: this server can't replay the votes over time yet."
          : last === 0
            ? "No ballots yet. The replay fills in as votes come in."
            : `Replays ${plural(frames[last].ballots, "ballot")} since voting opened.${minBallotsPerStep > 1 ? ` Each step adds at least ${minBallotsPerStep}, so no single vote can be picked out.` : ""}`}
      </p>
    </div>
  );
}

function ControlButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[#e2e8f0] text-foreground outline-none transition-colors duration-200 hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand-blue/30 disabled:cursor-not-allowed disabled:text-muted-foreground/50 disabled:hover:bg-transparent dark:border-border"
    >
      {children}
    </button>
  );
}
