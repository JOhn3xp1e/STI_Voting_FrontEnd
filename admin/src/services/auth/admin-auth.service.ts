import { isAuthApiError, isAuthError, isAuthRetryableFetchError, type Session } from "@supabase/supabase-js";

import { clearSavedChats } from "@/lib/chat-memory";
import { getSupabase, SupabaseConfigError, setRememberSession } from "@/lib/supabase/client";
import { getApiErrorMessage } from "@/services/api/error-message";
import { apiClient, isApiError } from "@/services/api/client";
import type { AdminAccount, AdminProfile, AdminSignInRequest, MeResponse } from "@/types/auth.types";

/*
 * Admin authentication.
 *
 * WHO someone is comes from Supabase Auth (password or Google). WHAT they may
 * do comes from the backend's admins table, read through `GET /api/auth/me`.
 * The frontend never decides access by itself: after any sign-in it asks `/me`.
 * Routes are relative to NEXT_PUBLIC_API_URL (which ends in `/api`).
 */

const ROUTES = {
  me: "auth/me",
  acceptInvite: "auth/accept-invite",
} as const;

/** The API container sleeps when idle; the first request after that can take a while. */
const AUTH_TIMEOUT_MS = 60_000;

/* -------------------------------------------------------------------------- */
/*                                  Backend                                   */
/* -------------------------------------------------------------------------- */

/** Last `/me` answer, so the dashboard can open straight after signing in without asking again. */
let cachedMe: MeResponse | null = null;

export function peekCachedMe(): MeResponse | null {
  return cachedMe;
}

export function clearCachedMe() {
  cachedMe = null;
}

/** The signed-in login's standing with the admin portal. Needs a session. */
export async function getMe({ signal }: { signal?: AbortSignal } = {}): Promise<MeResponse> {
  const me = await apiClient.get<MeResponse>(ROUTES.me, { signal, timeoutMs: AUTH_TIMEOUT_MS, skipAuthHandling: true });
  cachedMe = me;
  return me;
}

/** Finishes accepting the invitation. Resolves with `status: "active"`. */
export async function acceptInvite(fullName: string): Promise<MeResponse> {
  const me = await apiClient.post<MeResponse, { fullName: string }>(
    ROUTES.acceptInvite,
    { fullName },
    { timeoutMs: AUTH_TIMEOUT_MS, skipAuthHandling: true },
  );
  cachedMe = me;
  return me;
}

/* -------------------------------------------------------------------------- */
/*                                  Supabase                                  */
/* -------------------------------------------------------------------------- */

function origin(): string {
  return window.location.origin;
}

/** Current session, or `null` when signed out (or Supabase isn't configured). */
export async function getSession(): Promise<Session | null> {
  try {
    const { data } = await getSupabase().auth.getSession();
    return data.session;
  } catch {
    return null;
  }
}

export async function signInWithPassword({ email, password, rememberMe }: AdminSignInRequest): Promise<void> {
  const supabase = getSupabase();
  setRememberSession(rememberMe);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/** Leaves the page for Google; it comes back through `/auth/callback`. */
export async function signInWithGoogle({ rememberMe, next }: { rememberMe: boolean; next?: string | null }): Promise<void> {
  const supabase = getSupabase();
  setRememberSession(rememberMe);
  // The callback continues to /auth/after-login, which asks `/me` and then opens `next`.
  const callback = new URL("/auth/callback", origin());
  if (next) callback.searchParams.set("next", `/auth/after-login?next=${encodeURIComponent(next)}`);
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callback.toString() },
  });
  if (error) throw error;
}

/** Emails a reset link that lands on `/auth/confirm` and continues to `/reset-password`. */
export async function sendPasswordResetEmail(email: string): Promise<void> {
  const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: `${origin()}/auth/confirm?next=/reset-password`,
  });
  if (error) throw error;
}

export type EmailLinkType = "invite" | "email" | "recovery";

/** Uses the single-use code from an email link and signs the person in. */
export async function verifyEmailLink(tokenHash: string, type: EmailLinkType): Promise<void> {
  const { error } = await getSupabase().auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) throw error;
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await getSupabase().auth.updateUser({ password });
  if (error) throw error;
}

/** Ends this login's sessions on every other device (after a password change). Never throws. */
export async function signOutOtherDevices(): Promise<void> {
  try {
    await getSupabase().auth.signOut({ scope: "others" });
  } catch {
    // Best effort: the password is already changed.
  }
}

/** Leaves the page for Google to link it to the current login, then returns to `returnTo`. */
export async function linkGoogle(returnTo: string): Promise<void> {
  const callback = new URL("/auth/callback", origin());
  callback.searchParams.set("next", returnTo);
  const { error } = await getSupabase().auth.linkIdentity({
    provider: "google",
    options: { redirectTo: callback.toString() },
  });
  if (error) throw error;
}

