import type { IsoDate } from "@/lib/dates";

/** Comes from the dates: upcoming (not started), current (running today), ended. */
export type TermStatus = "current" | "upcoming" | "ended";

/** A school term from `/api/admin/terms`. */
export interface Term {
  /** e.g. `TRM-00004` */
  id: string;
  /** e.g. `2025-2026` */
  acadYear: string;
  /** 1, 2 or 3 */
  termNumber: number;
  startDate: IsoDate;
  endDate: IsoDate;
}

/** What still points at a term (it can only be deleted when both are 0). */
export interface TermUsage {
  enrollments: number;
  elections: number;
}

/** One enrollment, as needed by the roll-over. */
export interface EnrollmentSummary {
  studentId: string;
  termId: string;
  status: string;
}

export interface NewTermInput {
  acadYear: string;
  termNumber: number;
  startDate: IsoDate;
  endDate: IsoDate;
}
