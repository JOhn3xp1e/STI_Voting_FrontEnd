import type { Candidate, Position } from "@/types/ballot.types";
import type { VoterEnrollment } from "@/types/election.types";
import type { Partylist } from "@/types/partylist.types";
import type { Career } from "@/types/program.types";
import { levelLabel } from "@/lib/elections";
import type { ElectionTally } from "@/services/elections/live.service";
import type { VoterRow } from "@/services/voters/voters.service";

/*
 * Numbers for an ongoing election: turnout over time, turnout by career / program / year
 * level, and the unofficial standings from the tally.
 */

const HOUR = 60 * 60 * 1000;

/* -------------------------------------------------------------------------- */
/*                                   Turnout                                  */
/* -------------------------------------------------------------------------- */

export interface TurnoutNow {
  total: number;
  voted: number;
  notStarted: number;
  draft: number;
  /** Not voted yet, and their latest login email failed. */
  emailFailed: number;
  /** Votes in the last hour, and in the hour before it. */
  lastHour: number;
  hourBefore: number;
  /** Ballots cast so far, one point per hour since voting opened (at most 12), the last one now. */
  cumulative: number[];
  /** Votes in each of those hours. */
  hourly: number[];
}

const FAILED_EMAIL = new Set(["failed", "bounced", "complained"]);

export function turnoutNow(voters: readonly VoterRow[], opensAt: string, now: number): TurnoutNow {
  const voted = voters.filter((v) => v.voteStatus === "completed");
  const times = voted.map((v) => (v.votedAt ? new Date(v.votedAt).getTime() : NaN)).filter(Number.isFinite);
  const opened = new Date(opensAt).getTime();
  const hours = Math.min(12, Math.max(2, Math.ceil((now - opened) / HOUR)));
  const ends = Array.from({ length: hours }, (_, i) => now - (hours - 1 - i) * HOUR);
  const inWindow = (from: number, to: number) => times.filter((t) => t > from && t <= to).length;
  return {
    total: voters.length,
    voted: voted.length,
    notStarted: voters.filter((v) => v.voteStatus === "empty").length,
    draft: voters.filter((v) => v.voteStatus === "draft").length,
    emailFailed: voters.filter((v) => v.voteStatus !== "completed" && FAILED_EMAIL.has(v.emailStatus)).length,
    lastHour: inWindow(now - HOUR, now),
    hourBefore: inWindow(now - 2 * HOUR, now - HOUR),
    // Votes without a time still count towards the latest point.
    cumulative: ends.map((end, i) => (i === ends.length - 1 ? voted.length : times.filter((t) => t <= end).length)),
    hourly: ends.map((end) => inWindow(end - HOUR, end)),
  };
}

/* -------------------------------------------------------------------------- */
/*                                  Breakdown                                 */
/* -------------------------------------------------------------------------- */

export interface TurnoutGroup {
  key: string;
  label: string;
  voted: number;
  total: number;
}

export interface CareerTurnout {
  career: Career;
  voted: number;
  total: number;
  /** Highest turnout first; empty for careers without programs. */
  programs: TurnoutGroup[];
  /** Lowest level first. */
  levels: { level: number; voted: number; total: number }[];
}

export interface TurnoutBreakdown {
  careers: CareerTurnout[];
  /** Careers with no voters in this election. */
  outOfScope: Career[];
  /** Voters without an enrollment record. */
  unknown: number;
}

/** Each voter's enrollment in the election's term (else any enrollment they have). */
export function enrollmentsByStudent(enrollments: readonly VoterEnrollment[], termId: string): Map<string, VoterEnrollment> {
  const map = new Map<string, VoterEnrollment>();
  for (const e of enrollments) {
    // The election term's enrollment wins; another term's only fills a gap.
    if (e.termId === termId || !map.has(e.studentId)) map.set(e.studentId, e);
  }
  return map;
}

