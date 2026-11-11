import type { FacetFilters, Student, StudentCatalog, StudentStatus, YearLevel } from "@/types/student.types";

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

export const CSV_COLUMNS = ["student_no", "last_name", "first_name", "middle_name", "career", "program", "year", "term", "email"] as const;

/** Loose email check (the backend also requires `x@y.z`). */
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Sample file using the first career and the current term from the catalog. */
export function buildSampleCsv(catalog: StudentCatalog): string {
  const career = catalog.careers[0]?.code ?? "TER";
  const program = catalog.programs.includes("BSIT") ? "BSIT" : (catalog.programs[0] ?? "BSIT");
  const term = catalog.currentTerm?.id ?? "TRM-00001";
  return [
    CSV_COLUMNS.join(","),
    `02000301884,Alfane,Jan Clarence,,${career},${program},2,${term},${buildStudentEmail("Alfane", "02000301884")}`,
    `02000645840,Cruz,Aeron Aries,,${career},${program},4,${term},${buildStudentEmail("Cruz", "02000645840")}`,
    `02000771020,Navarro,Lance Adrian,Reyes,${career},${program},1,${term},${buildStudentEmail("Navarro", "02000771020")}`,
    // Email left blank: it's generated from the last name and student no.
    `02000771021,"De Leon",Mikaela,,${career},${program},1,${term},`,
  ].join("\n");
}

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

/**
 * Turns CSV text into upsert results against `existing`: rows whose student no.
 * exists become enrollment updates (term & year), the rest are new students.
 * Values are checked against the terms, programs and careers in `catalog`.
 */
export function previewCsvImport(
  text: string,
  existing: readonly Student[],
  catalog: StudentCatalog,
): { results: ImportRowResult[]; error?: string } {
  const rows = parseCsv(text.replace(/^﻿/, ""));
  if (rows.length === 0) return { results: [], error: "The file is empty." };

  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/[\s.]+/g, "_"));
  const index = Object.fromEntries(CSV_COLUMNS.map((column) => [column, header.indexOf(column)]));
  const missing = ["student_no", "last_name", "first_name"].filter((column) => index[column] < 0);
  if (missing.length) return { results: [], error: `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.` };

  const byNo = new Map(existing.map((s) => [s.studentNo, s]));
  const termIds = new Set(catalog.terms.map((t) => t.id));
  const careerCodes = catalog.careers.map((c) => c.code);
  const onlyCareer = careerCodes.length === 1 ? careerCodes[0] : null;
  const seen = new Set<string>();
  const seenEmails = new Set<string>();
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
    const program = catalog.programs.find((p) => p.toUpperCase() === programRaw) ?? null;
    if (programRaw && !program) return fail(`Unknown program "${programRaw}"`);

    const careerRaw = cell(row, "career").toUpperCase();
    const career = careerCodes.find((c) => c.toUpperCase() === careerRaw) ?? null;
    if (careerRaw && !career) return fail(`Unknown career "${careerRaw}"`);

    const yearRaw = cell(row, "year");
    const year = yearRaw ? Number.parseInt(yearRaw, 10) : null;
    if (yearRaw && (year === null || !catalog.yearLevels.includes(year))) {
      return fail(`Year must be one of ${catalog.yearLevels.join(", ")}`);
    }

    const term = cell(row, "term").toUpperCase() || catalog.currentTerm?.id || "";
    if (!term) return fail("Missing term (no term exists yet)");
    if (!termIds.has(term)) return fail(`Unknown term "${term}"`);

    const current = byNo.get(studentNo);
    if (current) {
      if (!current.careerCode || !current.program || current.year === null) {
        return fail("Existing student has no enrollment to update");
      }
      return {
        line,
        action: "update",
        student: {
          ...current,
          careerCode: career ?? current.careerCode,
          program: program ?? current.program,
          year: year ?? current.year,
          term,
        },
      };
    }

    const careerCode = career ?? onlyCareer;
    if (!careerCode) return fail("Missing career");
    if (!program) return fail("Missing program");
    if (year === null) return fail("Missing year");

    // The file's email when given, otherwise lastname.123456@legazpi.sti.edu.ph.
    const email = cell(row, "email").toLowerCase() || buildStudentEmail(lastName, studentNo);
    if (!EMAIL_PATTERN.test(email)) return fail(`Invalid email "${email}"`);
    if (seenEmails.has(email)) return fail("Email used twice in file");
    seenEmails.add(email);

    return {
      line,
      action: "new",
      student: {
        studentNo,
        lastName,
        firstName,
        middleName: cell(row, "middle_name") || undefined,
        email,
        careerCode,
        program,
        year,
        term,
        enrollmentStatus: "Active",
      },
    };
  });

  return { results };
}
