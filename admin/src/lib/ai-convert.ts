import type { Student, StudentCatalog } from "@/types/student.types";

import {
  LIMITS,
  nameKey,
  type ColumnProfile,
  type ConversionSpec,
  type ConvertContext,
  type NameSplit,
  type SpecChange,
  type TemplateField,
  type ValueRule,
} from "./ai-convert-spec";
import { CSV_COLUMNS, analyzeCsvImport, careerForProgram, type ImportField } from "./student-import";
import { EMAIL_DOMAIN, buildStudentEmail } from "./students";

/*
 * "Convert with AI", the browser half: read a class list in any layout (.xls,
 * .xlsx, .csv), apply Groq's rules (lib/ai-convert-spec.ts) to every row, check
 * the result the same way the CSV import does, and write the converted file.
 * Only column names, a few sample rows and given names ever leave the browser.
 */

export const CONVERT_MAX_BYTES = 5 * 1024 * 1024;
export const CONVERT_FILE_PATTERN = /\.(csv|xlsx?)$/i;

/* -------------------------------------------------------------------------- */
/*                                Reading files                               */
/* -------------------------------------------------------------------------- */

export interface SheetRecord {
  /** Row number in the sheet (1-based, as Excel shows it). */
  line: number;
  cells: string[];
}

export interface SheetData {
  fileName: string;
  size: number;
  /** Header names; unnamed columns become "Column C". */
  columns: string[];
  /** Rows under the header, blank ones included (they're counted, then removed). */
  records: SheetRecord[];
}

const colLetter = (index: number) => {
  let s = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

/** Reads the first sheet that has a table. Values come back as the sheet shows them (text). */
export async function readSheet(file: File): Promise<SheetData> {
  const XLSX = await import("xlsx");
  const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
  // CSV is read as text (keeps "Ñ" and leading zeros); `raw` stops SheetJS turning numbers into numbers.
  const workbook = isCsv
    ? XLSX.read((await file.text()).replace(/^﻿/, ""), { type: "string", raw: true, dense: true })
    : XLSX.read(await file.arrayBuffer(), { type: "array", dense: true });

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet?.["!ref"]) continue;
    const start = XLSX.utils.decode_range(sheet["!ref"]).s;
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "", blankrows: true });
    const rows = grid.map((row) => row.map((cell) => String(cell ?? "").replace(/\s+/g, " ").trim()));
    const shaped = shapeSheet(rows, start.r + 1, start.c);
    if (shaped) return { fileName: file.name, size: file.size, ...shaped };
  }
  throw new Error(`"${file.name}" has no table to convert.`);
}

/**
 * Finds the header (the first wide row of labels, so title rows above it are
 * skipped), drops empty columns and trailing empty rows, and blanks out header
 * rows repeated further down (printed lists repeat them on every page).
 */
function shapeSheet(rows: string[][], firstLine: number, firstCol: number): Omit<SheetData, "fileName" | "size"> | null {
  const filled = (row: string[]) => row.filter((c) => c !== "").length;
  const head = rows.slice(0, 60);
  const widest = Math.max(0, ...head.map(filled));
  if (widest === 0) return null;
  const need = Math.max(Math.min(2, widest), Math.ceil(widest * 0.6));
  const labels = (row: string[]) => row.filter((c) => /\p{L}/u.test(c)).length;

  let headerIndex = head.findIndex((row) => filled(row) >= need && labels(row) >= filled(row) * 0.6);
  if (headerIndex < 0) headerIndex = head.findIndex((row) => filled(row) >= need);
  const header = rows[headerIndex];
  const body = rows.slice(headerIndex + 1);
  const width = Math.max(header.length, ...body.map((r) => r.length));

  const keep: number[] = [];
  for (let j = 0; j < width; j++) if (header[j] || body.some((r) => r[j])) keep.push(j);

  const used = new Map<string, number>();
  const columns = keep.map((j) => {
    const base = header[j] || `Column ${colLetter(firstCol + j)}`;
    const n = (used.get(base.toLowerCase()) ?? 0) + 1;
    used.set(base.toLowerCase(), n);
    return n > 1 ? `${base} (${n})` : base;
  });

  const headerKey = keep.map((j) => (header[j] ?? "").toLowerCase()).join("|");
  const records = body.map<SheetRecord>((row, i) => {
    const cells = keep.map((j) => row[j] ?? "");
    const repeat = cells.map((c) => c.toLowerCase()).join("|") === headerKey;
    return { line: firstLine + headerIndex + 1 + i, cells: repeat ? cells.map(() => "") : cells };
  });
  while (records.length && records[records.length - 1].cells.every((c) => !c)) records.pop();
  return records.length ? { columns, records } : null;
}