const rate = (g: { voted: number; total: number }) => (g.total ? g.voted / g.total : 0);

export function turnoutBreakdown(
  voters: readonly VoterRow[],
  enrollment: ReadonlyMap<string, VoterEnrollment>,
  careers: readonly Career[],
): TurnoutBreakdown {
  const groups = new Map<string, { voted: number; total: number; programs: Map<string, TurnoutGroup>; levels: Map<number, { level: number; voted: number; total: number }> }>();
  let unknown = 0;
  for (const voter of voters) {
    const e = enrollment.get(voter.studentId);
    if (!e) {
      unknown += 1;
      continue;
    }
    const voted = voter.voteStatus === "completed" ? 1 : 0;
    const g = groups.get(e.careerCode) ?? { voted: 0, total: 0, programs: new Map(), levels: new Map() };
    groups.set(e.careerCode, g);
    g.voted += voted;
    g.total += 1;
    if (e.programCode) {
      const p = g.programs.get(e.programCode) ?? { key: e.programCode, label: e.programCode, voted: 0, total: 0 };
      g.programs.set(e.programCode, p);
      p.voted += voted;
      p.total += 1;
    }
    const l = g.levels.get(e.level) ?? { level: e.level, voted: 0, total: 0 };
    g.levels.set(e.level, l);
    l.voted += voted;
    l.total += 1;
  }
  return {
    careers: careers
      .filter((c) => groups.has(c.code))
      .map((career) => {
        const g = groups.get(career.code)!;
        return {
          career,
          voted: g.voted,
          total: g.total,
          programs: [...g.programs.values()].sort((a, b) => rate(b) - rate(a) || b.total - a.total),
          levels: [...g.levels.values()].sort((a, b) => a.level - b.level),
        };
      }),
    outOfScope: careers.filter((c) => !groups.has(c.code)),
    unknown,
  };
}

/* -------------------------------------------------------------------------- */
/*                                  Timeline                                  */
/* -------------------------------------------------------------------------- */

export type TimelineGrouping = "all" | "career" | "program" | "level";

export interface TimelineSeries {
  /** Career code, program code, level number, `"all"` or `"other"`. */
  key: string;
  /** Short name for legends and line ends: "SHS", "BSIT", "Grade 11". */
  label: string;
  /** Longer name for the tooltip: "Senior High School". */
  name: string;
  /** Voters in this group. */
  total: number;
  /** The group's career (for its color), when it belongs to one. */
  careerCode: string | null;
  /** Ballots cast by this group so far, at each of `times`. */
  values: number[];
}

export interface Timeline {
  /** Evenly spaced instants (ms) from `from` to `to`, both included. */
  times: number[];
  /** In a fixed order (careers, then their programs or levels); at most `MAX_SERIES`. */
  series: TimelineSeries[];
  /** Voters left out of the groups: no enrollment record. */
  unknown: number;
}

/** Lines a timeline shows at most; smaller groups beyond that fold into "Other". */
export const MAX_SERIES = 8;
const MAX_POINTS = 145;

/**
 * Ballots cast over time, as one line for every voter or one per career, program or level.
 * Votes before `from` count from the first point; votes without a time count at the last one.
 */
