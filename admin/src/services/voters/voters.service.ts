import { apiClient } from "@/services/api/client";

/*
 * Voters and their login emails <-> ASP.NET Core Web API (SLVP-BE).
 *   GET  /api/admin/voters/election/{electionId}   the election's voters (created / voted times)
 *   POST /api/admin/voters                         add one voter { studentId, electionId }
 *   PUT  /api/admin/voters/{id}                    { isActive }
 *   GET  /api/admin/voter-emails?electionId=…      each voter's name, email, vote and email status
 *   POST /api/admin/voter-emails                   queue login emails { electionId, voterIds?, resend }
 *   GET  /api/admin/voter-emails/voter/{voterId}   every email sent to one voter
 *
 * Passcodes are made by the server when the email is sent and stored only as a
 * salted hash; the browser never sees one. Resending gives the voter a new
 * passcode and the old one stops working.
 */

interface RequestOptions {
  signal?: AbortSignal;
}

export type VoteStatus = "empty" | "draft" | "completed";
export type EmailStatus = "not_sent" | "queued" | "sending" | "sent" | "delivered" | "bounced" | "complained" | "failed" | "cancelled";

/** One voter, as the Voters and Voter logins tabs show them. */
export interface VoterRow {
  id: string;
  studentId: string;
  /** "Cruz, Aeron Aries"; `null` when the student record is gone. */
  name: string | null;
  email: string | null;
  isActive: boolean;
  voteStatus: VoteStatus;
  /** A passcode was sent and can be used to sign in. */
  hasPasscode: boolean;
  /** The latest login email's state. */
  emailStatus: EmailStatus;
  attempts: number;
  lastError: string | null;
  queuedAt: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  createdAt: string | null;
  votedAt: string | null;
}

interface VoterDto {
  id: string;
  studentId: string;
  status?: string | null;
  isActive?: boolean | null;
  votedAt?: string | null;
  createdAt?: string | null;
}

interface LoginStatusDto {
  voterId: string;
  studentId: string;
  name?: string | null;
  email?: string | null;
  isActive?: boolean | null;
  voteStatus?: string | null;
  hasPasscode?: boolean | null;
  emailStatus?: string | null;
  attempts?: number | null;
  lastError?: string | null;
  queuedAt?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
  failedAt?: string | null;
}

const EMAIL_STATUSES: readonly EmailStatus[] = ["not_sent", "queued", "sending", "sent", "delivered", "bounced", "complained", "failed", "cancelled"];
const toVoteStatus = (raw: string | null | undefined): VoteStatus => (raw === "completed" || raw === "draft" ? raw : "empty");
const toEmailStatus = (raw: string | null | undefined): EmailStatus => EMAIL_STATUSES.find((s) => s === raw?.toLowerCase()) ?? "not_sent";

/** Every voter of the election with their login status (two requests, merged by voter id). */
export async function fetchVoterRows(electionId: string, { signal }: RequestOptions = {}): Promise<VoterRow[]> {
  const [voters, logins] = await Promise.all([
    apiClient.get<VoterDto[]>(`admin/voters/election/${encodeURIComponent(electionId)}`, { signal }),
    apiClient.get<{ voters?: LoginStatusDto[] }>("admin/voter-emails", { signal, params: { electionId } }),
  ]);
  const byId = new Map((logins?.voters ?? []).map((l) => [l.voterId, l]));
  return (voters ?? []).map((v): VoterRow => {
    const l = byId.get(v.id);
    return {
      id: v.id,
      studentId: v.studentId,
      name: l?.name ?? null,
      email: l?.email ?? null,
      isActive: l?.isActive ?? v.isActive ?? true,
      voteStatus: toVoteStatus(l?.voteStatus ?? v.status),
      hasPasscode: l?.hasPasscode ?? false,
      emailStatus: toEmailStatus(l?.emailStatus),
      attempts: l?.attempts ?? 0,
      lastError: l?.lastError ?? null,
      queuedAt: l?.queuedAt ?? null,
      sentAt: l?.sentAt ?? null,
      deliveredAt: l?.deliveredAt ?? null,
      failedAt: l?.failedAt ?? null,
      createdAt: v.createdAt ?? null,
      votedAt: v.votedAt ?? null,
    };
  });
}

export async function createVoter(studentId: string, electionId: string): Promise<void> {
  await apiClient.post("admin/voters", { studentId, electionId, passcodeHash: null });
}

export async function setVoterActive(id: string, isActive: boolean): Promise<void> {
  await apiClient.put(`admin/voters/${encodeURIComponent(id)}`, { isActive });
}

export interface QueueResult {
  queued: number;
  skipped: { voterId: string; studentId: string | null; reason: string }[];
  /** The server only pretends to send (VOTER_EMAILS_DRY_RUN, or no email key yet). */
  dryRun: boolean;
}

/**
 * Queues login emails (every voter when `voterIds` is left out). The server skips voters who are
 * deactivated, already voted, have no email, have one on its way, or (without `resend`) already got one.
 */
export async function queueVoterEmails(electionId: string, voterIds?: readonly string[], resend = false): Promise<QueueResult> {
  const result = await apiClient.post<QueueResult>("admin/voter-emails", { electionId, voterIds: voterIds ? [...voterIds] : null, resend });
  return { queued: result?.queued ?? 0, skipped: result?.skipped ?? [], dryRun: result?.dryRun ?? false };
}

export interface VoterEmailEntry {
  id: string;
  email: string;
  kind: string;
  status: EmailStatus;
  attempts: number;
  lastError: string | null;
  queuedAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
}

/** Every login email sent to one voter, newest first. */
export async function fetchVoterEmailHistory(voterId: string, { signal }: RequestOptions = {}): Promise<VoterEmailEntry[]> {
  const list = await apiClient.get<(Omit<VoterEmailEntry, "status"> & { status: string })[]>(`admin/voter-emails/voter/${encodeURIComponent(voterId)}`, { signal });
  return (list ?? []).map((e) => ({ ...e, status: toEmailStatus(e.status) }));
}

/* -------------------------------------------------------------------------- */
/*                         Summaries (Manage page)                            */
/* -------------------------------------------------------------------------- */

export interface VoterRecord {
  id: string;
  studentId: string;
  isActive: boolean;
  /** Whether they've voted (submitted their ballot). */
  voted: boolean | null;
}

export async function fetchElectionVoters(electionId: string, { signal }: RequestOptions = {}): Promise<VoterRecord[]> {
  const list = await apiClient.get<VoterDto[]>(`admin/voters/election/${encodeURIComponent(electionId)}`, { signal });
  return (list ?? []).map((v) => ({ id: v.id, studentId: v.studentId, isActive: v.isActive !== false, voted: toVoteStatus(v.status) === "completed" }));
}

export interface VoterEmailSummary {
  total: number;
  sent: number;
  queued: number;
  failed: number;
}

/** Login email counts for the Manage checklist. */
export async function fetchVoterEmailSummary(electionId: string, { signal }: RequestOptions = {}): Promise<VoterEmailSummary> {
  const dto = await apiClient.get<{ total?: number; counts?: Record<string, number> }>("admin/voter-emails", { signal, params: { electionId } });
  const counts = dto?.counts ?? {};
  const sum = (keys: EmailStatus[]) => keys.reduce((n, key) => n + (counts[key] ?? 0), 0);
  return {
    total: typeof dto?.total === "number" ? dto.total : 0,
    sent: sum(["sent", "delivered"]),
    queued: sum(["queued", "sending"]),
    failed: sum(["failed", "bounced", "complained"]),
  };
}
