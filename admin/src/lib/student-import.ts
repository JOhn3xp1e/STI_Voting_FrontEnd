import type { CareerOption, Student, StudentCatalog, YearLevel } from "@/types/student.types";

import { STUDENT_NO_PATTERN, buildStudentEmail } from "./students";

/*
 * CSV import for the Students page: parse the file, sort every row into
 * new / already enrolled / changed / error, and work out what to save.
 * Nothing here talks to the API; the dialog applies the plan.
 */

export const CSV_COLUMNS = ["student_no", "last_name", "first_name", "middle_name", "career", "program", "year", "term", "email"] as const;

export const CSV_MAX_BYTES = 5 * 1024 * 1024;

/** Loose email check (the backend also requires `x@y.z`). */
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/* -------------------------------------------------------------------------- */
/*                                   Careers                                  */
/* -------------------------------------------------------------------------- */

/** The career a program is listed under (programs belong to one career). */
export function careerForProgram(program: string, careers: readonly CareerOption[]): CareerOption | null {
  const code = program.toUpperCase();
  return careers.find((c) => c.programs.includes(code)) ?? null;
}

/** Year levels a career allows: its own range when known, else the catalog's levels. */
export function careerLevels(career: CareerOption | null, fallback: readonly YearLevel[]): YearLevel[] {
  if (career && career.minLevel !== null && career.maxLevel !== null) {
    return Array.from({ length: career.maxLevel - career.minLevel + 1 }, (_, i) => career.minLevel! + i);
  }
  return [...fallback];
}

/* -------------------------------------------------------------------------- */
/*                                   Parsing                                  */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/*                                  Analysis                                  */
/* -------------------------------------------------------------------------- */

export type ImportKind = "new" | "enrolled" | "changed" | "error";

/** The cell an error points at (highlighted in red in the review table). */
export type ImportField = "studentNo" | "name" | "career" | "program" | "year" | "term" | "email" | "row";

export interface ImportChange {
  field: "program" | "year";
  from: string;
  to: string;
}

export interface ImportRow {
  /** Line in the file (the header is line 1). */
  line: number;
  kind: ImportKind;
  /** As written in the file, for display. */
  raw: { studentNo: string; lastName: string; firstName: string; program: string; year: string };
  /** `error`: what's wrong and where. */
  error?: { field: ImportField; message: string };
  /** `new`: the student to create. `changed` / `enrolled`: the enrollment as the file has it. */
  student?: Student;
  /** `enrolled` / `changed`: the student as they are now. */
  current?: Student;
  /** `changed`: the program / year differences. */
  changes?: ImportChange[];
  /** `enrolled` / `changed`: the file enrolls them in another term than their current one. */
  termMove?: boolean;
}

export interface ImportAnalysis {
  rows: ImportRow[];
  /** The term most rows enroll into (shown as "Enrolling into …"). */
  term: string | null;
  /** A problem with the whole file (empty, missing columns); no rows then. */
  error?: string;
}

/**
 * Reads CSV text against the roster and catalog. Rows are matched by student no.:
 * unknown numbers are new students; known ones are "already enrolled" when the
 * program and year match, or "changed" when they differ (the admin picks which
 * to keep). Names, numbers and emails of existing students are never changed.
 */
