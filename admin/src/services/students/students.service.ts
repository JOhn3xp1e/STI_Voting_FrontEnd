import { apiClient } from "@/services/api/client";
import { getApiErrorMessage } from "@/services/api/error-message";
import type {
  CareerOption,
  EnrollmentStatus,
  Student,
  StudentCatalog,
  TermOption,
  YearLevel,
} from "@/types/student.types";

/*
 * Students page <-> ASP.NET Core Web API (SLVP-BE).
 *
 * Routes are relative to NEXT_PUBLIC_API_URL (e.g. http://localhost:5239/api).
 * The DTOs below mirror the C# records in SLVP-BE/stiVoteAppBE/Dtos (camelCase JSON).
 */

const ROUTES = {
  students: "admin/students",
  enrollments: "admin/enrollments",
  terms: "admin/terms",
  programs: "admin/programs",
  careers: "admin/careers",
} as const;

/** College years and senior high grades. */
export const YEAR_LEVELS: readonly YearLevel[] = [1, 2, 3, 4, 11, 12];

/* -------------------------------------------------------------------------- */
/*                                    DTOs                                    */
/* -------------------------------------------------------------------------- */

/** StudentDtos.StudentResponse */
interface StudentDto {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  email: string;
  careerCode: string | null;
  programCode: string | null;
  level: number | null;
  termId: string | null;
  enrollmentStatus: string | null;
  createdAt: string;
}

/** StudentDtos.CreateStudentRequest */
interface CreateStudentRequest {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  email: string;
  careerCode: string;
  programCode: string;
  level: number;
  termId: string;
}

/** EnrollmentDtos.UpdateEnrollmentRequest */
interface UpdateEnrollmentRequest {
  careerCode: string;
  programCode: string;
  level: number;
  termId: string;
  status: EnrollmentStatus;
}

/** EnrollmentDtos.BulkUpdateEnrollmentRequest: only the fields sent are changed. */
interface BulkUpdateEnrollmentRequest {
  studentIds: string[];
  termId?: string | null;
  level?: number | null;
  status?: EnrollmentStatus | null;
}

/** TermResponse */
interface TermDto {
  id: string;
  acadYear: string;
  termNumber: number;
  startDate: string;
  endDate: string;
}

/** ProgramDtos.ProgramResponse */
interface ProgramDto {
  code: string;
  name: string;
}

/** CareerDtos.CareerResponse */
interface CareerDto {
  code: string;
  name: string;
}

/* -------------------------------------------------------------------------- */
/*                                  Mapping                                   */
/* -------------------------------------------------------------------------- */

const ENROLLMENT_STATUSES: readonly EnrollmentStatus[] = ["Active", "Inactive", "Loa", "Graduated"];

function toEnrollmentStatus(value: string | null): EnrollmentStatus | null {
  if (value === null) return null;
  // Tolerates casing differences ("LOA", "loa").
  return ENROLLMENT_STATUSES.find((s) => s.toLowerCase() === value.toLowerCase()) ?? null;
}

function toStudent(dto: StudentDto): Student {
  return {
    studentNo: dto.id,
    lastName: dto.lastName,
    firstName: dto.firstName,
    middleName: dto.middleName || undefined,
    email: dto.email,
    careerCode: dto.careerCode,
    program: dto.programCode,
    year: dto.level,
    term: dto.termId,
    enrollmentStatus: toEnrollmentStatus(dto.enrollmentStatus),
    createdAt: dto.createdAt,
  };
}

function toTerm(dto: TermDto): TermOption {
  return {
    id: dto.id,
    label: `${dto.acadYear.replace("-", "–")} term ${dto.termNumber}`,
    startDate: dto.startDate,
    endDate: dto.endDate,
  };
}

