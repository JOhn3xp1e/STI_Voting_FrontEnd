import type { Election, ElectionStatus, VoterEnrollment } from "@/types/election.types";
import type { EmailStatus, VoteStatus, VoterRow } from "@/services/voters/voters.service";

import { formatDay, formatTime, instantToLocal } from "./elections";

/*
 * The election's voters: who should be one (eligible students), how far along
 * each one is (vote and login email), and what an admin may still change.
 */

/**
 * Students the election's filters let vote, with their enrollment in the election's term
 * (same rules as `countEligibleVoters`: Active enrollments in the term; empty filter = every).
 */
export function eligibleEnrollments(enrollments: readonly VoterEnrollment[], election: Pick<Election, "termId" | "careerScope" | "programScope" | "levelScope">): Map<string, VoterEnrollment> {
  const careers = new Set(election.careerScope);
  const programs = new Set(election.programScope);
  const levels = new Set(election.levelScope);
  const out = new Map<string, VoterEnrollment>();
  for (const e of enrollments) {
    if (e.termId !== election.termId || e.status !== "Active") continue;
    if (careers.size && !careers.has(e.careerCode)) continue;
    if (programs.size && (e.programCode === null || !programs.has(e.programCode))) continue;
    if (levels.size && !levels.has(e.level)) continue;
    out.set(e.studentId, e);
  }
  return out;
}

/** Each student's enrollment in the term (for program and year on the voter rows). */
export function termEnrollments(enrollments: readonly VoterEnrollment[], termId: string): Map<string, VoterEnrollment> {
  return new Map(enrollments.filter((e) => e.termId === termId).map((e) => [e.studentId, e]));
}

/* ------------------------------ What can change ----------------------------- */

/** Voters can be added until voting opens. */
export const canAddVoters = (status: ElectionStatus) => status === "Draft" || status === "Upcoming";
/** Voters can be turned off and on until voting ends. */
export const canToggleVoters = (status: ElectionStatus) => status === "Draft" || status === "Upcoming" || status === "Ongoing";
/** Login emails go out once the election is scheduled, and while voting is open. */
export const canSendEmails = (status: ElectionStatus) => status === "Upcoming" || status === "Ongoing";

/* --------------------------------- Groups ---------------------------------- */

export type EmailGroup = "sent" | "queued" | "failed" | "not_sent";

export function emailGroup(status: EmailStatus): EmailGroup {
  if (status === "sent" || status === "delivered") return "sent";
  if (status === "queued" || status === "sending") return "queued";
  if (status === "failed" || status === "bounced" || status === "complained") return "failed";
  return "not_sent";
}

export const EMAIL_LABEL: Record<EmailStatus, string> = {
  not_sent: "Not sent",
  queued: "Queued",
  sending: "Sending",
  sent: "Sent",
  delivered: "Delivered",
  bounced: "Bounced",
  complained: "Complained",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const VOTE_LABEL: Record<VoteStatus, string> = {
  empty: "Not started",
  draft: "Draft",
  completed: "Voted",
};

/** What the row's quick action does: send a first email, retry a failed one, or nothing. */
export function rowAction(voter: VoterRow, emailsOpen: boolean): "send" | "retry" | "resend" | null {
  if (!emailsOpen || !voter.isActive || voter.voteStatus === "completed") return null;
  const group = emailGroup(voter.emailStatus);
  if (group === "not_sent") return "send";
  if (group === "failed") return "retry";
  if (group === "sent") return "resend";
  return null;
}

/* --------------------------------- Formats --------------------------------- */

/** Times without an offset are stored as UTC, so read them as UTC. */
const utc = (iso: string) => (/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`);

/** "Nov 14 · 9:02 AM" */
export function formatStamp(iso: string | null): string {
  if (!iso) return "—";
  const local = instantToLocal(utc(iso));
  return `${formatDay(local)} · ${formatTime(local.slice(11, 16))}`;
}

/** "Nov 14, 2026 · 9:02 AM" */
export function formatStampLong(iso: string | null): string {
  if (!iso) return "—";
  const local = instantToLocal(utc(iso));
  return `${formatDay(local, { year: true })} · ${formatTime(local.slice(11, 16))}`;
}

export const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
