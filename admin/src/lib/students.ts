import { CURRENT_TERM, PROGRAMS, buildStudentEmail } from "@/lib/mock/students.mock";
import type { FacetFilters, ProgramCode, Student, StudentStatus, YearLevel } from "@/types/student.types";

export function getStudentStatus(student: Student): StudentStatus {
  if (student.inactive) return "loa";
  return student.term === CURRENT_TERM ? "enrolled" : "not-updated";
}

export function formatYear(year: YearLevel): string {
  return ["1st", "2nd", "3rd", "4th"][year - 1];
}

export function formatStudentName(student: Pick<Student, "lastName" | "firstName">): string {
  return `${student.lastName}, ${student.firstName}`;
}

/** Two-letter initials: last name + first name ("Acosta, Angelina" → "AA"). */
export function getStudentInitials(student: Pick<Student, "lastName" | "firstName">): string {
  return `${student.lastName.trim()[0] ?? ""}${student.firstName.trim()[0] ?? ""}`.toUpperCase();
}

export const NO_FACETS: FacetFilters = { programs: [], years: [], terms: [], statuses: [] };

/** Number of selected filter values (the badge on the Filters button). */
export function countFacets(f: FacetFilters): number {
  return f.programs.length + f.years.length + f.terms.length + f.statuses.length;
}

export function countByStatus(students: readonly Student[]): Record<StudentStatus, number> {
  const counts: Record<StudentStatus, number> = { enrolled: 0, "not-updated": 0, loa: 0 };
  for (const s of students) counts[getStudentStatus(s)]++;
  return counts;
}

/**
 * Within a group the values are OR-ed (BSIT or BSCS), groups are AND-ed
 * (BSIT and TRM-00004). The search matches student no. or name.
 */
export function matchesFilters(student: Student, query: string, f: FacetFilters): boolean {
  if (f.programs.length && !f.programs.includes(student.program)) return false;
  if (f.years.length && !f.years.includes(student.year)) return false;
  if (f.terms.length && !f.terms.includes(student.term)) return false;
  if (f.statuses.length && !f.statuses.includes(getStudentStatus(student))) return false;

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
/*                         CSV import (frontend preview)                       */
/* -------------------------------------------------------------------------- */

export const CSV_COLUMNS = ["student_no", "last_name", "first_name", "middle_name", "program", "year", "term"] as const;

export const SAMPLE_CSV = [
  CSV_COLUMNS.join(","),
  "02000301884,Alfane,Jan Clarence,,BSIT,2,TRM-00004",
  "02000645840,Cruz,Aeron Aries,,BSIT,4,TRM-00004",
  "02000771020,Navarro,Lance Adrian,Reyes,BSCS,1,TRM-00004",
  '02000771021,"De Leon",Mikaela,,STEM,1,TRM-00004',
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

export type ImportRowResult =
  | { line: number; action: "new" | "update"; student: Student }
  | { line: number; action: "error"; studentNo: string; reason: string };

function parseYear(value: string): YearLevel | null {
  const n = Number.parseInt(value, 10);
  return n >= 1 && n <= 4 ? (n as YearLevel) : null;
}

/**
 * Turns CSV text into upsert results against `existing`: rows whose student no.
 * exists become updates (term & year), the rest are new students.
 */
export function previewCsvImport(text: string, existing: readonly Student[]): { results: ImportRowResult[]; error?: string } {
  const rows = parseCsv(text.replace(/^﻿/, ""));
  if (rows.length === 0) return { results: [], error: "The file is empty." };

  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/[\s.]+/g, "_"));
  const index = Object.fromEntries(CSV_COLUMNS.map((column) => [column, header.indexOf(column)]));
  const missing = ["student_no", "last_name", "first_name"].filter((column) => index[column] < 0);
  if (missing.length) return { results: [], error: `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.` };

  const byNo = new Map(existing.map((s) => [s.studentNo, s]));
  const seen = new Set<string>();
  const cell = (row: string[], column: (typeof CSV_COLUMNS)[number]) => (index[column] >= 0 ? (row[index[column]] ?? "").trim() : "");

  const results = rows.slice(1).map<ImportRowResult>((row, i) => {
    const line = i + 2;
    const studentNo = cell(row, "student_no");
    const fail = (reason: string): ImportRowResult => ({ line, action: "error", studentNo, reason });

    if (!STUDENT_NO_PATTERN.test(studentNo)) return fail("Student no. must be 11 digits");
    if (seen.has(studentNo)) return fail("Duplicate row in file");
    seen.add(studentNo);

    const lastName = cell(row, "last_name");
    const firstName = cell(row, "first_name");
    if (!lastName || !firstName) return fail("Missing name");

    const programRaw = cell(row, "program").toUpperCase();
    const program: ProgramCode | null = PROGRAMS.find((p) => p.toUpperCase() === programRaw) ?? null;
    if (programRaw && !program) return fail(`Unknown program "${programRaw}"`);

    const yearRaw = cell(row, "year");
    const year = yearRaw ? parseYear(yearRaw) : null;
    if (yearRaw && !year) return fail("Year must be 1–4");

    const term = cell(row, "term").toUpperCase() || CURRENT_TERM;
    if (!/^TRM-\d{5}$/.test(term)) return fail("Term must look like TRM-00004");

    const current = byNo.get(studentNo);
    if (current) {
      return { line, action: "update", student: { ...current, term, year: year ?? current.year } };
    }
    const middleName = cell(row, "middle_name") || undefined;
    return {
      line,
      action: "new",
      student: {
        studentNo,
        lastName,
        firstName,
        middleName,
        email: buildStudentEmail(lastName, studentNo),
        program: program ?? "BSIT",
        year: year ?? 1,
        term,
        inactive: false,
      },
    };
  });

  return { results };
}
