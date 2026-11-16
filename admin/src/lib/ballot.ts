import { formatStudentName, getStudentInitials } from "@/lib/students";
import type { Candidate, Position, SocialLink, SocialPlatform } from "@/types/ballot.types";
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