export function turnoutTimeline(
  voters: readonly VoterRow[],
  enrollment: ReadonlyMap<string, VoterEnrollment> | null,
  careers: readonly Career[],
  grouping: TimelineGrouping,
  from: number,
  to: number,
): Timeline {
  const span = Math.max(60_000, to - from);
  const points = Math.max(2, Math.min(MAX_POINTS, Math.round(span / 60_000) + 1));
  const step = span / (points - 1);
  const times = Array.from({ length: points }, (_, i) => (i === points - 1 ? from + span : from + i * step));
  const bucketOf = (voter: VoterRow) => {
    const t = voter.votedAt ? Date.parse(voter.votedAt) : NaN;
    if (!Number.isFinite(t)) return points - 1;
    return Math.min(points - 1, Math.max(0, Math.ceil((t - from) / step)));
  };

  const careerByCode = new Map(careers.map((c, i) => [c.code, { career: c, order: i }]));
  const groups = new Map<string, Omit<TimelineSeries, "values"> & { order: [number, number | string]; counts: number[] }>();
  let unknown = 0;

  for (const voter of voters) {
    let key = "all";
    let label = "All voters";
    let name = "All voters";
    let careerCode: string | null = null;
    let order: [number, number | string] = [0, 0];
    if (grouping !== "all") {
      const e = enrollment?.get(voter.studentId);
      if (!e) {
        unknown += 1;
        continue;
      }
      const c = careerByCode.get(e.careerCode);
      const careerOrder = c?.order ?? careers.length;
      careerCode = e.careerCode;
      if (grouping === "career" || (grouping === "program" && !e.programCode)) {
        // Careers without programs (e.g. JHS) stand in as one "program".
        key = grouping === "career" ? e.careerCode : `career:${e.careerCode}`;
        label = e.careerCode;
        name = c?.career.name ?? e.careerCode;
        order = [careerOrder, ""];
      } else if (grouping === "program") {
        key = e.programCode!;
        label = e.programCode!;
        name = c ? `${e.programCode} · ${c.career.name}` : e.programCode!;
        order = [careerOrder, e.programCode!];
      } else {
        key = String(e.level);
        label = levelLabel(e.level, c?.career);
        name = c ? `${label} · ${c.career.name}` : label;
        order = [careerOrder, e.level];
      }
    }
    let g = groups.get(key);
    if (!g) {
      g = { key, label, name, total: 0, careerCode, order, counts: new Array<number>(points).fill(0) };
      groups.set(key, g);
    }
    g.total += 1;
    if (voter.voteStatus === "completed") g.counts[bucketOf(voter)] += 1;
  }

  const byOrder = (a: { order: [number, number | string] }, b: { order: [number, number | string] }) =>
    a.order[0] - b.order[0] || (typeof a.order[1] === "number" && typeof b.order[1] === "number" ? a.order[1] - b.order[1] : String(a.order[1]).localeCompare(String(b.order[1])));

  let list = [...groups.values()];
  if (list.length > MAX_SERIES) {
    // The biggest groups keep their own line (sizes don't change while voting, so neither does the cut).
    const kept = new Set([...list].sort((a, b) => b.total - a.total || byOrder(a, b)).slice(0, MAX_SERIES - 1).map((g) => g.key));
    const rest = list.filter((g) => !kept.has(g.key));
    const other = {
      key: "other",
      label: "Other",
      name: `Other (${rest.map((g) => g.label).join(", ")})`,
      total: rest.reduce((n, g) => n + g.total, 0),
      careerCode: null,
      order: [Number.MAX_SAFE_INTEGER, 0] as [number, number],
      counts: times.map((_, i) => rest.reduce((n, g) => n + g.counts[i], 0)),
    };
    list = [...list.filter((g) => kept.has(g.key)), other];
  }

  return {
    times,
    series: list.sort(byOrder).map((g) => {
      let running = 0;
      return { key: g.key, label: g.label, name: g.name, total: g.total, careerCode: g.careerCode, values: g.counts.map((n) => (running += n)) };
    }),
    unknown,
  };
}

/* -------------------------------------------------------------------------- */
/*                                  Standings                                 */
/* -------------------------------------------------------------------------- */

export interface PositionStanding {
  position: Position;
  leader: { candidate: Candidate; votes: number } | null;
  runnerUp: { candidate: Candidate; votes: number } | null;
  /** Leader's share of the ballots cast. */
  share: number;
  /** Votes ahead of the first candidate who isn't winning a seat (`null` without a contest). */
  lead: number | null;
  /** Ahead by 2% of the ballots or less. */
  close: boolean;
}

