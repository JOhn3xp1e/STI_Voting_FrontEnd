/**
 * Authentication types shared by the auth screens, the session gate and the auth service.
 */

/** An admin account as the backend returns it (`AdminResponse`). */
export interface AdminAccount {
  /** e.g. "ADM-00001" */
  id: string;
  email: string;
  fullName: string | null;
  /** Storage key; never displayed. */
  avatarPath: string | null;
  /** Full public URL for `<img>`, or `null` (show initials). */
  avatarUrl: string | null;
  isActive: boolean;
  /** `true` once the invitation was accepted. */
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Where the signed-in login stands with the admin portal (`GET /api/auth/me`).
 * - `active`: invited, accepted and active.
 * - `invited`: invited but hasn't finished setting up the account.
 * - `deactivated`: a super admin turned their access off.
 * - `not_invited`: a valid login with no admin record.
 */
export type MeStatus = "active" | "invited" | "deactivated" | "not_invited";

/**
 * - `super_admin`: has an admin account (`admin`); full access.
 * - `election_admin`: only `electionAdmins`; manages just those elections.
 */
export type AdminRole = "super_admin" | "election_admin";

/** One election the login is an election admin of (`electionAdmins` in `/me`). */
export interface MeElectionAdmin {
  /** e.g. "EAD-00001" */
  id: string;
  electionId: string;
  electionTitle: string | null;
  fullName: string;
  avatarUrl: string | null;
  /** `false` until the invitation for this election is accepted. */
  isVerified: boolean;
}

export interface MeResponse {
  authUserId: string;
  email: string | null;
  status: MeStatus;
  admin: AdminAccount | null;
  /** `null` when the login isn't an admin of any kind. */
  role?: AdminRole | null;
  /** Elections this login runs as an election admin (a super admin can also run some). */
  electionAdmins?: MeElectionAdmin[] | null;
}

/** The signed-in administrator, as shown in the dashboard shell. */
export interface AdminProfile {
  id: string;
  firstName: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  /** Display label of the admin's role, e.g. "super admin". */
  role: string;
  /** `false` for election admins: they only see and manage `electionIds`. */
  isSuperAdmin: boolean;
  /** Elections an election admin may open (empty for super admins, who may open all). */
  electionIds: string[];
}

/** Values collected by the admin sign-in form. */
export interface AdminSignInRequest {
  email: string;
  password: string;
  /** Whether the session should outlive the browser session. */
  rememberMe: boolean;
}
