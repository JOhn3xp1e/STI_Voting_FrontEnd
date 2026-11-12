import { apiClient } from "@/services/api/client";
import {
  ELECTION_CATEGORIES,
  ELECTION_STATUSES,
  type Election,
  type ElectionCategory,
  type ElectionInput,
  type ElectionStatus,
  type VoterEnrollment,
} from "@/types/election.types";

/*
 * Elections <-> ASP.NET Core Web API (SLVP-BE).
 * Routes are relative to NEXT_PUBLIC_API_URL; DTOs mirror SLVP-BE/stiVoteAppBE/Dtos/ElectionDtos.cs.
 */

const ROUTES = {
  elections: "admin/election",
  enrollments: "admin/enrollments",
} as const;

/** ElectionResponse. Enums arrive as text; numbers are accepted too, just in case. */
interface ElectionDto {
  id: string;
  title: string;
  description: string;
  electionRules?: string | null;
  photoPath?: string | null;
  electionCategory: string | number;
  careerScope?: string[] | null;
  academicProgramScope?: string[] | null;
  levelScope?: number[] | null;
  status: string | number;
  termId: string;
  startDate: string;
  endDate: string;
  createdAt: string;
}

/** CreateElectionDetailsRequest / UpdateElectionDetailsRequest */
interface ElectionRequestDto {
  title: string;
  description: string;
  electionRules: string | null;
  photoPath: string | null;
  electionCategory: ElectionCategory;
  careerScope: string[];
  academicProgramScope: string[];
  levelScope: number[];
  termId: string;
  startDate: string;
  endDate: string;
}

/** EnrollmentDtos.EnrollmentResponse (only the fields used here). */
interface EnrollmentDto {
  studentId: string;
  termId: string;
  careerCode: string;
  programCode: string;
  level: number;
  status: string | number;
}

const ENROLLMENT_STATUSES = ["Active", "Inactive", "Loa", "Graduated"];

function toEnum<T extends string>(values: readonly T[], raw: string | number, fallback: T): T {
  if (typeof raw === "number") return values[raw] ?? fallback;
  return values.find((value) => value.toLowerCase() === raw.toLowerCase()) ?? fallback;
}

/**
 * The API may send a date-time without an offset (e.g. a `timestamp` column);
 * those are stored as UTC, so read them as UTC.
 */
function toInstant(value: string): string {
  const hasZone = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(value);
  const date = new Date(hasZone ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function toElection(dto: ElectionDto): Election {
  return {
    id: dto.id,
    title: dto.title,
    description: dto.description,
    rules: dto.electionRules ?? null,
    photoPath: dto.photoPath ?? null,
    category: toEnum(ELECTION_CATEGORIES, dto.electionCategory, "Council"),
    careerScope: dto.careerScope ?? [],
    programScope: dto.academicProgramScope ?? [],
    levelScope: dto.levelScope ?? [],
    status: toEnum<ElectionStatus>(ELECTION_STATUSES, dto.status, "Draft"),
    termId: dto.termId,
    startsAt: toInstant(dto.startDate),
    endsAt: toInstant(dto.endDate),
    createdAt: dto.createdAt,
  };
}

function toRequest(input: ElectionInput): ElectionRequestDto {
  return {
    title: input.title.trim(),
    description: input.description.trim(),
    electionRules: input.rules?.trim() || null,
    photoPath: input.photoPath,
    electionCategory: input.category,
    careerScope: input.careerScope,
    academicProgramScope: input.programScope,
    levelScope: input.levelScope,
    termId: input.termId,
    startDate: input.startsAt,
    endDate: input.endsAt,
  };
}

interface RequestOptions {
  signal?: AbortSignal;
}

const electionPath = (id: string) => `${ROUTES.elections}/${encodeURIComponent(id)}`;

export async function fetchElections({ signal }: RequestOptions = {}): Promise<Election[]> {
  return (await apiClient.get<ElectionDto[]>(ROUTES.elections, { signal })).map(toElection);
}

/** Rejects with a 404 `ApiError` when there's no election with this id. */
export async function fetchElection(id: string, { signal }: RequestOptions = {}): Promise<Election> {
  return toElection(await apiClient.get<ElectionDto>(electionPath(id), { signal }));
}

export async function deleteElection(id: string): Promise<void> {
  await apiClient.delete(electionPath(id));
}

/** The database assigns the id (ELC-00007); new elections start as Draft. */
export async function createElection(input: ElectionInput): Promise<Election> {
  return toElection(await apiClient.post<ElectionDto, ElectionRequestDto>(ROUTES.elections, toRequest(input)));
}

export async function updateElection(id: string, input: ElectionInput): Promise<Election> {
  return toElection(await apiClient.put<ElectionDto, ElectionRequestDto>(electionPath(id), toRequest(input)));
}

/** Every enrollment with its level, to count who an election's filters let vote. */
export async function fetchVoterEnrollments({ signal }: RequestOptions = {}): Promise<VoterEnrollment[]> {
  const dtos = await apiClient.get<EnrollmentDto[]>(ROUTES.enrollments, { signal });
  return dtos.map((e) => ({
    studentId: e.studentId,
    termId: e.termId,
    careerCode: e.careerCode,
    programCode: e.programCode,
    level: e.level,
    status: typeof e.status === "number" ? (ENROLLMENT_STATUSES[e.status] ?? String(e.status)) : e.status,
  }));
}