export interface PartyStanding {
  /** Party id, `"independent"` or `"abstain"`. */
  key: string;
  name: string;
  color: string | null;
  /** Positions it's leading. */
  leading: number;
  /** Share of every pick on every ballot (abstentions included). */
  share: number;
}

export interface Standings {
  ballots: number;
  positions: PositionStanding[];
  parties: PartyStanding[];
  /** The party leading the most positions (`null` while nobody leads). */
  leadingParty: PartyStanding | null;
}

export function standingsOf(tally: ElectionTally, positions: readonly Position[], candidates: readonly Candidate[], parties: readonly Partylist[]): Standings {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const ballots = tally.ballots;
  const partyVotes = new Map<string, number>();
  const partyLeads = new Map<string, number>();
  let picks = 0;
  let abstain = 0;

  const rows = positions.map((position): PositionStanding => {
    const t = tally.positions.find((p) => p.positionId === position.id);
    abstain += t?.abstain ?? 0;
    picks += t?.abstain ?? 0;
    const counted = candidates
      .filter((c) => c.positionId === position.id)
      .map((candidate) => ({ candidate, votes: t?.candidates.find((v) => v.candidateId === candidate.id)?.votes ?? 0 }))
      .sort((a, b) => b.votes - a.votes);
    for (const { candidate, votes } of counted) {
      const key = candidate.partylistId ?? "independent";
      partyVotes.set(key, (partyVotes.get(key) ?? 0) + votes);
      picks += votes;
    }
    // Votes for candidates that are no longer on the ballot still count as picks.
    for (const v of t?.candidates ?? []) if (!byId.has(v.candidateId)) picks += v.votes;

    const seats = Math.max(1, position.maxVotes);
    const leader = counted[0] && counted[0].votes > 0 ? counted[0] : null;
    const firstOut = counted[seats] ?? null;
    const lastIn = counted[Math.min(seats, counted.length) - 1] ?? null;
    const lead = leader && firstOut && lastIn ? lastIn.votes - firstOut.votes : null;
    if (leader && !(counted[1] && counted[1].votes === leader.votes && seats === 1)) {
      const key = leader.candidate.partylistId ?? "independent";
      partyLeads.set(key, (partyLeads.get(key) ?? 0) + 1);
    }
    return {
      position,
      leader,
      runnerUp: counted[1] ?? null,
      share: leader && ballots ? leader.votes / ballots : 0,
      lead,
      close: lead !== null && ballots > 0 && lead <= Math.max(1, ballots * 0.02),
    };
  });

  const share = (n: number) => (picks ? n / picks : 0);
  const partyRows: PartyStanding[] = [
    ...parties.map((p) => ({ key: p.id, name: p.name, color: p.color, leading: partyLeads.get(p.id) ?? 0, share: share(partyVotes.get(p.id) ?? 0) })),
    ...(candidates.some((c) => !c.partylistId) ? [{ key: "independent", name: "Independent", color: null, leading: partyLeads.get("independent") ?? 0, share: share(partyVotes.get("independent") ?? 0) }] : []),
  ].sort((a, b) => b.leading - a.leading || b.share - a.share);
  const top = partyRows.find((p) => p.key !== "independent" && p.leading > 0) ?? null;

  return {
    ballots,
    positions: rows,
    parties: [...partyRows, { key: "abstain", name: "Abstain", color: null, leading: 0, share: share(abstain) }],
    leadingParty: top,
  };
}

/* -------------------------------------------------------------------------- */
/*                                  Formatting                                */
/* -------------------------------------------------------------------------- */

/** 0.6052 → "60.5%". */
export const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

/** "7h 42m left", "12m left", "closing now". */
export function timeLeft(until: string, now: number): string {
  const ms = new Date(until).getTime() - now;
  if (ms <= 0) return "closing now";
  const minutes = Math.ceil(ms / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days) return `${days}d ${hours}h left`;
  return hours ? `${hours}h ${mins}m left` : `${mins}m left`;
}
