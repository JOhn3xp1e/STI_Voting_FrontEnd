import { apiClient } from "@/services/api/client";

/*
 * Live election data for the Manage overview (ongoing) and the QR viewer.
 *
 * Both endpoints are proposed for SLVP-BE and aren't there yet; callers treat a 404 as
 * "not available yet":
 *   GET  /api/admin/elections/{id}/tally       unofficial per-position vote counts
 *   POST /api/admin/elections/{id}/voter-qr    { studentId } → a sign-in link for that voter
 *
 * Votes are anonymous ballots (`votes.ballot`: position id → candidate ids), so the
 * tally has to be counted on the server.
 */

interface RequestOptions {
  signal?: AbortSignal;
}

export interface CandidateVotes {
  candidateId: string;
  votes: number;
}

export interface PositionTally {
  positionId: string;
  /** Ballots that left this position empty. */
  abstain: number;
  candidates: CandidateVotes[];
}

export interface ElectionTally {
  /** Submitted ballots. */
  ballots: number;
  positions: PositionTally[];
}

interface TallyDto {
  ballots?: number | null;
  positions?: { positionId: string; abstain?: number | null; candidates?: { candidateId: string; votes?: number | null }[] | null }[] | null;
}

/** Unofficial counts so far (only for ongoing and completed elections). */
export async function fetchElectionTally(electionId: string, { signal }: RequestOptions = {}): Promise<ElectionTally> {
  const dto = await apiClient.get<TallyDto>(`admin/elections/${encodeURIComponent(electionId)}/tally`, { signal });
  return {
    ballots: dto?.ballots ?? 0,
    positions: (dto?.positions ?? []).map((p) => ({
      positionId: p.positionId,
      abstain: p.abstain ?? 0,
      candidates: (p.candidates ?? []).map((c) => ({ candidateId: c.candidateId, votes: c.votes ?? 0 })),
    })),
  };
}

export interface VoterQr {
  studentId: string;
  /** The voter site's login page with the student ID and passcode in the fragment, e.g. `https://slvp-voter.kape-dev.space/login#id=02000404138&code=HP8T-TMWG`. */
  loginUrl: string;
}

/** The link as returned: plain text, a JSON string, or `{ loginUrl | loginLink | link | url }`. */
type VoterQrDto = string | { loginUrl?: string | null; loginLink?: string | null; link?: string | null; url?: string | null };

/** Adds `https://` when the server leaves the scheme out, so phone cameras open it as a link. */
export function toLoginUrl(raw: string): string {
  const link = raw.trim().replace(/^"|"$/g, "");
  return /^[a-z][a-z\d+.-]*:\/\//i.test(link) ? link : `https://${link.replace(/^\/+/, "")}`;
}

/**
 * A sign-in link for one voter of the election, which the QR viewer turns into a QR. The server
 * gives the voter a new passcode for it (passcodes are stored hashed, so an old one can't be shown again).
 */
export async function createVoterQr(electionId: string, studentId: string): Promise<VoterQr> {
  const dto = await apiClient.post<VoterQrDto, { studentId: string }>(`admin/elections/${encodeURIComponent(electionId)}/voter-qr`, { studentId });
  const raw = typeof dto === "string" ? dto : (dto?.loginUrl ?? dto?.loginLink ?? dto?.link ?? dto?.url ?? "");
  if (!raw.trim()) throw new Error("The server didn't send a sign-in link.");
  return { studentId, loginUrl: toLoginUrl(raw) };
}
