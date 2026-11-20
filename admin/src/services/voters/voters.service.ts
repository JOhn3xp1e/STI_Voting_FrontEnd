import { apiClient } from "@/services/api/client";

/*
 * Voters and their login emails <-> ASP.NET Core Web API (SLVP-BE), read-only.
 *   GET /api/admin/voters/election/{electionId}  → the election's voters
 *   GET /api/admin/voter-emails?electionId=…     → { electionId, total, counts, voters }
 *
 * No election has voters yet, so the voter fields aren't confirmed: each one is read
 * defensively and an unknown "voted" stays `null` (shown as "—", never guessed).
 */

const ROUTES = {
  votersOfElection: (electionId: string) => `admin/voters/election/${encodeURIComponent(electionId)}`,
  voterEmails: "admin/voter-emails",
} as const;

interface RequestOptions {
  signal?: AbortSignal;
}

export interface VoterRecord {
  id: string;
  studentId: string;
  isActive: boolean;
  /** Whether they've voted; `null` when the API doesn't say. */
  voted: boolean | null;
}

export interface VoterEmailSummary {
  total: number;
  sent: number;
  queued: number;
  failed: number;
}

const text = (value: unknown) => (typeof value === "string" ? value : typeof value === "number" ? String(value) : "");

function toVoter(raw: unknown): VoterRecord {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const flag = [r.hasVoted, r.voted, r.isCompleted, r.completed].find((v) => typeof v === "boolean") as boolean | undefined;
  const votedAt = r.votedAt ?? r.voted_at ?? r.completedAt;
  const status = typeof r.status === "string" ? r.status : null;
  return {
    id: text(r.id),
    studentId: text(r.studentId ?? r.student_id),
    isActive: r.isActive !== false && r.is_active !== false,
    voted: flag ?? (votedAt ? true : status ? /voted|complete|submitted/i.test(status) : null),
  };
}

export async function fetchElectionVoters(electionId: string, { signal }: RequestOptions = {}): Promise<VoterRecord[]> {
  const list = await apiClient.get<unknown[]>(ROUTES.votersOfElection(electionId), { signal });
  return Array.isArray(list) ? list.map(toVoter) : [];
}

/** Login email counts per state; the API's `counts` keys are matched loosely ("Sent", "sent", "SENT"). */
export async function fetchVoterEmailSummary(electionId: string, { signal }: RequestOptions = {}): Promise<VoterEmailSummary> {
  const dto = await apiClient.get<{ total?: number; counts?: Record<string, number> }>(ROUTES.voterEmails, { signal, params: { electionId } });
  const counts = dto?.counts ?? {};
  const sum = (pattern: RegExp) => Object.entries(counts).reduce((n, [key, value]) => (pattern.test(key) && typeof value === "number" ? n + value : n), 0);
  return {
    total: typeof dto?.total === "number" ? dto.total : 0,
    sent: sum(/^(sent|delivered)$/i),
    queued: sum(/^(queued|pending)$/i),
    failed: sum(/^(failed|bounced)$/i),
  };
}
