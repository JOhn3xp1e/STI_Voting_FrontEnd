import { DASHBOARD_HOME, ELECTIONS_HOME, parseElectionRoute } from "@/config/navigation";
import type { MeResponse } from "@/types/auth.types";

/*
 * What each kind of admin may open in the portal.
 *
 * Super admins: everything. Election admins: the Elections list (only theirs), their elections'
 * own pages and QR viewer, and their account pages. This only shapes the interface: the backend
 * checks every request against the same rules.
 */

/** A login that is only an election admin (no admin account). */
export function isElectionAdminOnly(me: MeResponse): boolean {
  return !me.admin && me.role === "election_admin";
}

/** Elections this login may open as an election admin (accepted invitations only). */
export function electionIdsOf(me: MeResponse): string[] {
  return (me.electionAdmins ?? []).filter((e) => e.isVerified).map((e) => e.electionId);
}

/** An active login that has somewhere to go in the portal. */
export function canOpenPortal(me: MeResponse | null): me is MeResponse {
  if (me?.status !== "active") return false;
  return Boolean(me.admin) || (isElectionAdminOnly(me) && electionIdsOf(me).length > 0);
}

/** Where this admin lands after signing in. */
export function homeFor(me: MeResponse): string {
  return isElectionAdminOnly(me) ? ELECTIONS_HOME : DASHBOARD_HOME;
}

const QR_VIEWER = /^\/elections\/([^/]+)\/qr\/?$/;

/** Whether this admin may open `pathname` (a path without the query string). */
export function mayOpen(me: MeResponse, pathname: string): boolean {
  if (!isElectionAdminOnly(me)) return true;

  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === ELECTIONS_HOME || path === "/account" || path.startsWith("/account/")) return true;

  const allowed = new Set(electionIdsOf(me));
  const electionPage = parseElectionRoute(path);
  if (electionPage) return allowed.has(electionPage.electionId);

  const qr = QR_VIEWER.exec(path);
  return qr ? allowed.has(decodeURIComponent(qr[1])) : false;
}
