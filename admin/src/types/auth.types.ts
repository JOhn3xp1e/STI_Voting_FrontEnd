/**
 * Authentication types shared by the admin sign-in UI and the auth service.
 */

/** The signed-in administrator, as shown in the dashboard shell. */
export interface AdminProfile {
  firstName: string;
  fullName: string;
  email: string;
  /** Display label of the admin's role, e.g. "super admin". */
  role: string;
}

/** Values collected by the admin sign-in form. */
export interface AdminSignInRequest {
  email: string;
  password: string;
  /** Whether the session should persist beyond the browser session. */
  rememberMe: boolean;
}
