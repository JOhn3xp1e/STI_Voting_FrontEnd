import type { ElectionPage } from "@/config/navigation";
import type { Candidate, Position } from "@/types/ballot.types";
import type { ElectionStatus } from "@/types/election.types";
import type { Partylist } from "@/types/partylist.types";
import type { VoterEmailSummary, VoterRecord } from "@/services/voters/voters.service";

/*
 * The election's Manage page: where it is (preparation → voting → results) and
 * what's still missing before voting opens. Everything is worked out from data
 * the API already has; nothing here changes an election.
 */

export const count = (n: number) => n.toLocaleString("en-US");
export const plural = (n: number, one: string, many = `${one}s`) => `${count(n)} ${n === 1 ? one : many}`;

/* -------------------------------------------------------------------------- */
/*                                   Stages                                   */
/* -------------------------------------------------------------------------- */

/** 0 Preparation (draft, upcoming) · 1 Voting (ongoing) · 2 Results (completed). */
export function stageOf(status: ElectionStatus): 0 | 1 | 2 {
  if (status === "Ongoing") return 1;
  if (status === "Completed") return 2;
  return 0;
}

/* -------------------------------------------------------------------------- */
/*                                 Countdown                                  */
/* -------------------------------------------------------------------------- */

export interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** The moment has passed. */
  past: boolean;
}

export function countdownTo(target: string, now: number): Countdown {
  const ms = new Date(target).getTime() - now;
  const left = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(left / 86400),
    hours: Math.floor((left % 86400) / 3600),
    minutes: Math.floor((left % 3600) / 60),
    seconds: left % 60,
    past: ms <= 0,
  };
}

/* -------------------------------------------------------------------------- */
/*                                  Checklist                                 */
/* -------------------------------------------------------------------------- */

export type ChecklistKey = "parties" | "ballot" | "voters" | "passcodes" | "emails";

export interface ChecklistItem {
  key: ChecklistKey;
  /** 1 Ballot (election admin) · 2 Voters (super admin). */
  group: 1 | 2;
  title: string;
  detail: string;
  done: boolean;
  /** Where to fix or look at it. */
  page: ElectionPage;
  /** Settings tab to open (#voters, #logins). */
  tab?: "voters" | "logins";
  /** Link text when it isn't done ("Add positions"); "View" otherwise. */
  action: string;
}

export interface ChecklistInput {
  parties: readonly Partylist[];
  positions: readonly Position[];
  candidates: readonly Candidate[];
  /** `null` when they couldn't be loaded. */
  voters: readonly VoterRecord[] | null;
  emails: VoterEmailSummary | null;
  /** Students the election's filters let vote; `null` when unknown. */
  eligible: number | null;
}

export function buildChecklist({ parties, positions, candidates, voters, emails, eligible }: ChecklistInput): ChecklistItem[] {
  const items: ChecklistItem[] = [];

  /* 1 · Ballot */
  const independentsOnly = parties.length === 0 && candidates.length > 0 && candidates.every((c) => c.partylistId === null);
  items.push({
    key: "parties",
    group: 1,
    title: "Party lists ready",
    detail: parties.length
      ? `${plural(parties.length, "party list")} published`
      : independentsOnly
        ? "No party lists · every candidate runs independent"
        : "No party lists yet",
    done: parties.length > 0 || independentsOnly,
    page: "party-lists",
    action: "Add party lists",
  });

  const withCandidates = new Set(candidates.map((c) => c.positionId));
  const empty = positions.filter((p) => !withCandidates.has(p.id)).length;
  items.push({
    key: "ballot",
    group: 1,
    title: "Positions & candidates ready",
    detail: !positions.length
      ? "No positions yet"
      : empty
        ? `${count(empty)} of ${plural(positions.length, "position")} ${empty === 1 ? "has" : "have"} no candidates`
        : `${plural(candidates.length, "candidate")} across ${plural(positions.length, "position")}`,
    done: positions.length > 0 && empty === 0,
    page: "ballot",
    action: positions.length ? "Add candidates" : "Add positions",
  });

  /* 2 · Voters */
  const total = voters?.length ?? 0;
  const missing = eligible !== null ? Math.max(0, eligible - total) : 0;
  items.push({
    key: "voters",
    group: 2,
    title: "Voters set",
    detail:
      voters === null
        ? "Couldn't load the voters"
        : total === 0
          ? `No voters yet${eligible !== null ? ` · ${plural(eligible, "student")} match the filters` : ""}`
          : `${plural(total, "voter")} from students matching the election filters${missing ? ` · ${count(missing)} not added` : ""}`,
    done: total > 0 && missing === 0,
    page: "settings",
    tab: "voters",
    action: "Open voters",
  });

  items.push({
    key: "passcodes",
    group: 2,
    title: "Passcodes generated",
    detail: total ? `${count(total)} of ${count(total)} · stored as a hash` : "Made with each voter",
    done: total > 0,
    page: "settings",
    tab: "logins",
    action: "Open voter logins",
  });

  const sent = emails?.sent ?? 0;
  const queued = emails?.queued ?? 0;
  const failed = emails?.failed ?? 0;
  items.push({
    key: "emails",
    group: 2,
    title: "Login emails sent",
    detail: !total
      ? "Sent once voters are set"
      : emails === null
        ? "Couldn't load the login emails"
        : [`${count(sent)} of ${count(total)} sent`, queued ? `${count(queued)} still queued` : null, failed ? `${count(failed)} failed` : null].filter(Boolean).join(" · "),
    done: total > 0 && sent >= total,
    page: "settings",
    tab: "logins",
    action: queued ? `Send ${count(queued)} queued` : "Open voter logins",
  });

  return items;
}

/** Turnout from the voter records: `null` when there are no voters or the API doesn't say who voted. */
export function turnoutOf(voters: readonly VoterRecord[] | null): { voted: number; total: number } | null {
  if (!voters?.length) return null;
  if (voters.every((v) => v.voted === null)) return null;
  return { voted: voters.filter((v) => v.voted === true).length, total: voters.length };
}
