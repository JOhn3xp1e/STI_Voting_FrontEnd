import { addYears, formatDateRange, parseIsoDate, toIsoDate, type IsoDate } from "@/lib/dates";
import type { NewTermInput, Term, TermStatus } from "@/types/term.types";

/** Upcoming before the start date, current through the end date, ended after. */
export function getTermStatus(term: Pick<Term, "startDate" | "endDate">, today: IsoDate): TermStatus {
  if (today < term.startDate) return "upcoming";
  if (today > term.endDate) return "ended";
  return "current";
}

/** "2025-2026" → "2025–2026" */
export function formatAcadYear(acadYear: string): string {
  return acadYear.replace("-", "–");
}

/** "2025-2026" → "2025–26" */
export function formatAcadYearShort(acadYear: string): string {
  const [from, to] = acadYear.split("-");
  return to ? `${from}–${to.slice(-2)}` : acadYear;
}

/** "2025–2026 · Term 2" */
export function formatTermTitle(term: Pick<Term, "acadYear" | "termNumber">): string {
  return `${formatAcadYear(term.acadYear)} · Term ${term.termNumber}`;
}

/** Newest first. */
export function sortTerms(terms: readonly Term[]): Term[] {
  return [...terms].sort((a, b) => b.startDate.localeCompare(a.startDate) || b.id.localeCompare(a.id));
}

/** The id the database will most likely give the next term: highest number + 1. */
export function predictNextTermId(terms: readonly Term[]): string {
  const highest = terms.reduce((max, t) => Math.max(max, Number.parseInt(t.id.replace(/\D/g, ""), 10) || 0), 0);
  return `TRM-${String(highest + 1).padStart(5, "0")}`;
}

/** "2026 – 2027", "2026—2027" or "2026 2027" → "2026-2027" */
export function normalizeAcadYear(raw: string): string {
  return raw.trim().replace(/\s*[-–—\s]\s*/, "-");
}

function shiftAcadYear(acadYear: string, years: number): string {
  const [from] = acadYear.split("-").map(Number);
  return `${from + years}-${from + years + 1}`;
}

/** Typical STI dates when there's no earlier term to copy from. */
function defaultDates(acadYear: string, termNumber: number): { startDate: IsoDate; endDate: IsoDate } {
  const [from] = acadYear.split("-").map(Number);
  if (termNumber === 1) return { startDate: toIsoDate(from, 7, 10), endDate: toIsoDate(from, 11, 19) };
  if (termNumber === 2) return { startDate: toIsoDate(from + 1, 0, 5), endDate: toIsoDate(from + 1, 4, 22) };
  return { startDate: toIsoDate(from + 1, 5, 1), endDate: toIsoDate(from + 1, 6, 31) };
}

/**
 * Suggests the term after the newest one (term 1 → term 2 of the same school
 * year; term 2 → term 1 of the next). Dates are copied from the same term a
 * year earlier when it exists, else typical dates are used.
 */
export function suggestNextTerm(terms: readonly Term[], today: IsoDate): NewTermInput {
  const newest = sortTerms(terms)[0];
  let acadYear: string;
  let termNumber: number;

  if (!newest) {
    const { year, month } = parseIsoDate(today);
    // Before June: we're in the second half of a school year.
    [acadYear, termNumber] = month >= 5 ? [`${year}-${year + 1}`, 1] : [`${year - 1}-${year}`, 2];
  } else if (newest.termNumber === 1) {
    [acadYear, termNumber] = [newest.acadYear, 2];
  } else {
    [acadYear, termNumber] = [shiftAcadYear(newest.acadYear, 1), 1];
  }

  // Skip combinations that already exist.
  for (let i = 0; i < 6 && terms.some((t) => t.acadYear === acadYear && t.termNumber === termNumber); i++) {
    [acadYear, termNumber] = termNumber === 1 ? [acadYear, 2] : [shiftAcadYear(acadYear, 1), 1];
  }

  const lastYear = terms.find((t) => t.acadYear === shiftAcadYear(acadYear, -1) && t.termNumber === termNumber);
  const dates = lastYear
    ? { startDate: addYears(lastYear.startDate, 1), endDate: addYears(lastYear.endDate, 1) }
    : defaultDates(acadYear, termNumber);

  return { acadYear, termNumber, ...dates };
}

export type TermFieldErrors = Partial<Record<"acadYear" | "termNumber" | "startDate" | "endDate", string>>;

/**
 * Same rules as the backend (school year format, term 1–3, end after start),
 * plus: no duplicate school year + term, and no overlap with another term's
 * dates (two terms can't both be "current").
 */
export function validateTerm(input: NewTermInput, terms: readonly Term[], ignoreId?: string): TermFieldErrors {
  const errors: TermFieldErrors = {};
  const others = terms.filter((t) => t.id !== ignoreId);

  const match = /^(\d{4})-(\d{4})$/.exec(input.acadYear);
  if (!match) errors.acadYear = "Use the format 2026–2027.";
  else if (Number(match[2]) !== Number(match[1]) + 1) errors.acadYear = "The second year must be one more than the first.";

  if (input.termNumber < 1 || input.termNumber > 3) errors.termNumber = "Term must be 1, 2 or 3.";
  else if (!errors.acadYear) {
    const duplicate = others.find((t) => t.acadYear === input.acadYear && t.termNumber === input.termNumber);
    if (duplicate) errors.termNumber = `Already exists as ${duplicate.id}.`;
  }

  if (!input.startDate) errors.startDate = "Pick a start date.";
  if (!input.endDate) errors.endDate = "Pick an end date.";
  else if (input.startDate && input.endDate <= input.startDate) errors.endDate = "Must be after the start date.";

  if (!errors.startDate && !errors.endDate) {
    const overlap = others.find((t) => input.startDate <= t.endDate && t.startDate <= input.endDate);
    if (overlap) errors.endDate = `Overlaps ${overlap.id} (${formatDateRange(overlap.startDate, overlap.endDate)}).`;
  }

  return errors;
}
