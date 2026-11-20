import { CSV_COLUMNS } from "./student-import";

/*
 * "Convert with AI" (Students page): the rules Groq writes for turning a class
 * list in any layout into the stiVote import template. Groq only sees the column
 * names, a few sample rows and the admin's instructions; code applies the rules
 * to every row (lib/ai-convert.ts). Shared by the browser and the API route, so
 * nothing here may import browser-only or server-only code.
 */

export type TemplateField = (typeof CSV_COLUMNS)[number];

/** Where one template value comes from. Every part is optional. */
export interface ValueRule {
  /** Source column, exactly as named in the file. */
  column: string | null;
  /** Fixed output for every row, or for rows where the column is blank. */
  value: string | null;
  /** Run on the cell (case-insensitive); capture group 1 is kept, else the whole match. */
  regex: string | null;
  /** Cell value (case-insensitive) → output, applied after the regex. */
  map: Record<string, string> | null;
}

export type NameRule =
  /** One column holds the whole name: "ACOSTA, ANGELINA KATE MILLENA" (last_first) or "Angelina Kate Millena Acosta" (first_last). */
  | { mode: "full"; column: string; order: "last_first" | "first_last" }
  | { mode: "separate"; last: string; first: string; middle: string | null };

export interface SpecChange {
  /** The file column whose values are reshaped. */
  column: string;
  /** Template columns it feeds (fixed values such as career and term may ride along). */
  outputs: TemplateField[];
}

export interface ConversionSpec {
  studentNo: ValueRule;
  name: NameRule;
  /** "ACOSTA" → "Acosta". */
  titleCaseNames: boolean;
  career: ValueRule;
  program: ValueRule;
  year: ValueRule;
  term: ValueRule;
  email: ValueRule;
  /** Lower-cased cell values that mean "no email" (always includes ""); those rows get the school email. */
  generateEmailWhen: string[];
  /** What the "What Groq changed" panel lists. */
  changes: SpecChange[];
  /** One sentence from Groq about the conversion. */
  summary: string;
}

/** The catalog Groq may pick codes from. */
export interface ConvertContext {
  careers: { code: string; name: string; programs: string[]; minLevel: number | null; maxLevel: number | null }[];
  programs: { code: string; name: string }[];
  terms: { id: string; label: string }[];
  currentTerm: string | null;
  emailDomain: string;
}

/** A column's shape without its (possibly personal) values: only short lists of repeated values are sent. */
export interface ColumnProfile {
  column: string;
  filled: number;
  distinct: number;
  /** Only when the column has few distinct values (e.g. LEVEL: 1Y1, 1Y2). */
  values?: string[];
}

export interface SpecRequest {
  task: "spec";
  fileName: string;
  columns: string[];
  profiles: ColumnProfile[];
  sample: string[][];
  instruction: string;
  context: ConvertContext;
  /** Re-run: the rules to adjust, and what to change. */
  previous?: ConversionSpec | null;
  adjustment?: string;
}

export interface NamesRequest {
  task: "names";
  /** Given-name parts (everything after the surname), e.g. "ANGELINA KATE MILLENA". */
  names: string[];
}

export type ConvertRequest = SpecRequest | NamesRequest;

export interface NameSplit {
  /** Trailing words that are the middle name ("" when none). */
  middle: string;
  sure: boolean;
}

/* -------------------------------------------------------------------------- */
/*                                   Limits                                   */
/* -------------------------------------------------------------------------- */

export const LIMITS = {
  columns: 60,
  sampleRows: 8,
  cellChars: 120,
  instructionChars: 2000,
  /** Given names per request (the client sends several requests for long lists). */
  names: 100,
  nameChars: 80,
  regexChars: 200,
  mapEntries: 200,
  profileValues: 12,
} as const;