export function analyzeCsvImport(text: string, existing: readonly Student[], catalog: StudentCatalog): ImportAnalysis {
  const rows = parseCsv(text.replace(/^﻿/, ""));
  if (rows.length === 0) return { rows: [], term: null, error: "The file is empty." };

  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/[\s.]+/g, "_"));
  const index = Object.fromEntries(CSV_COLUMNS.map((column) => [column, header.indexOf(column)]));
  const missing = ["student_no", "last_name", "first_name"].filter((column) => index[column] < 0);
  if (missing.length) {
    return { rows: [], term: null, error: `This file is missing the ${missing.join(", ")} column${missing.length > 1 ? "s" : ""}. Use the template.` };
  }
  if (rows.length === 1) return { rows: [], term: null, error: "The file has a header but no students." };

  const byNo = new Map(existing.map((s) => [s.studentNo, s]));
  const byEmail = new Map(existing.map((s) => [s.email.toLowerCase(), s.studentNo]));
  const termIds = new Set(catalog.terms.map((t) => t.id));
  const programs = new Map(catalog.programs.map((p) => [p.toUpperCase(), p]));
  const onlyCareer = catalog.careers.length === 1 ? catalog.careers[0] : null;
  const seen = new Set<string>();
  const seenEmails = new Set<string>();
  const cell = (row: string[], column: (typeof CSV_COLUMNS)[number]) => (index[column] >= 0 ? (row[index[column]] ?? "").trim() : "");

  const result = rows.slice(1).map<ImportRow>((row, i) => {
    const line = i + 2;
    const raw = {
      studentNo: cell(row, "student_no"),
      lastName: cell(row, "last_name"),
      firstName: cell(row, "first_name"),
      program: cell(row, "program").toUpperCase(),
      year: cell(row, "year"),
    };
    const fail = (field: ImportField, message: string): ImportRow => ({ line, kind: "error", raw, error: { field, message } });

    const { studentNo, lastName, firstName } = raw;
    if (!STUDENT_NO_PATTERN.test(studentNo)) return fail("studentNo", studentNo ? `Student no. '${studentNo}' must be 11 digits` : "Missing student no.");
    if (seen.has(studentNo)) return fail("studentNo", "This student no. appears twice in the file");
    seen.add(studentNo);
    if (!lastName || !firstName) return fail("name", `Missing ${!lastName ? "last" : "first"} name`);

    const program = raw.program ? (programs.get(raw.program) ?? null) : null;
    if (raw.program && !program) return fail("program", `Program '${raw.program}' doesn't exist`);

    const careerRaw = cell(row, "career").toUpperCase();
    const fileCareer = careerRaw ? (catalog.careers.find((c) => c.code.toUpperCase() === careerRaw) ?? null) : null;
    if (careerRaw && !fileCareer) return fail("career", `Career '${careerRaw}' doesn't exist`);

    const current = byNo.get(studentNo);
    const currentCareer = current?.careerCode ? (catalog.careers.find((c) => c.code === current.careerCode) ?? null) : null;
    const career = fileCareer ?? (program ? careerForProgram(program, catalog.careers) : null) ?? currentCareer ?? onlyCareer;
    if (program && career && career.programs.length > 0 && !career.programs.includes(program.toUpperCase())) {
      return fail("program", `${program} isn't a ${career.code} program`);
    }

    const year = raw.year ? Number.parseInt(raw.year, 10) : null;
    if (raw.year) {
      const allowed = careerLevels(career, catalog.yearLevels);
      if (year === null || Number.isNaN(year) || !allowed.includes(year)) {
        return fail(
          "year",
          career && career.minLevel !== null && career.maxLevel !== null
            ? `Year ${raw.year} isn't valid for ${career.code} (${career.minLevel}–${career.maxLevel})`
            : `Year ${raw.year} isn't a valid year level`,
        );
      }
    }

    const termRaw = cell(row, "term").toUpperCase();
    const term = termRaw || catalog.currentTerm?.id || "";
    if (!term) return fail("term", "Missing term (no term exists yet)");
    if (!termIds.has(term)) return fail("term", `Term '${termRaw}' doesn't exist`);

    /* ------------------------------ existing student ----------------------------- */
    if (current) {
      if (!current.careerCode || current.year === null) return fail("row", "This student has no enrollment to update yet");
      const nextProgram = program ?? current.program;
      const nextYear = year ?? current.year;
      const changes: ImportChange[] = [];
      if ((nextProgram ?? "") !== (current.program ?? "")) changes.push({ field: "program", from: current.program ?? "—", to: nextProgram ?? "—" });
      if (nextYear !== current.year) changes.push({ field: "year", from: String(current.year), to: String(nextYear) });
      const student: Student = {
        ...current,
        careerCode: (program ? career?.code : null) ?? current.careerCode,
        program: nextProgram,
        year: nextYear,
        term,
      };
      return { line, kind: changes.length ? "changed" : "enrolled", raw, student, current, changes, termMove: current.term !== term };
    }

    /* -------------------------------- new student -------------------------------- */
    if (!career) return fail("career", "Missing career");
    if (!program && career.programs.length > 0) return fail("program", "Missing program");
    if (year === null) return fail("year", "Missing year");

    // The file's email when given, otherwise lastname.123456@legazpi.sti.edu.ph.
    const email = cell(row, "email").toLowerCase() || buildStudentEmail(lastName, studentNo);
    if (!EMAIL_PATTERN.test(email)) return fail("email", `Email '${email}' isn't valid`);
    if (seenEmails.has(email)) return fail("email", "This email appears twice in the file");
    const owner = byEmail.get(email);
    if (owner) return fail("email", `Email already used by ${owner}`);
    seenEmails.add(email);

    return {
      line,
      kind: "new",
      raw,
      student: {
        studentNo,
        lastName,
        firstName,
        middleName: cell(row, "middle_name") || undefined,
        email,
        careerCode: career.code,
        program,
        year,
        term,
        enrollmentStatus: "Active",
      },
    };
  });

  // Most common term among the usable rows.
  const tally = new Map<string, number>();
  for (const r of result) if (r.student?.term) tally.set(r.student.term, (tally.get(r.student.term) ?? 0) + 1);
  const term = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? catalog.currentTerm?.id ?? null;

  return { rows: result, term };
}

/* -------------------------------------------------------------------------- */
/*                                    Plan                                    */
/* -------------------------------------------------------------------------- */

/** For a changed row: keep the current program / year, or take the file's. */
export type ChangeChoice = "current" | "file";