/* -------------------------------------------------------------------------- */
/*                               What Groq sees                               */
/* -------------------------------------------------------------------------- */

const isBlank = (record: SheetRecord) => record.cells.every((c) => !c);

/** The first few rows with data, cells shortened. */
export function sampleRows(sheet: SheetData): string[][] {
  return sheet.records
    .filter((r) => !isBlank(r))
    .slice(0, LIMITS.sampleRows)
    .map((r) => r.cells.map((c) => c.slice(0, LIMITS.cellChars)));
}

/**
 * Per column: how full it is, and its values only when they repeat a lot
 * (LEVEL: 1Y1, 1Y2; PROGRAM: BSIT). Columns of mostly unique values (names,
 * student numbers, emails) only send their counts, even in a short file.
 */
export function profileColumns(sheet: SheetData): ColumnProfile[] {
  return sheet.columns.map((column, j) => {
    const values = sheet.records.map((r) => r.cells[j]).filter(Boolean);
    const distinct = new Set(values);
    const repetitive = distinct.size <= LIMITS.profileValues && distinct.size * 3 <= values.length;
    return {
      column,
      filled: values.length,
      distinct: distinct.size,
      ...(repetitive ? { values: [...distinct].map((v) => v.slice(0, 60)) } : {}),
    };
  });
}

export function convertContext(catalog: StudentCatalog): ConvertContext {
  return {
    careers: catalog.careers.map((c) => ({ code: c.code, name: c.name, programs: c.programs, minLevel: c.minLevel, maxLevel: c.maxLevel })),
    programs: catalog.programs.map((code) => ({ code, name: catalog.programNames[code] ?? code })),
    terms: catalog.terms.slice(0, 8).map((t) => ({ id: t.id, label: t.label })),
    currentTerm: catalog.currentTerm?.id ?? null,
    emailDomain: EMAIL_DOMAIN,
  };
}

/* -------------------------------------------------------------------------- */
/*                                    Names                                   */
/* -------------------------------------------------------------------------- */

/** Words that belong to the next word of a surname: "DELA CRUZ", "DE LOS SANTOS", "STA. ANA". */
const PARTICLES = new Set(["DE", "DEL", "DELA", "DELAS", "DELOS", "LA", "LAS", "LOS", "SAN", "STA", "STO", "SANTA", "SANTO", "DI", "DA", "VAN", "VON"]);
const SUFFIXES = new Set(["JR", "SR", "II", "III", "IV"]);
const bare = (word: string) => word.toUpperCase().replace(/[.,]/g, "");
const isInitial = (word: string) => /^\p{L}\.?$/u.test(word);

