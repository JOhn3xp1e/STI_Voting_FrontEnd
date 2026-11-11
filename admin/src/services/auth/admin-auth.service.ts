import { env } from "@/config/env";
import { apiClient, isApiError } from "@/services/api/client";
import type { AdminSignInRequest } from "@/types/auth.types";

import { simulateSignInPreview } from "./sign-in-preview";

/**
 * Admin sign-in route of the ASP.NET Core Web API, relative to
 * `NEXT_PUBLIC_API_URL`.
 *
 * PLACEHOLDER: change it to the real route once the endpoint contract is defined.
 */
export const ADMIN_SIGN_IN_PATH = "auth/admin/sign-in";

interface SignInOptions {
  /** Cancels the request (e.g. when the sign-in screen is left mid-request). */
  signal?: AbortSignal;
}

/**
 * Sends the credentials to the Web API. Resolves only on a 2xx response; any
 * other outcome (wrong credentials, server error, network failure, missing
 * `NEXT_PUBLIC_API_URL`) rejects with an `ApiError`.
 *
 * Session handling (cookie or token) follows the backend contract and is not
 * implemented yet, so nothing is stored here. If the API sets an auth cookie
 * from another origin, add `credentials: "include"` to the request options.
 */
export async function signInAdmin(request: AdminSignInRequest, { signal }: SignInOptions = {}): Promise<void> {
  await apiClient.post<unknown, AdminSignInRequest>(ADMIN_SIGN_IN_PATH, request, { signal });
}

/**
 * Entry point used by the sign-in screen.
 *
 * - Normally: the real Web API request (`signInAdmin`).
 * - Development with `NEXT_PUBLIC_AUTH_DEMO_MODE=true`: the animation preview,
 *   which only waits ~2 s. It is not authentication and creates no session.
 *   `env.authDemoMode` is always `false` in production builds.
 */
export function authenticateAdmin(request: AdminSignInRequest, options: SignInOptions = {}): Promise<void> {
  // The local NODE_ENV check lets the bundler drop the preview from production builds entirely.
  if (process.env.NODE_ENV === "development" && env.authDemoMode) {
    return simulateSignInPreview(options.signal);
  }
  return signInAdmin(request, options);
}

const GENERIC_SIGN_IN_ERROR = "Something went wrong while signing in. Please try again.";

/** User-facing message for a failed sign-in. */
export function getSignInErrorMessage(error: unknown): string {
  if (!isApiError(error)) return GENERIC_SIGN_IN_ERROR;

  switch (error.kind) {
    case "config":
      return "Sign-in isn't available yet. The authentication service hasn't been configured.";
    case "network":
      return "Can't reach the authentication server. Check your connection and try again.";
    case "timeout":
      return "The authentication server took too long to respond. Please try again.";
    case "parse":
      return "The authentication server sent an unexpected response. Please try again.";
    case "aborted":
      return "Sign-in was cancelled. Please try again.";
    case "http":
      if (error.status === 401) return "Incorrect email or password. Please try again.";
      if (error.status === 400 || error.status === 422) return "Check your email and password, then try again.";
      if (error.status === 403) return "This account doesn't have access to the admin portal.";
      if (error.status === 429) return "Too many sign-in attempts. Wait a moment, then try again.";
      if (error.status !== null && error.status >= 500) {
        return "The authentication server ran into a problem. Please try again shortly.";
      }
      return GENERIC_SIGN_IN_ERROR;
  }
}
