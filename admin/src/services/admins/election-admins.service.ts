import { apiClient, isApiError } from "@/services/api/client";
import { getApiErrorMessage } from "@/services/api/error-message";

/*
 * Election admins <-> ASP.NET Core Web API (`/api/admin/election-admins`, SLVP-BE
 * Endpoints/ElectionAdminEndpoints.cs). Super admins only.
 *
 * One record = one person on one election (the same email can be on several elections).
 * Adding one only saves the record: no invitation email is sent yet, and `isVerified` stays
 * false until the backend can link the person's login.
 */

const ROUTE = "admin/election-admins";

export const ELECTION_ADMIN_TYPES = ["Faculty", "Staff", "Student"] as const;
export type ElectionAdminType = (typeof ELECTION_ADMIN_TYPES)[number];

export interface ElectionAdmin {
  /** e.g. "EAD-00001" */
  id: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  type: ElectionAdminType;
  /** Set once their login is linked (not possible yet). */
  authUserId: string | null;
  isVerified: boolean;
  electionId: string;
  /** Students only. */
  studentId: string | null;
  /** Faculty only. */
  facultyId: string | null;
  createdAt: string;
}

export interface ElectionAdminInput {
  fullName: string;
  email: string;
  type: ElectionAdminType;
  electionId: string;
  studentId?: string | null;
  facultyId?: string | null;
}

/** ElectionAdminResponse (note the backend's lowercase `fullname`). */
interface ElectionAdminDto {
  id: string;
  fullname: string | null;
  email: string;
  avatarUrl: string | null;
  type: string | number;
  authUserId: string | null;
  isVerified: boolean;
  electionId: string;
  studentId: string | null;
  facultyId: string | null;
  createdAt: string;
}

/** ElectionAdminRequest */
interface ElectionAdminRequest {
  fullname: string;
  email: string;
  type: ElectionAdminType;
  electionId: string;
  studentId: string | null;
  facultyId: string | null;
}

/** The backend's enum order, for the (buggy) rows that store the type as a number. */
const BACKEND_TYPE_ORDER: readonly ElectionAdminType[] = ["Staff", "Faculty", "Student"];

function toType(value: string | number): ElectionAdminType {
  if (typeof value === "number") return BACKEND_TYPE_ORDER[value] ?? "Staff";
  return ELECTION_ADMIN_TYPES.find((t) => t.toLowerCase() === value.toLowerCase()) ?? "Staff";
}

function toElectionAdmin(dto: ElectionAdminDto): ElectionAdmin {
  return {
    id: dto.id,
    fullName: dto.fullname?.trim() ?? "",
    email: dto.email,
    avatarUrl: dto.avatarUrl,
    type: toType(dto.type),
    authUserId: dto.authUserId,
    isVerified: dto.isVerified,
    electionId: dto.electionId,
    studentId: dto.studentId,
    facultyId: dto.facultyId,
    createdAt: dto.createdAt,
  };
}

interface RequestOptions {
  signal?: AbortSignal;
}

export async function fetchElectionAdmins({ signal }: RequestOptions = {}): Promise<ElectionAdmin[]> {
  const dtos = await apiClient.get<ElectionAdminDto[]>(ROUTE, { signal });
  return dtos.map(toElectionAdmin);
}

/** Saves the election admin (no email is sent). Resolves with the new record. */
export async function createElectionAdmin(input: ElectionAdminInput): Promise<ElectionAdmin> {
  const body: ElectionAdminRequest = {
    fullname: input.fullName.trim(),
    email: input.email.trim().toLowerCase(),
    type: input.type,
    electionId: input.electionId,
    studentId: input.type === "Student" ? (input.studentId?.trim() ?? null) : null,
    facultyId: input.type === "Faculty" ? (input.facultyId?.trim() ?? null) : null,
  };
  return toElectionAdmin(await apiClient.post<ElectionAdminDto, ElectionAdminRequest>(ROUTE, body));
}

/** Removes the person from that election. Their login (if any) isn't deleted. */
export async function deleteElectionAdmin(id: string): Promise<void> {
  await apiClient.delete<void>(`${ROUTE}/${encodeURIComponent(id)}`);
}

/** Message for a failed add or remove, with the backend's database-rule errors explained. */
export function getElectionAdminErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    const code = (error.problem as { code?: unknown } | undefined)?.code;
    if (code === "23514") {
      return "The server couldn't save the admin type. This is a known backend bug (ElectionAdmin.Type is saved as a number); nothing was saved.";
    }
    if (code === "23503") return "That election no longer exists. Reload the page and pick another.";
    // Some backend messages start with a stray space.
    if (error.status === 400 || error.status === 409) return getApiErrorMessage(error).trim();
  }
  return getApiErrorMessage(error);
}
