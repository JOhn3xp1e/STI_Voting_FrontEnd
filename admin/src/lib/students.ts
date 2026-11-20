import type { FacetFilters, Student, StudentStatus, YearLevel } from "@/types/student.types";

/**
 * - `loa` / `inactive`: the enrollment says so (not eligible to vote).
 * - `enrolled`: active and enrolled in the current term.
 * - `not-updated`: no enrollment yet, or still on an older term.
 */
export function getStudentStatus(student: Student, currentTermId: string | null): StudentStatus {
  if (student.enrollmentStatus === "Loa") return "loa";
  if (student.enrollmentStatus === "Inactive" || student.enrollmentStatus === "Graduated") return "inactive";
  return student.term !== null && student.term === currentTermId ? "enrolled" : "not-updated";
}

/** `1` → "1st" … `4` → "4th"; senior high grades → "G11". */
export function formatYear(year: YearLevel | null): string {
  if (year === null) return "—";
  if (year >= 1 && year <= 4) return ["1st", "2nd", "3rd", "4th"][year - 1];
  return `G${year}`;
}

export function formatStudentName(student: Pick<Student, "lastName" | "firstName">): string {
  return `${student.lastName}, ${student.firstName}`;
}

/** Two-letter initials: last name + first name ("Acosta, Angelina" → "AA"). */
export function getStudentInitials(student: Pick<Student, "lastName" | "firstName">): string {
  return `${student.lastName.trim()[0] ?? ""}${student.firstName.trim()[0] ?? ""}`.toUpperCase();
}

export const EMAIL_DOMAIN = "legazpi.sti.edu.ph";

/** `acosta.799331@legazpi.sti.edu.ph`: last name (letters only) + last 6 digits of the student no. */
export function buildStudentEmail(lastName: string, studentNo: string): string {
  const name = lastName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  return `${name}.${studentNo.slice(-6)}@${EMAIL_DOMAIN}`;
}

export const NO_FACETS: FacetFilters = { programs: [], years: [], terms: [], statuses: [] };

/** Number of selected filter values (the badge on the Filters button). */
export function countFacets(f: FacetFilters): number {
  return f.programs.length + f.years.length + f.terms.length + f.statuses.length;
}

export function countByStatus(students: readonly Student[], currentTermId: string | null): Record<StudentStatus, number> {
  const counts: Record<StudentStatus, number> = { enrolled: 0, "not-updated": 0, loa: 0, inactive: 0 };
  for (const s of students) counts[getStudentStatus(s, currentTermId)]++;
  return counts;
}

/**
 * Within a group the values are OR-ed (BSIT or BSCS), groups are AND-ed
 * (BSIT and TRM-00004). The search matches student no. or name.
 */
export function matchesFilters(student: Student, query: string, f: FacetFilters, currentTermId: string | null): boolean {
  if (f.programs.length && (student.program === null || !f.programs.includes(student.program))) return false;
  if (f.years.length && (student.year === null || !f.years.includes(student.year))) return false;
  if (f.terms.length && (student.term === null || !f.terms.includes(student.term))) return false;
  if (f.statuses.length && !f.statuses.includes(getStudentStatus(student, currentTermId))) return false;

  const needle = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (!needle) return true;
  const haystack = [
    student.studentNo,
    formatStudentName(student),
    `${student.firstName} ${student.middleName ?? ""} ${student.lastName}`,
  ]
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ");
  return haystack.includes(needle);
}

export const STUDENT_NO_PATTERN = /^\d{11}$/;

