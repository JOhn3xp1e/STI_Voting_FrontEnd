/**
 * Student roster types used by the Students page.
 *
 * The page works with `Student`; `services/students/students.service.ts`
 * converts the Web API DTOs (`/api/admin/students`, `/enrollments`) to and from it.
 */

/** Program code from `/api/admin/programs`, e.g. `BSIT` or `STEM`. */
export type ProgramCode = string;

/** Year / grade level: 1–4 for college, 11–12 for senior high. */
export type YearLevel = number;

/** Enrollment status as stored by the backend. */
export type EnrollmentStatus = "Active" | "Inactive" | "Loa" | "Graduated";

export interface Student {
  /** 11-digit STI student number, e.g. `02000799331`. The backend's student `id`. */
  studentNo: string;
  lastName: string;
  firstName: string;
  middleName?: string;
  email: string;
  /** Career code, e.g. `TER`. `null` while the student has no enrollment. */
  careerCode: string | null;
  program: ProgramCode | null;
  year: YearLevel | null;
  /** Term the student is enrolled in, e.g. `TRM-00004`. */
  term: string | null;
  enrollmentStatus: EnrollmentStatus | null;
  /** ISO timestamp from the backend. */
  createdAt?: string;
}

/** Badge shown in the Status column (mutually exclusive). */
export type StudentStatus = "enrolled" | "not-updated" | "loa" | "inactive";

/** Multi-select filters from the Filters popover; empty list = no filter. */
export interface FacetFilters {
  programs: ProgramCode[];
  years: YearLevel[];
  terms: string[];
  statuses: StudentStatus[];
}

/** A school term from `/api/admin/terms`. */
export interface TermOption {
  /** e.g. `TRM-00004` */
  id: string;
  /** e.g. `2025–2026 term 1` */
  label: string;
  startDate: string;
  endDate: string;
}

/** A career from `/api/admin/careers`, e.g. `TER` (tertiary). */
export interface CareerOption {
  code: string;
  name: string;
  /** Display color (the career's own, else a stable fallback), as on Programs & careers. */
  color: string;
  /** Program codes listed under the career; empty for careers without programs (e.g. JHS). */
  programs: ProgramCode[];
  /** Inclusive year / grade range; `null` when the backend doesn't send it. */
  minLevel: number | null;
  maxLevel: number | null;
}

/** Reference lists the Students page needs (terms, programs, careers). */
export interface StudentCatalog {
  /** Newest first. */
  terms: TermOption[];
  /** The term running today, else the newest one. `null` when no term exists yet. */
  currentTerm: TermOption | null;
  programs: ProgramCode[];
  /** Program code → full name, e.g. BSIT → "BS Information Technology". */
  programNames: Record<ProgramCode, string>;
  careers: CareerOption[];
  /** Year levels offered in the year pickers. */
  yearLevels: YearLevel[];
}
