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
  motto?: string | null;
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
    motto: dto.motto ?? null,
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

/** CreatePositionRequest (no voter restrictions: everyone the election allows can vote for it). */
interface CreatePositionBody {
  title: string;
  description: string;
  maxVote: number;
  electionId: string;
}

export interface PositionInput {
  title: string;
  /** Seats: how many candidates a voter may pick. */
  maxVotes: number;
  electionId: string;
}

/**
 * The database assigns the id (POS-00007). The API requires a description the
 * form doesn't ask for, so the title is sent as the description.
 */
export async function createPosition(input: PositionInput): Promise<Position> {
  const title = input.title.trim();
  const body: CreatePositionBody = { title, description: title, maxVote: input.maxVotes, electionId: input.electionId };
  return toPosition(await apiClient.post<PositionDto, CreatePositionBody>(ROUTES.positions, body));
}

/** Deletes its candidates too. */
export async function deletePosition(id: string): Promise<void> {
  await apiClient.delete(`${ROUTES.positions}/${encodeURIComponent(id)}`);
}

export interface CandidateInput {
  studentId: string;
  positionId: string;
  electionId: string;
  /** `null` = independent. */
  partylistId: string | null;
  motto: string | null;
}

/**
 * Create / Update body. The endpoints bind `[FromForm]` fields plus an optional `portraitImage`
 * file, so this is sent as multipart/form-data. Leaving out `partylistId` makes the candidate
 * independent, leaving out `motto` clears it, and leaving out the image keeps the current one.
 */
function candidateFormData(input: CandidateInput, portrait?: File | null): FormData {
  const data = new FormData();
  data.append("studentId", input.studentId);
  data.append("positionId", input.positionId);
  data.append("electionId", input.electionId);
  if (input.partylistId) data.append("partylistId", input.partylistId);
  const motto = input.motto?.trim();
  if (motto) data.append("motto", motto);
  if (portrait) data.append("portraitImage", portrait, portrait.name);
  return data;
}

/** The database assigns the id (CAND-00007). A student can run for one position per election. */
export async function createCandidate(input: CandidateInput, portrait?: File | null): Promise<Candidate> {
  return toCandidate(await apiClient.post<CandidateDto, FormData>(ROUTES.candidates, candidateFormData(input, portrait)));
}

/** Without a new `portrait`, the candidate keeps the current one. */
export async function updateCandidate(id: string, input: CandidateInput, portrait?: File | null): Promise<Candidate> {
  return toCandidate(await apiClient.put<CandidateDto, FormData>(`${ROUTES.candidates}/${encodeURIComponent(id)}`, candidateFormData(input, portrait)));
}

export async function deleteCandidate(id: string): Promise<void> {
  await apiClient.delete(`${ROUTES.candidates}/${encodeURIComponent(id)}`);
}
