/** A position (office) in an election, from `/api/admin/positions`. */
export interface Position {
  /** e.g. `POS-00001` */
  id: string;
  title: string;
  description: string;
  /** How many candidates a voter may pick for it (its seats). */
  maxVotes: number;
  electionId: string;
  createdAt: string;
}

/** A student running for a position, from `/api/admin/candidates`. */
export interface Candidate {
  /** e.g. `CAND-00001` */
  id: string;
  studentId: string;
  positionId: string;
  electionId: string;
  /** `null` = independent. */
  partylistId: string | null;
  portraitUrl: string | null;
  platform: string | null;
  createdAt: string;
}