/** The term whose dates include today, else the newest one. */
function pickCurrentTerm(terms: readonly TermOption[]): TermOption | null {
  const now = Date.now();
  return (
    terms.find((t) => Date.parse(t.startDate) <= now && now <= Date.parse(t.endDate)) ??
    terms[0] ??
    null
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Errors                                   */
/* -------------------------------------------------------------------------- */

/** User-facing message for a failed Students request. */
export const getStudentsErrorMessage = getApiErrorMessage;

/* -------------------------------------------------------------------------- */
/*                                  Requests                                  */
/* -------------------------------------------------------------------------- */

interface RequestOptions {
  signal?: AbortSignal;
}

/** All non-archived students. */
export async function fetchStudents({ signal }: RequestOptions = {}): Promise<Student[]> {
  const dtos = await apiClient.get<StudentDto[]>(ROUTES.students, { signal });
  return dtos.map(toStudent);
}

/** Terms, programs and careers used by the filters and forms. */
export async function fetchStudentCatalog({ signal }: RequestOptions = {}): Promise<StudentCatalog> {
  const [termDtos, programDtos, careerDtos] = await Promise.all([
    apiClient.get<TermDto[]>(ROUTES.terms, { signal }),
    apiClient.get<ProgramDto[]>(ROUTES.programs, { signal }),
    apiClient.get<CareerDto[]>(ROUTES.careers, { signal }),
  ]);

  const terms = termDtos.map(toTerm).sort((a, b) => b.id.localeCompare(a.id));
  const careers: CareerOption[] = careerDtos
    .map((c) => ({ code: c.code, name: c.name }))
    .sort((a, b) => a.code.localeCompare(b.code));

  return {
    terms,
    currentTerm: pickCurrentTerm(terms),
    programs: programDtos.map((p) => p.code).sort((a, b) => a.localeCompare(b)),
    careers,
    yearLevels: [...YEAR_LEVELS],
  };
}

/** Creates the student and their enrollment (backend RPC `create_student_with_enrollment`). */
export async function createStudent(student: Student): Promise<Student> {
  if (!student.careerCode || !student.program || student.year === null || !student.term) {
    throw new Error("Career, program, year and term are required to add a student.");
  }
  const body: CreateStudentRequest = {
    id: student.studentNo,
    firstName: student.firstName,
    lastName: student.lastName,
    middleName: student.middleName ?? null,
    email: student.email,
    careerCode: student.careerCode,
    programCode: student.program,
    level: student.year,
    termId: student.term,
  };
  const dto = await apiClient.post<StudentDto, CreateStudentRequest>(ROUTES.students, body);
  return toStudent(dto);
}

/** Replaces one student's enrollment (career, program, year, term, status). */
export async function updateEnrollment(student: Student): Promise<void> {
  if (!student.careerCode || !student.program || student.year === null || !student.term) {
    throw new Error("This student has no complete enrollment to update.");
  }
  const body: UpdateEnrollmentRequest = {
    careerCode: student.careerCode,
    programCode: student.program,
    level: student.year,
    termId: student.term,
    status: student.enrollmentStatus ?? "Active",
  };
  await apiClient.put<unknown, UpdateEnrollmentRequest>(
    `${ROUTES.enrollments}/${encodeURIComponent(student.studentNo)}`,
    body,
  );
}

/**
 * Sets the term, year and/or status of several students' existing enrollments.
 * Students without an enrollment are skipped by the backend.
 * Resolves with the number of enrollments changed.
 */
export async function bulkUpdateEnrollments(
  studentNos: readonly string[],
  changes: { term?: string; year?: YearLevel; status?: EnrollmentStatus },
): Promise<number> {
  const body: BulkUpdateEnrollmentRequest = {
    studentIds: [...studentNos],
    termId: changes.term ?? null,
    level: changes.year ?? null,
    status: changes.status ?? null,
  };
  const result = await apiClient.patch<{ updated: number }, BulkUpdateEnrollmentRequest>(
    `${ROUTES.enrollments}/bulk`,
    body,
  );
  return result?.updated ?? 0;
}
