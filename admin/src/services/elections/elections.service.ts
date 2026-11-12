import { apiClient } from "@/services/api/client";
import {
  ELECTION_CATEGORIES,
  ELECTION_STATUSES,
  type Election,
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
  /** Storage key in the `voting-images` bucket, e.g. `elections/<guid>.png`. Not loadable as is. */
  photoPath?: string | null;
  /** Public URL of the banner, built by the API from `photoPath`. */
  photoUrl?: string | null;
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
    photoUrl: dto.photoUrl ?? null,
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

/**
 * Create / Update body. The endpoints bind `[FromForm]` fields plus an optional `photo` file,
 * so this is sent as multipart/form-data. The browser sets the Content-Type (with its boundary)
 * itself, so no header is set here. Lists repeat their key once per value; leaving out `photo`
 * keeps the current banner on update.
 */
function toFormData(input: ElectionInput, photo?: File | null): FormData {
  const data = new FormData();
  data.append("title", input.title.trim());
  data.append("description", input.description.trim());
  const rules = input.rules?.trim();
  if (rules) data.append("electionRules", rules);
  data.append("electionCategory", input.category);
  for (const code of input.careerScope) data.append("careerScope", code);
  for (const code of input.programScope) data.append("academicProgramScope", code);
  for (const level of input.levelScope) data.append("levelScope", String(level));
  data.append("termId", input.termId);
  data.append("startDate", input.startsAt);
  data.append("endDate", input.endsAt);
  if (photo) data.append("photo", photo, photo.name);
  return data;
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

/** The database assigns the id (ELC-00007); new elections start as Draft. `photo` is the banner, if one was picked. */
export async function createElection(input: ElectionInput, photo?: File | null): Promise<Election> {
  return toElection(await apiClient.post<ElectionDto, FormData>(ROUTES.elections, toFormData(input, photo)));
}

/** Without a new `photo`, the election keeps its current banner. */
export async function updateElection(id: string, input: ElectionInput, photo?: File | null): Promise<Election> {
  return toElection(await apiClient.put<ElectionDto, FormData>(electionPath(id), toFormData(input, photo)));
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
