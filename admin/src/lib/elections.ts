import type { Career, Program } from "@/types/program.types";
import type { CandidacySettings, Election, ElectionCategory, ElectionStatus, VoterEnrollment } from "@/types/election.types";

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

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole calendar days from `from` to `to` (local time). */
function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / DAY_MS);
}

/** "today", "tomorrow" or "in 6 days" (non-negative day counts). */
function inDays(days: number): string {
  return days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
}

/** Card footer timing: "opens in 6 days", "closes today", "ended Mar 4". `null` for drafts and cancelled elections. */
export function votingCountdown(election: Pick<Election, "status" | "startsAt" | "endsAt">, now: Date): string | null {
  // The status can lag behind the dates (the backend moves it on); then just name the date.
  if (election.status === "Upcoming") {
    const days = daysBetween(now, new Date(election.startsAt));
    return days < 0 ? `scheduled ${formatDay(instantToLocal(election.startsAt))}` : `opens ${inDays(days)}`;
  }
  if (election.status === "Ongoing") {
    const days = daysBetween(now, new Date(election.endsAt));
    return days < 0 ? `ended ${formatDay(instantToLocal(election.endsAt))}` : `closes ${inDays(days)}`;
  }
  if (election.status === "Completed") return `ended ${formatDay(instantToLocal(election.endsAt))}`;
  return null;
}

/* The elections list flashes the card of an election that was just created or saved. */

const SAVED_KEY = "slvp:election-saved";

export function markElectionSaved(id: string): void {
  try {
    sessionStorage.setItem(SAVED_KEY, id);
  } catch {
    // Storage blocked: the list just won't flash the card.
  }
}

/* A message for an election's page to show once (e.g. "saved as a draft, couldn't schedule"). */

const NOTICE_KEY = "slvp:election-notice";

export interface ElectionNotice {
  text: string;
  tone: "success" | "warn";
}

export function leaveNotice(electionId: string, text: string, tone: ElectionNotice["tone"] = "warn"): void {
  try {
    sessionStorage.setItem(NOTICE_KEY, JSON.stringify({ electionId, text, tone }));
  } catch {
    // Storage blocked: the page just won't show the note.
  }
}

/** The notice left for this election, once (it's cleared as it's read). */
export function takeNotice(electionId: string): ElectionNotice | null {
  try {
    const raw = sessionStorage.getItem(NOTICE_KEY);
    if (!raw) return null;
    const notice = JSON.parse(raw) as { electionId?: string; text?: string; tone?: string };
    if (notice.electionId !== electionId || typeof notice.text !== "string") return null;
    sessionStorage.removeItem(NOTICE_KEY);
    return { text: notice.text, tone: notice.tone === "success" ? "success" : "warn" };
  } catch {
    return null;
  }
}

/** The id marked by `markElectionSaved`, once (it's cleared as it's read). */
export function takeSavedElection(): string | null {
  try {
    const id = sessionStorage.getItem(SAVED_KEY);
    sessionStorage.removeItem(SAVED_KEY);
    return id;
  } catch {
    return null;
  }
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
      (programs.size === 0 || (e.programCode !== null && programs.has(e.programCode))) &&
      (levels.size === 0 || levels.has(e.level)),
  ).length;
}

export const sortProgramsByCode = (programs: readonly Program[]) => [...programs].sort((a, b) => a.code.localeCompare(b.code));

/* -------------------------------------------------------------------------- */
/*                         Per-career voter filter                            */
/* -------------------------------------------------------------------------- */

/*
 * The API stores one flat list each of careers, programs and levels. The form narrows
 * each picked career on its own: a career with none of its programs (or levels) picked
 * means "all of them". `voterScope` turns that into the flat lists the API expects,
 * spelling out "all" for a career only when another career is narrowed.
 */

/** Program codes per career code. */
export type ProgramsByCareer = ReadonlyMap<string, readonly string[]>;

/**
 * Programs under each career: the ones listed on the career, plus any its enrollments
 * use (so nobody is left out when a career's list is incomplete), in program-code order.
 */
export function programsByCareer(careers: readonly Career[], enrollments: readonly VoterEnrollment[]): ProgramsByCareer {
  const map = new Map<string, string[]>();
  for (const career of careers) {
    const codes = new Set(career.programScope);
    for (const e of enrollments) if (e.careerCode === career.code && e.programCode) codes.add(e.programCode);
    map.set(career.code, [...codes].sort((a, b) => a.localeCompare(b)));
  }
  return map;
}

