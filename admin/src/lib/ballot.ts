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
