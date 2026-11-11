import { toDateOnly } from "@/lib/dates";
import { apiClient } from "@/services/api/client";
import type { EnrollmentSummary, NewTermInput, Term } from "@/types/term.types";

/*
 * Terms page <-> ASP.NET Core Web API (SLVP-BE).
 * Routes are relative to NEXT_PUBLIC_API_URL; DTOs mirror SLVP-BE/stiVoteAppBE/Dtos.
 */

const ROUTES = {
  terms: "admin/terms",
  enrollments: "admin/enrollments",
  elections: "admin/election",
} as const;

/** TermResponse */
interface TermDto {
  id: string;
  acadYear: string;
  termNumber: number;
  startDate: string;
  endDate: string;
}

/** EnrollmentDtos.EnrollmentResponse (only the fields used here). */
interface EnrollmentDto {
  studentId: string;
  termId: string;
  /** "Active", or a number when the backend sends enums as numbers. */
  status: string | number;
}

/** ElectionResponse (only the field used here). */
interface ElectionDto {
  termId: string;
}

const ENROLLMENT_STATUSES = ["Active", "Inactive", "Loa", "Graduated"];

function toTerm(dto: TermDto): Term {
  return {
    id: dto.id,
    acadYear: dto.acadYear,
    termNumber: dto.termNumber,
    startDate: toDateOnly(dto.startDate),
    endDate: toDateOnly(dto.endDate),
  };
}

interface RequestOptions {
  signal?: AbortSignal;
}

export async function fetchTerms({ signal }: RequestOptions = {}): Promise<Term[]> {
  const dtos = await apiClient.get<TermDto[]>(ROUTES.terms, { signal });
  return dtos.map(toTerm);
}

/** Every enrollment (student → term), used for usage counts and the roll-over. */
export async function fetchEnrollmentSummaries({ signal }: RequestOptions = {}): Promise<EnrollmentSummary[]> {
  const dtos = await apiClient.get<EnrollmentDto[]>(ROUTES.enrollments, { signal });
  return dtos.map((e) => ({
    studentId: e.studentId,
    termId: e.termId,
    status: typeof e.status === "number" ? (ENROLLMENT_STATUSES[e.status] ?? String(e.status)) : e.status,
  }));
}

/** Term id of every election. */
export async function fetchElectionTermIds({ signal }: RequestOptions = {}): Promise<string[]> {
  const dtos = await apiClient.get<ElectionDto[]>(ROUTES.elections, { signal });
  return dtos.map((e) => e.termId);
}

/** The database assigns the id (TRM-00006). */
export async function createTerm(input: NewTermInput): Promise<Term> {
  const dto = await apiClient.post<TermDto, NewTermInput>(ROUTES.terms, input);
  return toTerm(dto);
}

/** The backend only lets a term's dates change (not its school year or number). */
export async function updateTermDates(id: string, startDate: string, endDate: string): Promise<Term> {
  const dto = await apiClient.put<TermDto, { startDate: string; endDate: string }>(
    `${ROUTES.terms}/${encodeURIComponent(id)}`,
    { startDate, endDate },
  );
  return toTerm(dto);
}

/** Refused with 409 while enrollments or elections still use the term. */
export async function deleteTerm(id: string): Promise<void> {
  await apiClient.delete(`${ROUTES.terms}/${encodeURIComponent(id)}`);
}

/** Moves the given students' enrollments to `termId`. Resolves with how many changed. */
export async function moveEnrollmentsToTerm(studentIds: readonly string[], termId: string): Promise<number> {
  const result = await apiClient.patch<{ updated: number }, object>(`${ROUTES.enrollments}/bulk`, {
    studentIds: [...studentIds],
    termId,
    level: null,
    status: null,
  });
  return result?.updated ?? 0;
}
