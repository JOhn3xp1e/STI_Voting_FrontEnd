import type { StudentImportRow } from "@/services/students/students.service";
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

/* -------------------------------------------------------------------------- */
/*                                 CSV import                                 */
/* -------------------------------------------------------------------------- */

/** Columns of the school's student list, in order (also used for the sample file). */
export const IMPORT_COLUMNS = ["Full Name", "Program", "Level", "Student ID", "Email"] as const;

/** Which `StudentImportRow` field each column fills. */
const IMPORT_FIELDS: Record<(typeof IMPORT_COLUMNS)[number], keyof StudentImportRow> = {
  "Full Name": "fullName",
  Program: "program",
  Level: "level",
  "Student ID": "studentId",
  Email: "email",
};

/** Fictional sample rows in the school's format. */
export const SAMPLE_IMPORT_CSV = [
  IMPORT_COLUMNS.join(","),
  `"Dela Cruz, Juan Miguel Santos",BSIT,1Y1,02000123451,${buildStudentEmail("Dela Cruz", "02000123451")}`,
  `"Reyes, Maria Clara",BSIT,2Y1,02000123452,${buildStudentEmail("Reyes", "02000123452")}`,
  `"Santos, Paolo",BSCS,3Y1,02000123453,${buildStudentEmail("Santos", "02000123453")}`,
  `"Garcia, Andrea Lim",BSIT,4Y1,02000123454,${buildStudentEmail("Garcia", "02000123454")}`,
].join("\n");

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** "Student ID", "student_id" and "StudentID" all match. */
const normalizeHeader = (header: string) => header.trim().toLowerCase().replace(/[^a-z]/g, "");

/**
 * Reads the school's student list (Full Name, Program, Level, Student ID, Email)
 * into rows for the backend import. Validation of each row happens on the backend.
 */
export function readStudentImport(text: string): { rows: StudentImportRow[]; error?: string } {
  const table = parseCsv(text.replace(/^﻿/, ""));
  if (table.length === 0) return { rows: [], error: "The file is empty." };

  const header = table[0].map(normalizeHeader);
  const index = IMPORT_COLUMNS.map((column) => header.indexOf(normalizeHeader(column)));
  const missing = IMPORT_COLUMNS.filter((_, i) => index[i] < 0);
  if (missing.length) {
    return {
      rows: [],
      error: `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. The first row must be: ${IMPORT_COLUMNS.join(", ")}.`,
    };
  }

  const rows = table.slice(1).map((cells) => {
    const row = {} as StudentImportRow;
    IMPORT_COLUMNS.forEach((column, i) => {
      row[IMPORT_FIELDS[column]] = (cells[index[i]] ?? "").trim();
    });
    return row;
  });
  if (rows.length === 0) return { rows, error: "The file has a header row but no students." };
  return { rows };
}

/** Program codes in the file that aren't in the Programs list, with how many rows use each. */
export function findUnknownPrograms(rows: readonly StudentImportRow[], programs: readonly string[]): { code: string; count: number }[] {
  const known = new Set(programs.map((p) => p.toUpperCase()));
  const counts = new Map<string, number>();
  for (const row of rows) {
    const code = row.program.trim().toUpperCase();
    if (code && !known.has(code)) counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return [...counts].map(([code, count]) => ({ code, count }));
}
