import {
  careerLevels,
  electionToForm,
  formatLevelScope,
  formatProgramScope,
  levelGroupLabel,
  levelPicks,
  programGroupLabel,
  programPicks,
  programsByCareer,
  voterPool,
} from "@/lib/elections";
import { careerColor, sortCareers } from "@/lib/programs";
import { formatStudentName, getStudentInitials } from "@/lib/students";
import type { Candidate, Position, SocialLink, SocialPlatform } from "@/types/ballot.types";
import type { Election, VoterEnrollment } from "@/types/election.types";
import type { Career } from "@/types/program.types";
import type { Student } from "@/types/student.types";

/* Ballot helpers: ordering, labels and the Create position form. */

/** Oldest first, so positions keep the order they were added in (President before P.R.O.). */
export const sortPositions = (positions: readonly Position[]) =>
  [...positions].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

/** "1 seat · 2 candidates" */
export function positionSummary(position: Position, candidateCount: number): string {
  const seats = `${position.maxVotes} ${position.maxVotes === 1 ? "seat" : "seats"}`;
  return `${seats} · ${candidateCount} ${candidateCount === 1 ? "candidate" : "candidates"}`;
}

/** A candidate with the student's details, when the student list has them. */
export interface CandidateRow {
  candidate: Candidate;
  student: Student | null;
  /** "Maria Santos", or the student number when the student isn't known. */
  name: string;
  initials: string;
}

export function toCandidateRow(candidate: Candidate, student: Student | undefined): CandidateRow {
  if (!student) return { candidate, student: null, name: candidate.studentId, initials: "?" };
  return { candidate, student, name: `${student.firstName} ${student.lastName}`.trim() || formatStudentName(student), initials: getStudentInitials(student) };
}

/* -------------------------------------------------------------------------- */
/*                                  Candidate                                 */
/* -------------------------------------------------------------------------- */

export const PORTRAIT_MAX_BYTES = 2 * 1024 * 1024;

/** Names for the Platform menu, in the order SLVP-BE lists them. */
export const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  x: "X",
  youtube: "YouTube",
  website: "Website",
};

/** SLVP-BE accepts up to 10 links per candidate. */
export const MAX_LINKS = 10;

/** A link row in the candidate dialog; `key` only tells the rows apart. */
export interface LinkDraft extends SocialLink {
  key: string;
}

let linkKeys = 0;
export function newLinkDraft(link: Partial<SocialLink> = {}): LinkDraft {
  linkKeys += 1;
  return { key: `link-${linkKeys}`, platform: link.platform ?? "website", url: link.url ?? "", label: link.label ?? null };
}

/** The platform for a new row: the first one the candidate doesn't link to yet. */
export function nextPlatform(links: readonly LinkDraft[]): SocialPlatform {
  const used = new Set(links.map((l) => l.platform));
  const order: SocialPlatform[] = ["facebook", "instagram", "tiktok", "x", "youtube", "website"];
  return order.find((p) => !used.has(p)) ?? "website";
}

export interface CandidateForm {
  studentId: string;
  positionId: string | null;
  /** `null` = independent. */
  partylistId: string | null;
  motto: string;
  links: LinkDraft[];
}

export type CandidateErrors = Partial<Record<"studentId" | "positionId", string>> & {
  /** Problems with link rows, by `LinkDraft.key`. */
  links?: Record<string, string>;
};

/** Rows with a URL, ready to send (empty rows are dropped). */
export function linksToSave(links: readonly LinkDraft[]): SocialLink[] {
  return links.filter((l) => l.url.trim()).map(({ platform, url, label }) => ({ platform, url: url.trim(), label: label?.trim() || null }));
}

/** Same rule as SLVP-BE: a full http(s) address. */
function linkProblem(url: string): string | null {
  const value = url.trim();
  if (!value) return null;
  if (value.length > 500) return "Use at most 500 characters.";
  try {
    const parsed = new URL(value);
    if ((parsed.protocol === "https:" || parsed.protocol === "http:") && parsed.hostname) return null;
  } catch {
    // Not a URL; reported below.
  }
  return "Use a full address starting with https://";
}