/** "Programs" for college-style careers, "Strands" for senior high (grades 11–12). */
export function programGroupLabel(career: Pick<Career, "minLevel" | "maxLevel">): string {
  return !usesYears(career) && career.minLevel !== null && career.minLevel >= 11 ? "Strands" : "Programs";
}

/** "Year level" or "Grade level". */
export function levelGroupLabel(career: Pick<Career, "minLevel" | "maxLevel">): string {
  return usesYears(career) ? "Year level" : "Grade level";
}

/** Programs picked for this career (none = all of them). */
export function programPicks(form: Pick<ElectionForm, "programScope">, career: Career, programs: ProgramsByCareer): string[] {
  const own = programs.get(career.code) ?? [];
  return own.filter((code) => form.programScope.includes(code));
}

/** Levels picked for this career (none = all of them). */
export function levelPicks(form: Pick<ElectionForm, "levelScope">, career: Career): number[] {
  const own = careerLevels(career);
  return own.filter((level) => form.levelScope.includes(level));
}

/** The flat career / program / level lists the API expects for this form. */
export function voterScope(form: ElectionForm, careers: readonly Career[], programs: ProgramsByCareer): VoterFilter {
  const picked = careers.filter((c) => form.careerScope.includes(c.code));
  const programRows = picked.map((c) => ({ picks: programPicks(form, c, programs), all: programs.get(c.code) ?? [] }));
  const levelRows = picked.map((c) => ({ picks: levelPicks(form, c), all: careerLevels(c) }));
  return {
    termId: form.termId,
    careerScope: picked.map((c) => c.code),
    programScope: programRows.some((r) => r.picks.length) ? [...new Set(programRows.flatMap((r) => (r.picks.length ? r.picks : r.all)))] : [],
    levelScope: levelRows.some((r) => r.picks.length)
      ? [...new Set(levelRows.flatMap((r) => (r.picks.length ? r.picks : r.all)))].sort((a, b) => a - b)
      : [],
  };
}

export interface LevelCount {
  level: number;
  count: number;
  /** False when the level is filtered out (its count is then 0). */
  included: boolean;
}

export interface ProgramCount {
  code: string;
  count: number;
  /** False when the program is filtered out (its count is then 0). */
  included: boolean;
}

export interface CareerPool {
  career: Career;
  /** Students of this career who can vote. */
  total: number;
  levels: LevelCount[];
  /** Largest level count before the level filter, so bars keep their scale while levels are toggled. */
  scale: number;
  /** Who can vote per program (level filter applied); empty for careers without programs. */
  programs: ProgramCount[];
  /** Largest program count before the program filter, so program bars keep their scale too. */
  programScale: number;
}

export interface VoterPool {
  total: number;
  /** One entry per picked career, in career order. */
  careers: CareerPool[];
  /** Active enrollments in the term per career code, before any filter (career cards). */
  careerTotals: ReadonlyMap<string, number>;
}

/** Who can vote, broken down by career and level. Same rules as `countEligibleVoters` (Active enrollments in the term). */
export function voterPool(
  enrollments: readonly VoterEnrollment[],
  form: ElectionForm,
  careers: readonly Career[],
  programs: ProgramsByCareer,
): VoterPool {
  const inTerm = form.termId ? enrollments.filter((e) => e.termId === form.termId && e.status === "Active") : [];
  const careerTotals = new Map<string, number>();
  for (const e of inTerm) careerTotals.set(e.careerCode, (careerTotals.get(e.careerCode) ?? 0) + 1);

  const scope = voterScope(form, careers, programs);
  const programSet = new Set(scope.programScope);
  const levelSet = new Set(scope.levelScope);
  const levelOk = (level: number) => levelSet.size === 0 || levelSet.has(level);

  const programOk = (code: string | null) => programSet.size === 0 || (code !== null && programSet.has(code));

  const pools = careers
    .filter((c) => scope.careerScope.includes(c.code))
    .map((career): CareerPool => {
      const ofCareer = inTerm.filter((e) => e.careerCode === career.code);
      const rows = ofCareer.filter((e) => programOk(e.programCode));
      const byLevel = new Map<number, number>();
      for (const e of rows) byLevel.set(e.level, (byLevel.get(e.level) ?? 0) + 1);
      const levels = careerLevels(career).map((level) => {
        const included = levelOk(level);
        return { level, count: included ? (byLevel.get(level) ?? 0) : 0, included };
      });

      const byProgram = new Map<string, number>();
      for (const e of ofCareer) if (e.programCode && levelOk(e.level)) byProgram.set(e.programCode, (byProgram.get(e.programCode) ?? 0) + 1);
      const own = programs.get(career.code) ?? [];
      return {
        career,
        total: rows.filter((e) => levelOk(e.level)).length,
        levels,
        scale: Math.max(1, ...careerLevels(career).map((l) => byLevel.get(l) ?? 0)),
        programs: own.map((code) => {
          const included = programOk(code);
          return { code, count: included ? (byProgram.get(code) ?? 0) : 0, included };
        }),
        programScale: Math.max(1, ...own.map((code) => byProgram.get(code) ?? 0)),
      };
    });

  return { total: pools.reduce((sum, p) => sum + p.total, 0), careers: pools, careerTotals };
}

