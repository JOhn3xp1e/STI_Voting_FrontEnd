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
  motto: string | null;
  /** Social and campaign links shown with the candidate. */
  socialLinks: SocialLink[];
  createdAt: string;
}

/** Same values as `SocialLink.Platforms` in SLVP-BE; the icon is picked from the platform. */
export const SOCIAL_PLATFORMS = ["facebook", "instagram", "tiktok", "x", "youtube", "website"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

/** One of a candidate's links, e.g. `{ platform: "facebook", url: "https://facebook.com/juan" }`. */
export interface SocialLink {
  platform: SocialPlatform;
  url: string;
  /** Optional display label (e.g. "Campaign site"). */
  label: string | null;
}