export interface ImportPlan {
  /** Students to create. */
  added: Student[];
  /** Enrollments to replace (program / year from the file, or a term move). */
  updated: Student[];
  counts: {
    added: number;
    /** Changed rows saved with the file's program / year. */
    fromFile: number;
    /** Changed rows that keep their current program / year. */
    keptCurrent: number;
    /** Existing students whose enrollment stays exactly as it is. */
    unchanged: number;
    /** Existing students only moved to the file's term. */
    moved: number;
    /** Rows with errors left out. */
    skipped: number;
    /** Existing students whose enrollment stays exactly as it is (already enrolled or kept, not moved). */
    stays: number;
  };
}

/** What Import will save, given the choices for changed rows. Error rows are left out. */
export function planImport(rows: readonly ImportRow[], choices: Readonly<Record<number, ChangeChoice>>): ImportPlan {
  const added: Student[] = [];
  const updated: Student[] = [];
  const counts = { added: 0, fromFile: 0, keptCurrent: 0, unchanged: 0, moved: 0, skipped: 0, stays: 0 };

  for (const row of rows) {
    if (row.kind === "error") {
      counts.skipped++;
    } else if (row.kind === "new") {
      added.push(row.student!);
      counts.added++;
    } else if (row.kind === "changed" && (choices[row.line] ?? "current") === "file") {
      updated.push(row.student!);
      counts.fromFile++;
    } else {
      // Already enrolled, or changed but kept as current: only the term may move.
      if (row.kind === "changed") counts.keptCurrent++;
      if (row.termMove) {
        updated.push({ ...row.current!, term: row.student!.term });
        counts.moved++;
      } else {
        counts.stays++;
        if (row.kind === "enrolled") counts.unchanged++;
      }
    }
  }
  return { added, updated, counts };
}

/* -------------------------------------------------------------------------- */
/*                                Sample files                                */
/* -------------------------------------------------------------------------- */

const csvLine = (values: readonly (string | number | null | undefined)[]) =>
  values.map((v) => (v === null || v === undefined ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(",");

/** Header plus one example row. */
export function buildCsvTemplate(catalog: StudentCatalog): string {
  const career = catalog.careers.find((c) => c.programs.length > 0) ?? catalog.careers[0];
  const program = career?.programs[0] ?? catalog.programs[0] ?? "BSIT";
  const term = catalog.currentTerm?.id ?? "TRM-00001";
  return [CSV_COLUMNS.join(","), csvLine(["02000799331", "Acosta", "Angelina Kate", "Millena", career?.code ?? "TER", program, 1, term, ""])].join("\n");
}

/**
 * A small file that shows every kind of row: three new students, a few of the
 * roster's students as they are, and one whose year changed. `withErrors` adds
 * three broken rows (unknown program, short student no., year out of range).
 */
export function buildSampleCsv(catalog: StudentCatalog, existing: readonly Student[], withErrors: boolean): string {
  const career = catalog.careers.find((c) => c.programs.length > 0) ?? catalog.careers[0];
  const levels = careerLevels(career ?? null, catalog.yearLevels);
  const program = career?.programs[0] ?? catalog.programs[0] ?? "BSIT";
  const term = catalog.currentTerm?.id ?? "TRM-00001";
  const code = career?.code ?? "TER";
  const lines: string[] = [CSV_COLUMNS.join(",")];

  const used = new Set(existing.map((s) => s.studentNo));
  const freshNo = (seed: number) => {
    let n = 2000999100 + seed;
    while (used.has(`0${n}`)) n += 7;
    used.add(`0${n}`);
    return `0${n}`;
  };
  lines.push(csvLine([freshNo(1), "Dela Cruz", "Juan", "Santos", code, program, levels[0], term, ""]));
  lines.push(csvLine([freshNo(2), "Reyes", "Ana Marie", "Lopez", code, program, levels[1] ?? levels[0], term, ""]));
  lines.push(csvLine([freshNo(3), "Bañez", "Carlo", "Villanueva", code, program, levels[2] ?? levels[0], term, ""]));

  const enrolled = existing.filter((s) => s.careerCode && s.program && s.year !== null).slice(0, 4);
  enrolled.forEach((s, i) => {
    const studentCareer = catalog.careers.find((c) => c.code === s.careerCode) ?? null;
    const allowed = careerLevels(studentCareer, catalog.yearLevels);
    // The first one's year moves up a level, so the file has a change to choose on.
    const year = i === 0 ? (allowed.find((y) => y > s.year!) ?? allowed.find((y) => y !== s.year) ?? s.year) : s.year;
    lines.push(csvLine([s.studentNo, s.lastName, s.firstName, s.middleName, s.careerCode, s.program, year, term, s.email]));
  });

  if (withErrors) {
    const max = career?.maxLevel ?? Math.max(...levels);
    lines.push(csvLine([freshNo(4), "Bermudo", "Kyle Andrei", "", code, `${program}T`, levels[1] ?? levels[0], term, ""]));
    lines.push(csvLine(["2000277180", "Llorin", "Patricia Mae", "", code, program, levels[2] ?? levels[0], term, ""]));
    lines.push(csvLine([freshNo(5), "Tuazon", "Mark Vincent", "", code, program, max + 1, term, ""]));
  }
  return lines.join("\n");
}
