import { DASHBOARD_HOME } from "@/config/navigation";
import type { MeResponse } from "@/types/auth.types";

/** Auth screens and the messages the sign-in screen can show. */
export const AUTH_ROUTES = {
  login: "/login",
  afterLogin: "/auth/after-login",
  acceptInvite: "/accept-invite",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
} as const;

/**
 * Only same-site paths are allowed as a `next` target, so a crafted link
 * can't send people to another site after signing in.
 */
export function safeNext(next: string | null | undefined): string | null {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : null;
}

/** Reasons the sign-in screen explains through `?error=` / `?expired=1`. */
export type LoginNotice = "deactivated" | "not_invited" | "link_invalid" | "expired";

export const LOGIN_NOTICES: Record<LoginNotice, string> = {
  deactivated: "Your admin access has been turned off.",
  not_invited: "This account hasn't been invited to the SLVP admin portal.",
  link_invalid: "That link has expired or was already used. Ask a super admin to send a new one, or use “Forgot password?”.",
  expired: "Your session has expired. Sign in again.",
};

/** `/login` URL showing `notice` (and returning to `next` after signing in, if given). */
export function loginHref(notice?: LoginNotice, next?: string | null): string {
  const params = new URLSearchParams();
  if (notice === "expired") params.set("expired", "1");
  else if (notice) params.set("error", notice);
  const target = safeNext(next);
  if (target && target !== DASHBOARD_HOME) params.set("next", target);
  const query = params.toString();
  return query ? `${AUTH_ROUTES.login}?${query}` : AUTH_ROUTES.login;
}

/** Reads the notice from the sign-in screen's query string. */
export function readLoginNotice(params: URLSearchParams): LoginNotice | null {
  if (params.get("expired") === "1") return "expired";
  const error = params.get("error");
  return error && error in LOGIN_NOTICES ? (error as LoginNotice) : null;
}

/**
 * What to do with a login, given its `/me` answer:
 * - `go`: open `href` (the dashboard / requested page, or the accept page).
 * - `deny`: sign out and explain `notice` on the sign-in screen.
 */
export type MeDecision = { kind: "go"; href: string } | { kind: "deny"; notice: Extract<LoginNotice, "deactivated" | "not_invited"> };

export function decideFromMe(me: MeResponse, next?: string | null): MeDecision {
  switch (me.status) {
    case "active":
      return { kind: "go", href: safeNext(next) ?? DASHBOARD_HOME };
    case "invited":
      return { kind: "go", href: AUTH_ROUTES.acceptInvite };
    case "deactivated":
      return { kind: "deny", notice: "deactivated" };
    default:
      return { kind: "deny", notice: "not_invited" };
  }
}
