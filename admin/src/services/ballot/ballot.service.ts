import { apiClient } from "@/services/api/client";
import type { Candidate, Position } from "@/types/ballot.types";

/*
 * Positions and candidates <-> ASP.NET Core Web API (SLVP-BE).
 * Routes are relative to NEXT_PUBLIC_API_URL; DTOs mirror PositionDtos.cs and CandidateDtos.cs.
 */

const ROUTES = {
  positions: "admin/positions",
  candidates: "admin/candidates",
} as const;

/** PositionResponse (only the fields used here). */
interface PositionDto {
  id: string;
  title: string;
  description: string;
  maxVote: number;
  electionId: string;
  createdAt: string;
}

/** CandidateResponse */
interface CandidateDto {
  id: string;
  studentId: string;
  positionId: string;
  electionId: string;
  partylistId?: string | null;
  /** Public URL built by the API from the storage path. */
  portraitImageUrl?: string | null;
  platform?: string | null;
  createdAt: string;
}

function toPosition(dto: PositionDto): Position {
  return {
    id: dto.id,
    title: dto.title,
    description: dto.description ?? "",
    maxVotes: dto.maxVote,
    electionId: dto.electionId,
    createdAt: dto.createdAt,
  };
}

function toCandidate(dto: CandidateDto): Candidate {
  return {
    id: dto.id,
    studentId: dto.studentId,
    positionId: dto.positionId,
    electionId: dto.electionId,
    partylistId: dto.partylistId ?? null,
    portraitUrl: dto.portraitImageUrl ?? null,
    platform: dto.platform ?? null,
    createdAt: dto.createdAt,
  };
}

interface RequestOptions {
  signal?: AbortSignal;
}

/** The positions of one election. */
export async function fetchPositions(electionId: string, { signal }: RequestOptions = {}): Promise<Position[]> {
  const dtos = await apiClient.get<PositionDto[]>(`${ROUTES.positions}/election/${encodeURIComponent(electionId)}`, { signal });
  return dtos.map(toPosition);
}

/** The candidates of one election. */
export async function fetchCandidates(electionId: string, { signal }: RequestOptions = {}): Promise<Candidate[]> {
  const dtos = await apiClient.get<CandidateDto[]>(`${ROUTES.candidates}/election/${encodeURIComponent(electionId)}`, { signal });
  return dtos.map(toCandidate);
}
