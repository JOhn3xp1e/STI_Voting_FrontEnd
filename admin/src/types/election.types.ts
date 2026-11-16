/** Same values (and order) as `ElectionCategory` in SLVP-BE/Models/Election/Election.cs. */
export const ELECTION_CATEGORIES = ["Council", "Organization", "Clubs", "Campus", "Event"] as const;
export type ElectionCategory = (typeof ELECTION_CATEGORIES)[number];

/** Same values (and order) as `ElectionStatus` in SLVP-BE. */
export const ELECTION_STATUSES = ["Draft", "Upcoming", "Ongoing", "Completed", "Cancelled"] as const;
export type ElectionStatus = (typeof ELECTION_STATUSES)[number];

/**
 * Who may be a candidate. Chosen when the election is created; the API refuses changes afterwards
 * (SLVP-BE docs/frontend/07-election-candidacy-settings.md).
 */
export interface CandidacySettings {
  /** Any student may run; off = only students inside the election's careers, programs and levels. */
  openCandidacy: boolean;
  /** A student may run for several positions (once per position); off = one position per student. */
  crossPositionCandidacy: boolean;
  /** Candidates need an Active enrollment in the election's term. */
  requireActiveEnrollment: boolean;
}

export const DEFAULT_CANDIDACY: CandidacySettings = {
  openCandidacy: false,
  crossPositionCandidacy: false,
  requireActiveEnrollment: true,
};

/** An election from `/api/admin/election`. */
export interface Election extends CandidacySettings {
  /** e.g. `ELC-00001` */
  id: string;
  title: string;
  description: string;
  rules: string | null;
  /** Banner image URL, or `null` when the election has no banner. */
  photoUrl: string | null;
  category: ElectionCategory;
  /** Career codes that can vote; empty = every career. */
  careerScope: string[];
  /** Program codes that can vote; empty = every program. */
  programScope: string[];
  /** Grade levels that can vote; empty = every level. */
  levelScope: number[];
  status: ElectionStatus;
  termId: string;
  /** When voting opens / closes, as an ISO instant. */
  startsAt: string;
  endsAt: string;
  createdAt: string;
}

/**
 * Fields of a create / update request (the backend sets the id and status).
 * The banner image goes alongside it as a file; see `createElection` / `updateElection`.
 */
export interface ElectionInput {
  title: string;
  description: string;
  rules: string | null;
  category: ElectionCategory;
  careerScope: string[];
  programScope: string[];
  levelScope: number[];
  termId: string;
  startsAt: string;
  endsAt: string;
  /** Sent on create only; left out on update (the settings are fixed once the election exists). */
  candidacy?: CandidacySettings;
}

/** One enrollment, as needed to count who can vote. */
export interface VoterEnrollment {
  studentId: string;
  termId: string;
  careerCode: string;
  /** null when the career has no programs (e.g. JHS). */
  programCode: string | null;
  level: number;
  status: string;
}