/* -------------------------------------------------------------------------- */
/*                                 Sanitizing                                 */
/* -------------------------------------------------------------------------- */

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown, max: number): string | null => {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

/** Matches a column name from the model to the file's own spelling (case and spacing don't matter). */
function columnResolver(columns: readonly string[]) {
  const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const byKey = new Map(columns.map((c) => [key(c), c]));
  return (value: unknown): string | null => (typeof value === "string" ? (byKey.get(key(value)) ?? null) : null);
}

/** A regex the browser can compile, or null. */
export function safeRegex(value: unknown): string | null {
  const source = text(value, LIMITS.regexChars);
  if (!source) return null;
  try {
    new RegExp(source, "i");
    return source;
  } catch {
    return null;
  }
}

function sanitizeRule(input: unknown, resolve: (v: unknown) => string | null): ValueRule {
  const o = isObject(input) ? input : {};
  let map: Record<string, string> | null = null;
  if (isObject(o.map)) {
    const entries = Object.entries(o.map)
      .map(([k, v]) => [k.trim(), text(v, 100)] as const)
      .filter((e): e is readonly [string, string] => e[0] !== "" && e[1] !== null)
      .slice(0, LIMITS.mapEntries);
    if (entries.length) map = Object.fromEntries(entries);
  }
  return { column: resolve(o.column), value: text(o.value, 100), regex: safeRegex(o.regex), map };
}

/**
 * Checks Groq's JSON against the file's columns and drops anything unusable.
 * Throws when the rules can't convert anything (no student no. or name column).
 */
export function sanitizeSpec(input: unknown, columns: readonly string[]): ConversionSpec {
  if (!isObject(input)) throw new Error("Groq didn't return conversion rules.");
  const resolve = columnResolver(columns);

  const studentNo = sanitizeRule(input.studentNo, resolve);
  if (!studentNo.column) throw new Error("Groq couldn't find the student number column. Say which column it is and try again.");

  const rawName = isObject(input.name) ? input.name : {};
  let name: NameRule;
  if (rawName.mode === "separate") {
    const last = resolve(rawName.last);
    const first = resolve(rawName.first);
    if (!last || !first) throw new Error("Groq couldn't find the name columns. Say which columns hold the names and try again.");
    name = { mode: "separate", last, first, middle: resolve(rawName.middle) };
  } else {
    const column = resolve(rawName.column);
    if (!column) throw new Error("Groq couldn't find the name column. Say which column holds the names and try again.");
    name = { mode: "full", column, order: rawName.order === "first_last" ? "first_last" : "last_first" };
  }

  const blanks = Array.isArray(input.generateEmailWhen)
    ? input.generateEmailWhen.map((v) => text(v, 40)?.toLowerCase()).filter((v): v is string => Boolean(v)).slice(0, 10)
    : [];

  const fields = new Set<string>(CSV_COLUMNS);
  const seen = new Set<string>();
  const changes: SpecChange[] = [];
  if (Array.isArray(input.changes)) {
    for (const change of input.changes.slice(0, 12)) {
      if (!isObject(change)) continue;
      const column = resolve(change.column);
      if (!column || seen.has(column) || !Array.isArray(change.outputs)) continue;
      const outputs = [...new Set(change.outputs.filter((o): o is TemplateField => typeof o === "string" && fields.has(o)))];
      if (!outputs.length) continue;
      seen.add(column);
      changes.push({ column, outputs });
    }
  }

  return {
    studentNo,
    name,
    titleCaseNames: input.titleCaseNames !== false,
    career: sanitizeRule(input.career, resolve),
    program: sanitizeRule(input.program, resolve),
    year: sanitizeRule(input.year, resolve),
    term: sanitizeRule(input.term, resolve),
    email: sanitizeRule(input.email, resolve),
    generateEmailWhen: ["", ...blanks.filter((b) => b !== "")],
    changes,
    summary: text(input.summary, 300) ?? "",
  };
}

/** Normal form of a given-name part, used to match splits to rows. */
export const nameKey = (value: string) => value.trim().replace(/\s+/g, " ").toUpperCase();

/** Groq's name splits, keeping only answers whose middle name really ends the input. */
export function sanitizeSplits(input: unknown, asked: readonly string[]): Record<string, NameSplit> {
  const wanted = new Set(asked.map(nameKey));
  const out: Record<string, NameSplit> = {};
  const list = isObject(input) && Array.isArray(input.splits) ? input.splits : [];
  for (const item of list) {
    if (!isObject(item) || typeof item.name !== "string") continue;
    const key = nameKey(item.name);
    if (!wanted.has(key)) continue;
    const middle = typeof item.middle === "string" ? nameKey(item.middle) : "";
    const words = key.split(" ");
    const middleWords = middle ? middle.split(" ") : [];
    // The middle name must be the last word(s), and leave at least one first-name word.
    const fits = middleWords.length < words.length && middleWords.every((w, i) => words[words.length - middleWords.length + i] === w);
    if (!fits) continue;
    out[key] = { middle, sure: item.sure !== false };
  }
  return out;
}