export const STUDENT_ID_LENGTH = 11;

/** Why `studentId` can't be used (once all 11 digits are in), or `null`. `known` is `null` when the student list isn't available. */
export function studentIdProblem(
  studentId: string,
  known: ReadonlySet<string> | null,
  takenBy: ReadonlyMap<string, Candidate>,
  editingId: string | null,
): string | null {
  if (studentId.length !== STUDENT_ID_LENGTH) return null;
  if (known && !known.has(studentId)) return "No student has this ID.";
  const taken = takenBy.get(studentId);
  if (taken && taken.id !== editingId) return "This student is already running in this election.";
  return null;
}

/**
 * A known student and a position are required, and a student can run for only one
 * position per election (`takenBy` maps student numbers to the candidate already using them).
 */
export function validateCandidate(
  form: CandidateForm,
  known: ReadonlySet<string> | null,
  takenBy: ReadonlyMap<string, Candidate>,
  editingId: string | null,
): CandidateErrors {
  const errors: CandidateErrors = {};
  const studentId = form.studentId.trim();
  if (!studentId) errors.studentId = "Enter the student ID.";
  else if (!/^\d{11}$/.test(studentId)) errors.studentId = "Use all 11 digits.";
  else {
    const problem = studentIdProblem(studentId, known, takenBy, editingId);
    if (problem) errors.studentId = problem;
  }
  if (!form.positionId) errors.positionId = "Pick a position.";
  const links: Record<string, string> = {};
  for (const link of form.links) {
    const problem = linkProblem(link.url);
    if (problem) links[link.key] = problem;
  }
  if (Object.keys(links).length) errors.links = links;
  return errors;
}

/* -------------------------------------------------------------------------- */
/*                               Create position                              */
/* -------------------------------------------------------------------------- */

export const MAX_SEATS = 20;

export interface PositionForm {
  title: string;
  /** As typed in the Seats box. */
  seats: string;
}

export type PositionErrors = Partial<Record<keyof PositionForm, string>>;

/** Title required and not already used in this election; seats a whole number from 1 to MAX_SEATS. */
export function validatePosition(form: PositionForm, existing: readonly Position[]): PositionErrors {
  const errors: PositionErrors = {};
  const title = form.title.trim();
  if (!title) errors.title = "Required.";
  else if (existing.some((p) => p.title.trim().toLowerCase() === title.toLowerCase())) errors.title = "This election already has that position.";
  const seats = Number(form.seats);
  if (!Number.isInteger(seats) || seats < 1 || seats > MAX_SEATS) errors.seats = `Use a whole number from 1 to ${MAX_SEATS}.`;
  return errors;
}

/* -------------------------------------------------------------------------- */
/*                          Position voter scope                              */
/* -------------------------------------------------------------------------- */

/*
 * Who can vote for a position, picked per career like the election wizard does, but only
 * from what the election itself allows. The API keeps one flat list each of careers,
 * programs and levels (a voter must match all three), so `positionScopeToApi` spells out
 * "all" for a career whenever another picked career is narrowed. Program codes belong to
 * one career and career level ranges never overlap, so the flat lists stay exact. Voters
 * without a program (careers like JHS) aren't limited by the program list at all.
 */

/** One career the election lets vote, with what it allows inside that career. */
export interface ScopeCareer {
  career: Career;
  color: string;
  /** Programs the election allows for this career (empty when the career has none). */
  programs: string[];
  /** Levels the election allows for this career. */
  levels: number[];
  /** Students of this career who can vote in the election, or `null` when enrollments aren't loaded. */
  voters: number | null;
}

