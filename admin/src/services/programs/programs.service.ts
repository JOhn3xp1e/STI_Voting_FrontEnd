import { apiClient } from "@/services/api/client";
import type { Career, CareerInput, ElectionScope, Program, ProgramInput } from "@/types/program.types";

/*
 * Programs & Careers page <-> ASP.NET Core Web API (SLVP-BE).
 * Routes are relative to NEXT_PUBLIC_API_URL; DTOs mirror SLVP-BE/stiVoteAppBE/Dtos.
 */

const ROUTES = {
  careers: "admin/careers",
  programs: "admin/programs",
  elections: "admin/election",
} as const;

/** CareerDtos.CareerResponse (levels arrive once the backend sends them). */
interface CareerDto {
  code: string;
  name: string;
  minLevel?: number | null;
  maxLevel?: number | null;
  color?: string | null;
  programScope?: string[] | null;
  createdAt: string;
}

/** ProgramDtos.ProgramResponse */
interface ProgramDto {
  code: string;
  name: string;
  createdAt: string;
}

/** ElectionResponse (only the fields used here). */
interface ElectionDto {
  title: string;
  careerScope?: string[] | null;
  academicProgramScope?: string[] | null;
}

const toCareer = (dto: CareerDto): Career => ({
  code: dto.code,
  name: dto.name,
  minLevel: dto.minLevel ?? null,
  maxLevel: dto.maxLevel ?? null,
  color: dto.color || null,
  programScope: dto.programScope ?? [],
  createdAt: dto.createdAt,
});

const toProgram = (dto: ProgramDto): Program => ({ code: dto.code, name: dto.name, createdAt: dto.createdAt });

const path = (base: string, code: string) => `${base}/${encodeURIComponent(code)}`;

interface RequestOptions {
  signal?: AbortSignal;
}

/* --------------------------------- careers --------------------------------- */

export async function fetchCareers({ signal }: RequestOptions = {}): Promise<Career[]> {
  return (await apiClient.get<CareerDto[]>(ROUTES.careers, { signal })).map(toCareer);
}

export async function createCareer(input: CareerInput): Promise<Career> {
  return toCareer(await apiClient.post<CareerDto, CareerInput>(ROUTES.careers, input));
}

/** The code never changes; name and levels do. */
export async function updateCareer(code: string, input: Omit<CareerInput, "code">): Promise<Career> {
  return toCareer(await apiClient.put<CareerDto, Omit<CareerInput, "code">>(path(ROUTES.careers, code), input));
}

/** Refused (409) while enrollments still use the career. */
export async function deleteCareer(code: string): Promise<void> {
  await apiClient.delete(path(ROUTES.careers, code));
}

/* --------------------------------- programs --------------------------------- */

export async function fetchPrograms({ signal }: RequestOptions = {}): Promise<Program[]> {
  return (await apiClient.get<ProgramDto[]>(ROUTES.programs, { signal })).map(toProgram);
}

/** The backend stores the code in upper case. */
export async function createProgram(input: ProgramInput): Promise<Program> {
  return toProgram(await apiClient.post<ProgramDto, ProgramInput>(ROUTES.programs, input));
}

/** Only the name can change (the code is the program's key). */
export async function updateProgram(code: string, name: string): Promise<Program> {
  return toProgram(await apiClient.put<ProgramDto, { name: string }>(path(ROUTES.programs, code), { name }));
}

/** Refused (409) while enrollments still use the program. */
export async function deleteProgram(code: string): Promise<void> {
  await apiClient.delete(path(ROUTES.programs, code));
}

/* --------------------------------- elections -------------------------------- */

/** Voter filters of every election, to warn before deleting a career or program they use. */
export async function fetchElectionScopes({ signal }: RequestOptions = {}): Promise<ElectionScope[]> {
  const dtos = await apiClient.get<ElectionDto[]>(ROUTES.elections, { signal });
  return dtos.map((e) => ({ title: e.title, careerScope: e.careerScope ?? [], programScope: e.academicProgramScope ?? [] }));
}
