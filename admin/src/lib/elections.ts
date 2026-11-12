import type { Career, Program } from "@/types/program.types";
import type { Election, ElectionCategory, ElectionStatus, VoterEnrollment } from "@/types/election.types";

/*
 * Election helpers: date-times, voter filters and form validation.
 *
 * In the form, date-times are local "YYYY-MM-DDTHH:mm" strings (the admin's
 * own clock); they're sent to the API as ISO instants.
 */

/** Local "YYYY-MM-DDTHH:mm" */
export type LocalDateTime = string;

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

export function localToInstant(value: LocalDateTime): string {
  return new Date(value).toISOString();
}

export function instantToLocal(value: string): LocalDateTime {
  const d = new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "8:00 AM" from "HH:mm" */
export function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;
}

function parts(value: LocalDateTime) {
  const [date, time = "00:00"] = value.split("T");
  const [year, month, day] = date.split("-").map(Number);
  return { year, month: month - 1, day, time: time.slice(0, 5) };
}

/** "Sep 7" or "Sep 7, 2026" */
export function formatDay(value: LocalDateTime, { year = false }: { year?: boolean } = {}): string {
  const p = parts(value);
  return `${MONTHS_SHORT[p.month]} ${p.day}${year ? `, ${p.year}` : ""}`;
}

/** "Sep 7, 8:00 AM" */
export function formatDayTime(value: LocalDateTime): string {
  return `${formatDay(value)}, ${formatTime(parts(value).time)}`;
}

/** "Sep 7, 2026 · 8:00 AM" (date-time field) */
export function formatFieldDateTime(value: LocalDateTime): string {
  return `${formatDay(value, { year: true })} · ${formatTime(parts(value).time)}`;
}