/** Whether the current login can also sign in with Google. */
export async function hasGoogleIdentity(): Promise<boolean> {
  const { data } = await getSupabase().auth.getUser();
  return data.user?.identities?.some((identity) => identity.provider === "google") ?? false;
}

export type SignInMethod = "password" | "google" | "microsoft";

const OAUTH_PROVIDERS: Record<string, SignInMethod> = { google: "google", azure: "microsoft" };

/**
 * How the current session was started: the newest entry in the token's `amr`
 * claim. For OAuth it doesn't name the provider, so that comes from the
 * identity used most recently. Email links (invite, reset) count as password.
 * `null` when there's no session or it can't be read.
 */
export async function getCurrentSignInMethod(): Promise<SignInMethod | null> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return null;
    const entries = data.currentAuthenticationMethods.map((entry) =>
      typeof entry === "string" ? { method: entry, timestamp: 0 } : entry,
    );
    const latest = entries.reduce<(typeof entries)[number] | null>(
      (best, entry) => (!best || entry.timestamp > best.timestamp ? entry : best),
      null,
    );
    if (!latest) return null;
    if (latest.method !== "oauth") return "password";

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    const oauthIdentity = (user?.identities ?? [])
      .filter((identity) => identity.provider in OAUTH_PROVIDERS)
      .sort((a, b) => (b.last_sign_in_at ?? "").localeCompare(a.last_sign_in_at ?? ""))[0];
    const provider = oauthIdentity?.provider ?? String(user?.app_metadata.provider ?? "");
    return OAUTH_PROVIDERS[provider] ?? null;
  } catch {
    return null;
  }
}

/** Ends the session on this device. Never throws. */
export async function signOut(): Promise<void> {
  cachedMe = null;
  clearSavedChats();
  try {
    await getSupabase().auth.signOut({ scope: "local" });
  } catch {
    // Already signed out, or Supabase unreachable: the local session is cleared either way.
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

/** The admin as the dashboard shell shows them. */
export function toAdminProfile(admin: AdminAccount, fallbackEmail: string | null): AdminProfile {
  const email = admin.email || fallbackEmail || "";
  const fullName = admin.fullName?.trim() || email.split("@")[0] || "Admin";
  return {
    id: admin.id,
    fullName,
    firstName: fullName.split(/\s+/)[0] ?? fullName,
    email,
    avatarUrl: admin.avatarUrl,
    role: "super admin",
  };
}

/** A rate limit or network problem: trying again later can work (unlike an expired link). */
export function isTemporaryAuthError(error: unknown): boolean {
  if (isAuthRetryableFetchError(error)) return true;
  if (!isAuthError(error)) return false;
  return (
    error.status === 429 ||
    error.status === 0 ||
    error.code === "over_request_rate_limit" ||
    error.code === "over_email_send_rate_limit"
  );
}

const RATE_LIMIT_MESSAGE ="Please wait a minute before trying again.";
const NETWORK_MESSAGE = "Can't reach the sign-in service. Check your connection and try again.";

/**
 * User-facing message for a failed auth step. `context` picks the wording for
 * the common case (e.g. wrong credentials on sign-in).
 */
export function getAuthErrorMessage(error: unknown, context: "sign-in" | "password" | "email" | "generic" = "generic"): string {
  if (error instanceof SupabaseConfigError) {
    return "Sign-in isn't available yet: Supabase hasn't been configured for this site.";
  }

  if (isAuthRetryableFetchError(error)) return NETWORK_MESSAGE;

  if (isAuthApiError(error) || isAuthError(error)) {
    const code = error.code;
    if (error.status === 429 || code === "over_request_rate_limit" || code === "over_email_send_rate_limit") {
      return RATE_LIMIT_MESSAGE;
    }
    if (code === "invalid_credentials" || (context === "sign-in" && error.status === 400)) {
      return "Incorrect email or password.";
    }
    if (code === "same_password") return "Choose a password different from your current one.";
    if (code === "weak_password") {
      return error.message || "Choose a stronger password (at least 8 characters).";
    }
    if (code === "session_not_found" || code === "refresh_token_not_found") {
      return "Your session has expired. Sign in again.";
    }
    if (code === "identity_already_exists") return "That Google account is already linked to another login.";
    if (code === "manual_linking_disabled") return "Linking Google isn't enabled yet. Ask the system owner, or set a password instead.";
    if (error.status === 0 || error.status === undefined) return NETWORK_MESSAGE;
    return error.message || "Something went wrong. Please try again.";
  }

  if (isApiError(error)) {
    if (error.kind === "network") return "Can't reach the admin server. Check your connection and try again.";
    if (error.kind === "timeout") return "The admin server is taking too long to wake up. Please try again.";
    return getApiErrorMessage(error);
  }

  return "Something went wrong. Please try again.";
}
