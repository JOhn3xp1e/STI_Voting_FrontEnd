import { parseCsv } from "@/lib/students";
import type { Career, CareerInput, Program, ProgramInput } from "@/types/program.types";

/** Grade levels a career can cover (kinder = 0 … grade 12; college years are 1–4). Same as the backend. */
export const LEVELS = Array.from({ length: 13 }, (_, i) => i);

/** Two-letter badge: BSIT → IT, BSCpE → CE, BSTM → TM, STEM → ST. */
export function programInitials(code: string): string {
  const rest = code.replace(/^(BS|AB|BA)(?=[A-Z])/, "");
  const capitals = rest.replace(/[^A-Z0-9]/g, "");
  return (capitals.length >= 2 ? capitals : rest.toUpperCase()).slice(0, 2);
}

/** "1–4", "11–12", "7" or "—". */
export function formatLevels(career: Pick<Career, "minLevel" | "maxLevel">): string {
  const { minLevel: min, maxLevel: max } = career;
  if (min === null || max === null) return "—";
  return min === max ? String(min) : `${min}–${max}`;
}

/** Tab label: a short name ("Tertiary"), else the code ("SHS"). */
export function careerTabLabel(career: Career): string {
  return career.name.length <= 10 ? career.name : career.code;
}

export const sortCareers = (careers: readonly Career[]) =>
  [...careers].sort((a, b) => (a.minLevel ?? 99) - (b.minLevel ?? 99) || a.code.localeCompare(b.code));

export const sortPrograms = (programs: readonly Program[]) => [...programs].sort((a, b) => a.code.localeCompare(b.code));

/* -------------------------------------------------------------------------- */
/*                                 Validation                                 */
/* -------------------------------------------------------------------------- */

export type CareerErrors = Partial<Record<"code" | "name" | "levels", string>>;
export type ProgramErrors = Partial<Record<"code" | "name", string>>;

/** Same rules as the backend: code format, levels 0–12 in order, no overlap with another career. */
export function validateCareer(input: CareerInput, careers: readonly Career[], editingCode?: string): CareerErrors {
  const errors: CareerErrors = {};
  const code = input.code.trim().toUpperCase();
  if (!editingCode) {
    if (!/^[A-Z0-9-]{2,10}$/.test(code)) errors.code = "2–10 letters or numbers, e.g. TER.";
    else if (careers.some((c) => c.code.toUpperCase() === code)) errors.code = `${code} already exists.`;
  }
  if (!input.name.trim()) errors.name = "Required.";
  if (input.minLevel > input.maxLevel) errors.levels = "The first level can't be higher than the last.";
  else {
    const overlap = careers.find(
      (c) => c.code !== editingCode && c.minLevel !== null && c.maxLevel !== null && input.minLevel <= c.maxLevel && c.minLevel <= input.maxLevel,
    );
    if (overlap) errors.levels = `Overlaps ${overlap.code} (${formatLevels(overlap)}).`;
  }
  return errors;
}

export function validateProgram(input: ProgramInput, programs: readonly Program[], editingCode?: string): ProgramErrors {
  const errors: ProgramErrors = {};
  if (!editingCode) {
    const code = input.code.trim();
    if (!/^[A-Za-z0-9-]{2,12}$/.test(code)) errors.code = "2–12 letters or numbers, e.g. BSIT.";
    else if (programs.some((p) => p.code.toUpperCase() === code.toUpperCase())) errors.code = `${code.toUpperCase()} already exists.`;
  }
  if (!input.name.trim()) errors.name = "Required.";
  return errors;
}

/* -------------------------------------------------------------------------- */
/*                              Program CSV import                            */
/* -------------------------------------------------------------------------- */

export const PROGRAM_CSV_COLUMNS = ["code", "name"] as const;

export const SAMPLE_PROGRAMS_CSV = [
  PROGRAM_CSV_COLUMNS.join(","),
  "BSIT,BS Information Technology",
  "BSCS,BS Computer Science",
  "BSTM,BS Tourism Management",
  "STEM,Science Technology Engineering and Mathematics",
].join("\n");

export type ProgramImportRow =
  | { line: number; action: "new" | "update" | "same"; code: string; name: string }
  | { line: number; action: "error"; code: string; reason: string };

/** Matches rows to existing programs by code: new codes are added, existing ones get their name updated. */
export function previewProgramImport(text: string, programs: readonly Program[]): { rows: ProgramImportRow[]; error?: string } {
  const table = parseCsv(text.replace(/^﻿/, ""));
  if (table.length === 0) return { rows: [], error: "The file is empty." };

  const header = table[0].map((h) => h.trim().toLowerCase());
  const codeAt = header.findIndex((h) => h === "code" || h === "program" || h === "program code");
  const nameAt = header.findIndex((h) => h === "name" || h === "program name" || h === "description");
  if (codeAt < 0 || nameAt < 0) return { rows: [], error: "The first row must be: code, name." };

  const byCode = new Map(programs.map((p) => [p.code.toUpperCase(), p]));
  const seen = new Set<string>();
  const rows = table.slice(1).map<ProgramImportRow>((cells, i) => {
    const line = i + 2;
    const code = (cells[codeAt] ?? "").trim().toUpperCase();
    const name = (cells[nameAt] ?? "").trim();
    const fail = (reason: string): ProgramImportRow => ({ line, action: "error", code, reason });

    if (!/^[A-Z0-9-]{2,12}$/.test(code)) return fail("Code must be 2–12 letters or numbers");
    if (seen.has(code)) return fail("Listed twice in the file");
    seen.add(code);
    if (!name) return fail("Missing name");

    const existing = byCode.get(code);
    if (!existing) return { line, action: "new", code, name };
    return { line, action: existing.name === name ? "same" : "update", code: existing.code, name };
  });
  if (rows.length === 0) return { rows, error: "The file has a header row but no programs." };
  return { rows };
}