/** The careers a position can be limited to, in career order. */
export function scopeCareers(election: Election, careers: readonly Career[], enrollments: readonly VoterEnrollment[] | null): ScopeCareer[] {
  const sorted = sortCareers(careers);
  const programs = programsByCareer(sorted, enrollments ?? []);
  const form = electionToForm(election, sorted, programs);
  const pool = enrollments ? voterPool(enrollments, form, sorted, programs) : null;
  return sorted
    .filter((c) => form.careerScope.includes(c.code))
    .map((career) => {
      const programPicked = programPicks(form, career, programs);
      const levelPicked = levelPicks(form, career);
      return {
        career,
        color: careerColor(career, sorted),
        programs: programPicked.length ? programPicked : [...(programs.get(career.code) ?? [])],
        levels: levelPicked.length ? levelPicked : careerLevels(career),
        voters: pool ? (pool.careers.find((p) => p.career.code === career.code)?.total ?? 0) : null,
      };
    });
}

/** Picks in the dialog. A picked career with none of its programs (or levels) picked takes all of them. */
export interface PositionScopeForm {
  careers: string[];
  programs: string[];
  levels: number[];
}

/** Every career the election allows, nothing narrowed. */
export const everyoneScope = (options: readonly ScopeCareer[]): PositionScopeForm => ({ careers: options.map((o) => o.career.code), programs: [], levels: [] });

const ownPicks = <T>(all: readonly T[], picks: readonly T[]) => all.filter((x) => picks.includes(x));

/**
 * Toggling a pill: picking none, or every one, goes back to "All".
 * Returns the career's new picks in display order.
 */
export function togglePick<T>(all: readonly T[], picks: readonly T[], value: T): T[] {
  const current = ownPicks(all, picks);
  const next = current.includes(value) ? current.filter((p) => p !== value) : [...current, value];
  return next.length === all.length ? [] : all.filter((x) => next.includes(x));
}

/** This career's program / level picks (none = all). */
export const programPicksOf = (option: ScopeCareer, form: PositionScopeForm) => ownPicks(option.programs, form.programs);
export const levelPicksOf = (option: ScopeCareer, form: PositionScopeForm) => ownPicks(option.levels, form.levels);

/**
 * Keeps the picks saveable. Careers without programs (e.g. JHS) are fine next to a program
 * filter: the API doesn't apply the program list to voters who have no program. Levels are
 * different: every enrollment has one, so a career whose level range isn't set can't share a
 * position narrowed by level (its levels can't be listed). The latest click wins: narrowing
 * unpicks such careers, and picking one clears the level picks. `note` says what changed.
 */
export function resolveScope(prev: PositionScopeForm, next: PositionScopeForm, options: readonly ScopeCareer[]): { scope: PositionScopeForm; note: string | null } {
  const picked = options.filter((o) => next.careers.includes(o.career.code));
  const blank = picked.filter((o) => o.levels.length === 0);
  if (!blank.length || !picked.some((o) => levelPicksOf(o, next).length > 0)) return { scope: next, note: null };

  const names = (list: readonly ScopeCareer[]) => list.map((o) => o.career.name).join(" and ");
  const addedBlank = blank.filter((o) => !prev.careers.includes(o.career.code));
  if (addedBlank.length) {
    // A career without levels was just picked: drop the level picks it can't match.
    return { scope: { ...next, levels: [] }, note: `Level picks cleared: ${names(addedBlank)} ${addedBlank.length === 1 ? "has" : "have"} no levels set.` };
  }
  // The position was just narrowed by level: drop the careers that can't match it.
  const one = blank.length === 1;
  return {
    scope: { ...next, careers: next.careers.filter((code) => !blank.some((o) => o.career.code === code)) },
    note: `Unpicked ${names(blank)}: ${one ? "it has" : "they have"} no levels set, so ${one ? "it" : "they"} can't be narrowed by level. Set ${one ? "its" : "their"} levels in Programs & Careers, or give ${one ? "it" : "them"} a position of ${one ? "its" : "their"} own.`,
  };
}

export interface PositionScopeLists {
  careerScope: string[];
  programScope: string[];
  levelScope: number[];
}