/** "Sep 1 – Sep 2, 2025", "Feb 10, 2025" (same day) or "Dec 30, 2025 – Jan 2, 2026" (election cards). */
export function formatVotingDates(startsAt: string, endsAt: string): string {
  const start = instantToLocal(startsAt);
  const end = instantToLocal(endsAt);
  if (start.slice(0, 10) === end.slice(0, 10)) return formatDay(start, { year: true });
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${formatDay(start, { year: !sameYear })} – ${formatDay(end, { year: true })}`;
}

/* -------------------------------------------------------------------------- */
/*                                Voter filters                               */
/* -------------------------------------------------------------------------- */

/** Every level a career covers, lowest first. */
export function careerLevels(career: Pick<Career, "minLevel" | "maxLevel">): number[] {
  if (career.minLevel === null || career.maxLevel === null) return [];
  return Array.from({ length: career.maxLevel - career.minLevel + 1 }, (_, i) => career.minLevel! + i);
}

/** College-style careers (levels within 1–4) count years; the rest count grades. */
function usesYears(career: Pick<Career, "minLevel" | "maxLevel"> | undefined): boolean {
  return !!career && career.minLevel !== null && career.maxLevel !== null && career.minLevel >= 1 && career.maxLevel <= 4;
}

const ORDINALS = ["1st", "2nd", "3rd", "4th"];

/** "1st year", "Grade 11" or "Kinder". */
export function levelLabel(level: number, career?: Pick<Career, "minLevel" | "maxLevel">): string {
  if (usesYears(career)) return `${ORDINALS[level - 1]} year`;
  return level === 0 ? "Kinder" : `Grade ${level}`;
}

/** The career whose levels include `level`. */
export function careerOfLevel(level: number, careers: readonly Career[]): Career | undefined {
  return careers.find((c) => c.minLevel !== null && c.maxLevel !== null && level >= c.minLevel && level <= c.maxLevel);
}

/** Consecutive runs, e.g. [1, 2, 3, 5] → [[1, 3], [5, 5]]. */
function runs(levels: readonly number[]): [number, number][] {
  const sorted = [...new Set(levels)].sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (const level of sorted) {
    const last = out.at(-1);
    if (last && level === last[1] + 1) last[1] = level;
    else out.push([level, level]);
  }
  return out;
}

/** "1st–4th year", "1st–4th year, Grade 11–12" or "All levels". */
export function formatLevelScope(levels: readonly number[], careers: readonly Career[]): string {
  if (levels.length === 0) return "All levels";
  return runs(levels)
    .map(([from, to]) => {
      const career = careerOfLevel(from, careers);
      if (usesYears(career)) return from === to ? `${ORDINALS[from - 1]} year` : `${ORDINALS[from - 1]}–${ORDINALS[to - 1]} year`;
      return from === to ? levelLabel(from, career) : `Grade ${from}–${to}`;
    })
    .join(", ");
}

/** "L1–4", "L1–4, L11–12" (election cards) or "All levels". */
export function formatLevelScopeShort(levels: readonly number[]): string {
  if (levels.length === 0) return "All levels";
  return runs(levels)
    .map(([from, to]) => (from === to ? `L${from}` : `L${from}–${to}`))
    .join(", ");
}

/** "All programs", "BSIT, BSCS" or "BSIT, BSCS +3". */
export function formatProgramScope(codes: readonly string[], max = 3): string {
  if (codes.length === 0) return "All programs";
  const shown = codes.slice(0, max).join(", ");
  return codes.length > max ? `${shown} +${codes.length - max}` : shown;
}

/** "TER · Tertiary, SHS · Senior High" or "All careers". */
export function formatCareerScope(codes: readonly string[], careers: readonly Career[]): string {
  if (codes.length === 0) return "All careers";
  return codes
    .map((code) => {
      const career = careers.find((c) => c.code === code);
      return career ? `${career.code} · ${career.name}` : code;
    })
    .join(", ");
}

export interface VoterFilter {
  termId: string | null;
  careerScope: readonly string[];
  programScope: readonly string[];
  levelScope: readonly number[];
}

/** Active enrollments in the term that the filter lets vote (an empty list means "every"). */
export function countEligibleVoters(enrollments: readonly VoterEnrollment[], filter: VoterFilter): number {
  if (!filter.termId) return 0;
  const careers = new Set(filter.careerScope);
  const programs = new Set(filter.programScope);
  const levels = new Set(filter.levelScope);
  return enrollments.filter(
    (e) =>
      e.termId === filter.termId &&
      e.status === "Active" &&
      (careers.size === 0 || careers.has(e.careerCode)) &&
      (programs.size === 0 || programs.has(e.programCode)) &&
      (levels.size === 0 || levels.has(e.level)),
  ).length;
}

export const sortProgramsByCode = (programs: readonly Program[]) => [...programs].sort((a, b) => a.code.localeCompare(b.code));

/* -------------------------------------------------------------------------- */
/*                              Edit and delete                               */
/* -------------------------------------------------------------------------- */

export const electionEditHref = (id: string) => `/elections/${encodeURIComponent(id)}/edit`;

/** Settings can change until voting starts. */
export function canEditElection(status: ElectionStatus): boolean {
  return status === "Draft" || status === "Upcoming";
}

/** Only drafts can be deleted (nothing has been sent to voters yet). */
export function canDeleteElection(status: ElectionStatus): boolean {
  return status === "Draft";
}

/** Why an election can't be edited, for menus and the edit page. */
export function editBlockedReason(status: ElectionStatus): string {
  if (status === "Ongoing") return "Voting is ongoing, so its settings are locked.";
  if (status === "Completed") return "Voting has ended, so its settings are locked.";
  return "It was cancelled, so its settings are locked.";
}

/* -------------------------------------------------------------------------- */
/*                                 Validation                                 */
/* -------------------------------------------------------------------------- */

export interface ElectionForm {
  title: string;
  category: ElectionCategory;
  description: string;
  termId: string | null;
  rules: string;
  opensAt: LocalDateTime | null;
  closesAt: LocalDateTime | null;
  careerScope: string[];
  programScope: string[];
  levelScope: number[];
}

/**
 * The form for an existing election. An empty career / level filter means
 * "everyone" in the database; the form spells that out (every career, all
 * their levels) so the chips show what the election really covers.
 */
export function electionToForm(election: Election, careers: readonly Career[]): ElectionForm {
  const careerScope = election.careerScope.length ? election.careerScope : careers.map((c) => c.code);
  const levelScope = election.levelScope.length
    ? election.levelScope
    : [...new Set(careers.filter((c) => careerScope.includes(c.code)).flatMap(careerLevels))].sort((a, b) => a - b);
  return {
    title: election.title,
    category: election.category,
    description: election.description,
    termId: election.termId,
    rules: election.rules ?? "",
    opensAt: instantToLocal(election.startsAt),
    closesAt: instantToLocal(election.endsAt),
    careerScope: [...careerScope],
    programScope: [...election.programScope],
    levelScope: [...levelScope],
  };
}

export type DetailsErrors = Partial<Record<"title" | "description" | "termId" | "opensAt" | "closesAt", string>>;
export type VotersErrors = Partial<Record<"careerScope" | "levelScope", string>>;

/** Same rules as the backend's create endpoint (title, description, term, closes after opens). */
export function validateDetails(form: ElectionForm): DetailsErrors {
  const errors: DetailsErrors = {};
  if (form.title.trim().length < 3) errors.title = form.title.trim() ? "Use at least 3 characters." : "Required.";
  if (!form.description.trim()) errors.description = "Required.";
  if (!form.termId) errors.termId = "Pick a term.";
  if (!form.opensAt) errors.opensAt = "Pick when voting opens.";
  if (!form.closesAt) errors.closesAt = "Pick when voting closes.";
  else if (form.opensAt && form.closesAt <= form.opensAt) errors.closesAt = "Must be after it opens.";
  return errors;
}

export function validateVoters(form: ElectionForm): VotersErrors {
  const errors: VotersErrors = {};
  if (form.careerScope.length === 0) errors.careerScope = "Pick at least one career.";
  if (form.levelScope.length === 0) errors.levelScope = "Pick at least one level.";
  return errors;
}