/* -------------------------------------------------------------------------- */
/*                              Edit and delete                               */
/* -------------------------------------------------------------------------- */

export const electionEditHref = (id: string) => `/elections/${encodeURIComponent(id)}/edit`;

/**
 * The wizard edits drafts only. Once an election is scheduled its details and who
 * can vote are fixed; only the schedule moves (Settings → Election details).
 */
export function canEditElection(status: ElectionStatus): boolean {
  return status === "Draft";
}

/** Only drafts can be deleted (nothing has been sent to voters yet). */
export function canDeleteElection(status: ElectionStatus): boolean {
  return status === "Draft";
}

/** Why an election can't be edited, for menus and the edit page. */
export function editBlockedReason(status: ElectionStatus): string {
  if (status === "Upcoming") return "It's scheduled, so its details are locked. Move it back to draft from its Manage page to edit it, or move the schedule in its settings.";
  if (status === "Ongoing") return "Voting is ongoing, so its settings are locked.";
  if (status === "Completed") return "Voting has ended, so its settings are locked.";
  return "It was cancelled, so its settings are locked.";
}

/* -------------------------------------------------------------------------- */
/*                                 Validation                                 */
/* -------------------------------------------------------------------------- */

export interface ElectionForm extends CandidacySettings {
  title: string;
  category: ElectionCategory;
  description: string;
  termId: string | null;
  rules: string;
  opensAt: LocalDateTime | null;
  closesAt: LocalDateTime | null;
  /** Picked careers (an election needs at least one). */
  careerScope: string[];
  /** Programs picked to narrow their career; a career with none picked takes all its programs. */
  programScope: string[];
  /** Levels picked to narrow their career; a career with none picked takes all its levels. */
  levelScope: number[];
}

/**
 * The form for an existing election. An empty career filter means "every career"
 * in the database, so the form picks them all. A career whose programs (or levels)
 * are all listed is shown as "All".
 */
export function electionToForm(election: Election, careers: readonly Career[], programs: ProgramsByCareer): ElectionForm {
  const careerScope = election.careerScope.length ? election.careerScope : careers.map((c) => c.code);
  const picked = careers.filter((c) => careerScope.includes(c.code));
  const narrowed = <T,>(all: readonly T[], saved: readonly T[]) => {
    const picks = all.filter((x) => saved.includes(x));
    return picks.length === all.length ? [] : picks;
  };
  return {
    title: election.title,
    category: election.category,
    description: election.description,
    termId: election.termId,
    rules: election.rules ?? "",
    opensAt: instantToLocal(election.startsAt),
    closesAt: instantToLocal(election.endsAt),
    careerScope: picked.map((c) => c.code),
    programScope: picked.flatMap((c) => narrowed(programs.get(c.code) ?? [], election.programScope)),
    levelScope: picked.flatMap((c) => narrowed(careerLevels(c), election.levelScope)),
    openCandidacy: election.openCandidacy,
    crossPositionCandidacy: election.crossPositionCandidacy,
    requireActiveEnrollment: election.requireActiveEnrollment,
  };
}

export type DetailsErrors = Partial<Record<"title" | "description" | "termId" | "opensAt" | "closesAt", string>>;
export type VotersErrors = Partial<Record<"careerScope", string>>;

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
  return errors;
}
