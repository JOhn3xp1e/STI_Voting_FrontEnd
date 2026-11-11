/**
 * Calendar-date helpers. Dates are plain `YYYY-MM-DD` strings (no time, no
 * time zone), so a term that starts on Aug 11 starts on Aug 11 everywhere.
 * ISO date strings also sort and compare correctly as strings.
 */

export type IsoDate = string;

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

export function toIsoDate(year: number, monthIndex: number, day: number): IsoDate {
  // Normalise overflow (e.g. day 32) through Date.
  const d = new Date(year, monthIndex, day);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseIsoDate(iso: IsoDate): { year: number; month: number; day: number } {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return { year, month: month - 1, day };
}

export function todayIso(): IsoDate {
  const now = new Date();
  return toIsoDate(now.getFullYear(), now.getMonth(), now.getDate());
}

/** "2025-08-11T00:00:00" → "2025-08-11" */
export function toDateOnly(value: string): IsoDate {
  return value.slice(0, 10);
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const { year, month, day } = parseIsoDate(iso);
  return toIsoDate(year, month, day + days);
}

export function addMonths(iso: IsoDate, months: number): IsoDate {
  const { year, month, day } = parseIsoDate(iso);
  const last = daysInMonth(year, month + months);
  return toIsoDate(year, month + months, Math.min(day, last));
}

export function addYears(iso: IsoDate, years: number): IsoDate {
  return addMonths(iso, years * 12);
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** 0 = Sunday */
export function weekdayOf(iso: IsoDate): number {
  const { year, month, day } = parseIsoDate(iso);
  return new Date(year, month, day).getDay();
}

/** "Aug 10, 2026", or "Aug 10" without the year. */
export function formatDate(iso: IsoDate, { year = true }: { year?: boolean } = {}): string {
  const d = parseIsoDate(iso);
  return `${MONTHS_SHORT[d.month]} ${d.day}${year ? `, ${d.year}` : ""}`;
}

/** "Aug 11 – Dec 20, 2025", or "Aug 11, 2025 – Jan 5, 2026" across years. */
export function formatDateRange(start: IsoDate, end: IsoDate): string {
  const sameYear = parseIsoDate(start).year === parseIsoDate(end).year;
  return `${formatDate(start, { year: !sameYear })} – ${formatDate(end)}`;
}
