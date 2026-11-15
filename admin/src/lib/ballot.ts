import { formatStudentName, getStudentInitials } from "@/lib/students";
import type { Candidate, Position } from "@/types/ballot.types";
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

export interface CandidateForm {
  studentId: string;
  positionId: string | null;
  /** `null` = independent. */
  partylistId: string | null;
  platform: string;
}

export type CandidateErrors = Partial<Record<"studentId" | "positionId", string>>;

/**
 * A student and a position are required, and a student can run for only one
 * position per election (`takenBy` maps student numbers to the candidate already using them).
 */
export function validateCandidate(form: CandidateForm, takenBy: ReadonlyMap<string, Candidate>, editingId: string | null): CandidateErrors {
  const errors: CandidateErrors = {};
  const studentId = form.studentId.trim();
  const taken = takenBy.get(studentId);
  if (!studentId) errors.studentId = "Pick a student.";
  else if (!/^\d{11}$/.test(studentId)) errors.studentId = "Use the 11-digit student number.";
  else if (taken && taken.id !== editingId) errors.studentId = "This student is already running in this election.";
  if (!form.positionId) errors.positionId = "Pick a position.";
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