/** The flat lists for the API, or why the picks can't be saved. Empty lists = no extra limit. */
export function positionScopeToApi(form: PositionScopeForm, options: readonly ScopeCareer[]): { lists: PositionScopeLists } | { error: string } {
  const picked = options.filter((o) => form.careers.includes(o.career.code));
  if (picked.length === 0) return { error: "Pick at least one career." };

  const programRows = picked.map((o) => ({ option: o, picks: programPicksOf(o, form) }));
  const levelRows = picked.map((o) => ({ option: o, picks: levelPicksOf(o, form) }));
  const programsNarrowed = programRows.some((r) => r.picks.length);
  const levelsNarrowed = levelRows.some((r) => r.picks.length);

  // Careers without programs add nothing to the program list; the API lets their voters through
  // it (they have no program to match). Every voter has a level, though, so a career whose levels
  // can't be listed can't sit next to one narrowed by level. (`resolveScope` normally prevents this.)
  if (levelsNarrowed) {
    const blank = picked.find((o) => o.levels.length === 0);
    if (blank) return { error: `${blank.career.name} has no levels set, so levels can't be narrowed while it's picked. Make it its own position.` };
  }

  return {
    lists: {
      careerScope: picked.length === options.length ? [] : picked.map((o) => o.career.code),
      programScope: programsNarrowed ? [...new Set(programRows.flatMap((r) => (r.picks.length ? r.picks : r.option.programs)))] : [],
      levelScope: levelsNarrowed ? [...new Set(levelRows.flatMap((r) => (r.picks.length ? r.picks : r.option.levels)))].sort((a, b) => a - b) : [],
    },
  };
}

/** Right side of a career's panel: "BSIT only", "BSIT, BSCS · 1st year", or `null` when nothing is narrowed. */
export function narrowSummary(option: ScopeCareer, form: PositionScopeForm, careers: readonly Career[]): string | null {
  const programs = programPicksOf(option, form);
  const levels = levelPicksOf(option, form);
  const parts = [
    programs.length ? (programs.length === 1 ? `${programs[0]} only` : formatProgramScope(programs, 2)) : null,
    levels.length ? formatLevelScope(levels, careers) : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** The row under the panels: what the picks add up to, e.g. "Scoped to BSIT" + "Tertiary · all year levels". */
export function scopeSummary(form: PositionScopeForm, options: readonly ScopeCareer[], careers: readonly Career[]): { title: string; detail: string } | null {
  const picked = options.filter((o) => form.careers.includes(o.career.code));
  if (picked.length === 0) return null;

  const names = picked.map((o) => o.career.name).join(" + ");
  const programs = picked.flatMap((o) => programPicksOf(o, form));
  const levels = picked.flatMap((o) => levelPicksOf(o, form));
  const single = picked.length === 1 ? picked[0].career : null;

  // Several careers, some narrowed: say what each one keeps ("TER: BSIT only · 1st year; SHS: everyone").
  if (!single && (programs.length || levels.length)) {
    return { title: "Scoped by career", detail: picked.map((o) => `${o.career.code}: ${narrowSummary(o, form, careers) ?? "everyone"}`).join("; ") };
  }
  const allLevels = single ? `all ${levelGroupLabel(single).toLowerCase()}s` : "all levels";
  const levelText = levels.length ? formatLevelScope(levels, careers) : allLevels;

  if (programs.length) return { title: `Scoped to ${formatProgramScope(programs)}`, detail: `${names} · ${levelText}` };
  if (levels.length) {
    // Only one career gets here (several narrowed careers return above).
    const career = picked[0];
    return { title: `Scoped to ${levelText}`, detail: career.programs.length ? `${names} · all ${programGroupLabel(career.career).toLowerCase()}` : names };
  }
  if (picked.length === options.length) return { title: "Everyone in this election", detail: `${names} · ${allLevels}` };
  return { title: `Scoped to ${names}`, detail: allLevels };
}