/** "ACOSTA" → "Acosta", "DELA CRUZ" → "Dela Cruz", "MA." → "Ma."; leaves mixed case ("McDonald") alone. */
export function titleCase(value: string): string {
  if (value !== value.toUpperCase() && value !== value.toLowerCase()) return value;
  return value
    .toLowerCase()
    .replace(/(^|[\s\-'’.(])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase())
    .replace(/\b(Ii|Iii|Iv)\b/g, (m) => m.toUpperCase());
}

interface NameParts {
  last: string;
  /** Given-name words, suffix removed. */
  given: string[];
  suffix: string[];
}

function fullNameParts(full: string, order: "last_first" | "first_last"): NameParts {
  let last: string[];
  let given: string[];
  const comma = full.indexOf(",");
  if (comma >= 0) {
    last = full.slice(0, comma).split(" ").filter(Boolean);
    given = full.slice(comma + 1).replace(/,/g, " ").split(" ").filter(Boolean);
  } else {
    const words = full.split(" ").filter(Boolean);
    if (order === "last_first") {
      let i = 0;
      while (i < words.length - 2 && PARTICLES.has(bare(words[i]))) i++;
      last = words.slice(0, i + 1);
      given = words.slice(i + 1);
    } else {
      let j = words.length - 1;
      while (j > 1 && PARTICLES.has(bare(words[j - 1]))) j--;
      last = words.slice(j);
      given = words.slice(0, j);
    }
  }
  const suffix = [...last, ...given].filter((w) => SUFFIXES.has(bare(w)));
  return {
    last: last.filter((w) => !SUFFIXES.has(bare(w))).join(" "),
    given: given.filter((w) => !SUFFIXES.has(bare(w))),
    suffix,
  };
}

/** Given names that need Groq: two or more words, not ending in an initial. */
const needsSplit = (given: string[]) => given.length >= 2 && !isInitial(given[given.length - 1]);

/**
 * First and middle name from the given-name words. A trailing initial is the
 * middle name; otherwise Groq's split, else a guess (the last word, for three
 * or more words) that's flagged when it can't be made.
 */
function splitGiven(given: string[], splits: Readonly<Record<string, NameSplit>>): { first: string[]; middle: string[]; sure: boolean } {
  if (given.length <= 1) return { first: given, middle: [], sure: true };
  if (!needsSplit(given)) return { first: given.slice(0, -1), middle: given.slice(-1), sure: true };
  const split = splits[nameKey(given.join(" "))];
  if (split) {
    const count = split.middle ? split.middle.split(" ").length : 0;
    return { first: given.slice(0, given.length - count), middle: given.slice(given.length - count), sure: split.sure };
  }
  if (given.length >= 3) {
    let j = given.length - 1;
    while (j > 1 && PARTICLES.has(bare(given[j - 1]))) j--;
    return { first: given.slice(0, j), middle: given.slice(j), sure: true };
  }
  return { first: given, middle: [], sure: false };
}

/* -------------------------------------------------------------------------- */
/*                                  Applying                                  */
/* -------------------------------------------------------------------------- */

interface CompiledRule {
  index: number;
  regex: RegExp | null;
  map: Map<string, string> | null;
  value: string;
}

function compileRule(rule: ValueRule, columns: readonly string[]): CompiledRule {
  let regex: RegExp | null = null;
  try {
    regex = rule.regex ? new RegExp(rule.regex, "i") : null;
  } catch {
    regex = null;
  }
  return {
    index: rule.column ? columns.indexOf(rule.column) : -1,
    regex,
    map: rule.map ? new Map(Object.entries(rule.map).map(([k, v]) => [k.toLowerCase(), v])) : null,
    value: rule.value ?? "",
  };
}

function pick(rule: CompiledRule, cells: readonly string[]): string {
  const raw = rule.index >= 0 ? (cells[rule.index] ?? "").slice(0, 200) : "";
  let out = raw;
  if (raw && rule.regex) {
    const match = rule.regex.exec(raw);
    out = match ? (match[1] ?? match[0]) : "";
  }
  if (raw && rule.map) out = rule.map.get(out.toLowerCase()) ?? rule.map.get(raw.toLowerCase()) ?? out;
  return (out || rule.value).trim();
}

const cellAt = (cells: readonly string[], columns: readonly string[], column: string | null) => (column ? (cells[columns.indexOf(column)] ?? "") : "");

/** Name parts of a row, before splitting first and middle names. */
function rowNames(cells: readonly string[], columns: readonly string[], spec: ConversionSpec): NameParts & { firstOnly?: string; middleOnly?: string } {
  if (spec.name.mode === "full") return fullNameParts(cellAt(cells, columns, spec.name.column), spec.name.order);
  return {
    last: cellAt(cells, columns, spec.name.last),
    given: [],
    suffix: [],
    firstOnly: cellAt(cells, columns, spec.name.first),
    middleOnly: cellAt(cells, columns, spec.name.middle),
  };
}

/** Distinct given names in the file that Groq should split (minus the ones already known). */
export function givenNamesToSplit(sheet: SheetData, spec: ConversionSpec, known: Readonly<Record<string, NameSplit>>): string[] {
  if (spec.name.mode !== "full") return [];
  const out = new Set<string>();
  for (const record of sheet.records) {
    const { given } = rowNames(record.cells, sheet.columns, spec);
    if (!needsSplit(given)) continue;
    const key = nameKey(given.join(" "));
    if (!(key in known)) out.add(key);
  }
  return [...out];
}

export type RowStatus = "ready" | "check" | "error";

export interface ConvertedRow {
  line: number;
  status: RowStatus;
  /** Why it needs a look, or what's wrong. */
  reason: string | null;
  /** Cells to highlight. */
  issue: TemplateField[];
  values: Record<TemplateField, string>;
  /** The row as it was in the file. */
  source: string[];
  emailGenerated: boolean;
}

export interface ConvertResult {
  rows: ConvertedRow[];
  /** Lines removed because they were empty (or had no student no. and no name). */
  blankLines: number[];
  counts: Record<RowStatus, number>;
  /** The converted file in the stiVote template (what Import uses). */
  csv: string;
}

const ISSUE_FIELDS: Record<ImportField, TemplateField[]> = {
  studentNo: ["student_no"],
  name: ["last_name", "first_name"],
  career: ["career"],
  program: ["program"],
  year: ["year"],
  term: ["term"],
  email: ["email"],
  row: [],
};

const csvCell = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
const toCsv = (rows: readonly ConvertedRow[]) => [CSV_COLUMNS.join(","), ...rows.map((r) => CSV_COLUMNS.map((f) => csvCell(r.values[f])).join(","))].join("\n");

/**
 * Applies the rules to every row, then runs the result through the CSV import's
 * own checks, so the errors shown here are the ones Import would report.
 */
export function applySpec(
  sheet: SheetData,
  spec: ConversionSpec,
  catalog: StudentCatalog,
  students: readonly Student[],
  splits: Readonly<Record<string, NameSplit>>,
): ConvertResult {
  const { columns } = sheet;
  const rules = {
    studentNo: compileRule(spec.studentNo, columns),
    career: compileRule(spec.career, columns),
    program: compileRule(spec.program, columns),
    year: compileRule(spec.year, columns),
    term: compileRule(spec.term, columns),
    email: compileRule(spec.email, columns),
  };
  const programByCode = new Map(catalog.programs.map((p) => [p.toUpperCase(), p]));
  const programByName = new Map(Object.entries(catalog.programNames).map(([code, name]) => [name.toLowerCase(), code]));
  const noEmail = new Set(spec.generateEmailWhen);
  const caseName = (s: string) => (spec.titleCaseNames ? titleCase(s) : s);

  const blankLines: number[] = [];
  const rows: ConvertedRow[] = [];

  for (const record of sheet.records) {
    const cells = record.cells;
    const studentNoRaw = pick(rules.studentNo, cells).replace(/[\s-]/g, "");
    const names = rowNames(cells, columns, spec);
    const hasName = Boolean(names.last || names.given.length || names.firstOnly);
    if (isBlank(record) || (!studentNoRaw && !hasName)) {
      blankLines.push(record.line);
      continue;
    }

    // Excel drops the leading 0 of numeric student numbers.
    const studentNo = /^\d{9,10}$/.test(studentNoRaw) ? studentNoRaw.padStart(11, "0") : studentNoRaw;

    let first: string;
    let middle: string;
    let sure = true;
    if (names.firstOnly !== undefined) {
      first = names.firstOnly;
      middle = names.middleOnly ?? "";
    } else {
      const split = splitGiven(names.given, splits);
      first = [...split.first, ...names.suffix].join(" ");
      middle = split.middle.join(" ");
      sure = split.sure;
    }
    const lastName = caseName(names.last);
    const firstName = caseName(first);
    const middleName = caseName(middle);

    const programRaw = pick(rules.program, cells);
    const program = programRaw ? (programByCode.get(programRaw.toUpperCase()) ?? programByName.get(programRaw.toLowerCase()) ?? programRaw.toUpperCase()) : "";
    const careerRaw = pick(rules.career, cells).toUpperCase();
    const career = careerRaw || (program ? (careerForProgram(program, catalog.careers)?.code ?? "") : "");
    const yearRaw = pick(rules.year, cells);
    const year = /^\d+$/.test(yearRaw) ? String(Number(yearRaw)) : (yearRaw.match(/\d+/)?.[0] ?? yearRaw);
    const term = pick(rules.term, cells).toUpperCase() || (catalog.currentTerm?.id ?? "");
    const emailRaw = pick(rules.email, cells).toLowerCase();
    const emailGenerated = noEmail.has(emailRaw) && Boolean(lastName && studentNo);
    const email = emailGenerated ? buildStudentEmail(lastName, studentNo) : emailRaw;

    rows.push({
      line: record.line,
      status: sure ? "ready" : "check",
      reason: sure ? null : "No clear middle name",
      issue: sure ? [] : ["middle_name"],
      values: {
        student_no: studentNo,
        last_name: lastName,
        first_name: firstName,
        middle_name: middleName,
        career,
        program,
        year,
        term,
        email,
      },
      source: cells,
      emailGenerated,
    });
  }

  const csv = toCsv(rows);
  const analysis = analyzeCsvImport(csv, students, catalog);
  if (!analysis.error && analysis.rows.length === rows.length) {
    analysis.rows.forEach((checked, i) => {
      if (checked.kind !== "error") return;
      rows[i] = { ...rows[i], status: "error", reason: checked.error!.message, issue: ISSUE_FIELDS[checked.error!.field] };
    });
  }

  const counts: Record<RowStatus, number> = { ready: 0, check: 0, error: 0 };
  for (const row of rows) counts[row.status]++;
  return { rows, blankLines, counts, csv };
}

/* -------------------------------------------------------------------------- */
/*                             "What Groq changed"                            */
/* -------------------------------------------------------------------------- */

export interface ChangeExample {
  column: string;
  before: string;
  after: string;
}

const NAME_FIELDS = new Set<TemplateField>(["last_name", "first_name", "middle_name"]);
const FIELD_LABEL: Record<TemplateField, string> = {
  student_no: "student no.",
  last_name: "last",
  first_name: "first",
  middle_name: "middle",
  career: "career",
  program: "program",
  year: "year",
  term: "term",
  email: "email",
};

/** The changes Groq listed, else one per column a rule reshapes. */
function specChanges(spec: ConversionSpec): SpecChange[] {
  if (spec.changes.length) return spec.changes;
  const out: SpecChange[] = [];
  if (spec.name.mode === "full") out.push({ column: spec.name.column, outputs: ["last_name", "first_name", "middle_name"] });
  const reshaped: [TemplateField, ValueRule][] = [
    ["student_no", spec.studentNo],
    ["program", spec.program],
    ["year", spec.year],
    ["career", spec.career],
    ["term", spec.term],
  ];
  for (const [field, rule] of reshaped) if (rule.column && (rule.regex || rule.map)) out.push({ column: rule.column, outputs: [field] });
  if (spec.email.column) out.push({ column: spec.email.column, outputs: ["email"] });
  return out;
}

/** One before → after example per reshaped column, from a real row (an email that was generated, when there is one). */
export function changeExamples(sheet: SheetData, spec: ConversionSpec, result: ConvertResult): ChangeExample[] {
  const fine = result.rows.filter((r) => r.status !== "error");
  const usable = fine.length ? fine : result.rows;
  return specChanges(spec).flatMap((change) => {
    const j = sheet.columns.indexOf(change.column);
    if (j < 0) return [];
    const withValue = usable.filter((r) => r.source[j]);
    const row = (change.outputs.includes("email") ? withValue.find((r) => r.emailGenerated) : undefined) ?? withValue[0];
    if (!row) return [];
    const before = row.source[j];
    const { outputs } = change;
    const after = outputs.every((f) => NAME_FIELDS.has(f))
      ? outputs.map((f) => row.values[f] || "—").join(" · ")
      : outputs.length === 1
        ? row.values[outputs[0]]
        : outputs.map((f) => `${FIELD_LABEL[f]} ${row.values[f] || "—"}`).join(" · ");
    if (!after || after.toLowerCase() === before.toLowerCase()) return [];
    return [{ column: change.column, before, after }];
  });
}

/* -------------------------------------------------------------------------- */
/*                                Output files                                */
/* -------------------------------------------------------------------------- */

export type OutputFormat = "csv" | "xlsx";

export const outputName = (source: string, format: OutputFormat) => `${source.replace(/\.[^.]+$/, "") || "students"}_converted.${format}`;

/** CSV with a byte-order mark, so Excel shows "Ñ" correctly. */
export const csvBlob = (csv: string) => new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });

/** Excel workbook; student numbers stay text, so their leading 0 survives. */
export async function xlsxBlob(result: ConvertResult): Promise<Blob> {
  const XLSX = await import("xlsx");
  const aoa: (string | number)[][] = [
    [...CSV_COLUMNS],
    ...result.rows.map((r) => CSV_COLUMNS.map((f) => (f === "year" && /^\d+$/.test(r.values.year) ? Number(r.values.year) : r.values[f]))),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!cols"] = CSV_COLUMNS.map((f) => ({ wch: f === "email" ? 34 : f === "student_no" ? 14 : 16 }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Students");
  const data = XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
