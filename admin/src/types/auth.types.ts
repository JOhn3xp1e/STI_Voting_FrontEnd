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

export interface MeResponse {
  authUserId: string;
  email: string | null;
  status: MeStatus;
  admin: AdminAccount | null;
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
}

/** Values collected by the admin sign-in form. */
export interface AdminSignInRequest {
  email: string;
  password: string;
  /** Whether the session should outlive the browser session. */
  rememberMe: boolean;
}
