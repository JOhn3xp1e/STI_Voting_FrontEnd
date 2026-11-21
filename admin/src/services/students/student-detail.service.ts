import { apiClient } from "@/services/api/client";
import { fetchElections } from "@/services/elections/elections.service";
import type { ElectionStatus } from "@/types/election.types";

/*
 * Student detail drawer <-> ASP.NET Core Web API (SLVP-BE).
 *
 * - PUT    admin/students/{id}     → edit name (the email can't be changed)
 * - DELETE admin/students/{id}     → archive (soft delete)
 * - GET    admin/enrollments/{id}  → the student's enrollment (one per student)
 * - GET    admin/voters, admin/candidates, admin/positions → filtered here to one student
 */

interface RequestOptions {
  signal?: AbortSignal;
}

/** StudentDtos.UpdateStudentRequest */
interface UpdateStudentRequest {
  firstName: string;
  lastName: string;
  middleName: string | null;
}

/** EnrollmentDtos.EnrollmentResponse (only what the drawer reads). */
interface EnrollmentDto {
  lastModifiedAt?: string | null;
}

/** VoterResponse */
interface VoterDto {
  studentId: string;
  electionId: string;
  status?: string | null;
  isActive?: boolean | null;
  votedAt?: string | null;
}

/** CandidateResponse (only what the drawer reads). */
interface CandidateDto {
  studentId: string;
  electionId: string;
  positionId: string;
}

/** PositionResponse (only what the drawer reads). */
interface PositionDto {
  id: string;
  title: string;
}

/** One election the student takes part in, as a voter and/or a candidate. */
export interface StudentElection {
  electionId: string;
  title: string;
  status: ElectionStatus;
  startsAt: string;
  endsAt: string;
  /** `null` when the student isn't on the election's voter list. */
  voter: { voted: boolean; votedAt: string | null; active: boolean } | null;
  /** Position title, or `null` when the student isn't running. */
  candidacy: string | null;
}

/** Saves a student's name. */
export async function updateStudentName(
  studentNo: string,
  name: { firstName: string; lastName: string; middleName?: string },
): Promise<void> {
  await apiClient.put<unknown, UpdateStudentRequest>(`admin/students/${encodeURIComponent(studentNo)}`, {
    firstName: name.firstName.trim(),
    lastName: name.lastName.trim(),
    middleName: name.middleName?.trim() || null,
  });
}

/** Archives the student (soft delete; they leave the roster). */
export async function archiveStudent(studentNo: string): Promise<void> {
  await apiClient.delete(`admin/students/${encodeURIComponent(studentNo)}`);
}

/** When the student's enrollment last changed, or `null` when they have none. */
export async function fetchEnrollmentModifiedAt(studentNo: string, { signal }: RequestOptions = {}): Promise<string | null> {
  try {
    const dto = await apiClient.get<EnrollmentDto>(`admin/enrollments/${encodeURIComponent(studentNo)}`, { signal });
    return dto?.lastModifiedAt ?? null;
  } catch {
    return null;
  }
}

/** Elections the student votes or runs in, newest first. */
export async function fetchStudentElections(studentNo: string, { signal }: RequestOptions = {}): Promise<StudentElection[]> {
  const [elections, voters, candidates, positions] = await Promise.all([
    fetchElections({ signal }),
    apiClient.get<VoterDto[]>("admin/voters", { signal }),
    apiClient.get<CandidateDto[]>("admin/candidates", { signal }),
    apiClient.get<PositionDto[]>("admin/positions", { signal }),
  ]);

  const positionTitles = new Map(positions.map((p) => [p.id, p.title]));
  const votes = new Map(voters.filter((v) => v.studentId === studentNo).map((v) => [v.electionId, v]));
  const runs = new Map(candidates.filter((c) => c.studentId === studentNo).map((c) => [c.electionId, c]));

  return elections
    .filter((e) => votes.has(e.id) || runs.has(e.id))
    .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))
    .map((e) => {
      const voter = votes.get(e.id);
      const run = runs.get(e.id);
      return {
        electionId: e.id,
        title: e.title,
        status: e.status,
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        voter: voter
          ? { voted: voter.status?.toLowerCase() === "completed", votedAt: voter.votedAt ?? null, active: voter.isActive !== false }
          : null,
        candidacy: run ? (positionTitles.get(run.positionId) ?? "Candidate") : null,
      };
    });
}
