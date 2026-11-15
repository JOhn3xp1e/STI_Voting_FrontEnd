import { isApiError, apiClient } from "@/services/api/client";
import { getApiErrorMessage } from "@/services/api/error-message";
import type { AdminAccount } from "@/types/auth.types";

/*
 * Settings → Admins <-> ASP.NET Core Web API (`/api/admin/accounts`).
 * Super admins only. Only listing, inviting and resending invitations are wired up.
 */

const ROUTE = "admin/accounts";

/** Admin emails the backend accepts (shown as a hint under the field). */
export const ADMIN_EMAIL_DOMAINS = ["legazpi.sti.edu.ph", "gmail.com"] as const;

export type AdminAccountStatus = "active" | "pending" | "deactivated";

/** Badge state from the two flags (see docs/frontend/03-admin-accounts.md). */
export function getAdminStatus(admin: AdminAccount): AdminAccountStatus {
  if (!admin.isActive) return "deactivated";
  if (!admin.isVerified) return "pending";
  return "active";
}

interface RequestOptions {
  signal?: AbortSignal;
}

export async function fetchAdminAccounts({ signal }: RequestOptions = {}): Promise<AdminAccount[]> {
  return apiClient.get<AdminAccount[]>(ROUTE, { signal });
}

export interface InviteAdminInput {
  email: string;
  /** Optional: the admin can fill it in on the accept page. */
  fullName?: string;
}

/** Creates the admin (Invite pending) and emails the invitation. Resolves with the new admin. */
export async function inviteAdmin(input: InviteAdminInput): Promise<AdminAccount> {
  const body: InviteAdminInput = { email: input.email.trim() };
  const fullName = input.fullName?.trim();
  if (fullName) body.fullName = fullName;
  return apiClient.post<AdminAccount, InviteAdminInput>(ROUTE, body);
}

interface ResendInviteResponse {
  message: string;
  admin: AdminAccount;
}

/** Emails the invitation again; resolves with the backend's message ("Invitation sent." or a sign-in link note). */
export async function resendAdminInvite(id: string): Promise<ResendInviteResponse> {
  return apiClient.post<ResendInviteResponse>(`${ROUTE}/${encodeURIComponent(id)}/resend-invite`);
}

/** The backend already accepted this invitation (409 on resend): the list is out of date. */
export function isAlreadyAccepted(error: unknown): boolean {
  return isApiError(error) && error.status === 409;
}

/**
 * Message for a failed invite or resend. A 502 means the email couldn't be
 * sent (and, for a new invite, no admin was created, so retrying is safe).
 */
export function getInviteErrorMessage(error: unknown): string {
  if (isApiError(error) && error.status === 502) {
    const detail = error.problem?.detail ?? error.problem?.error;
    const text = typeof detail === "string" ? detail : "";
    if (/rate.?limit|seconds/i.test(text)) return "Wait a minute, then try again.";
    return text || "Couldn't send the invitation email. Nothing was saved, so you can try again.";
  }
  return getApiErrorMessage(error);
}
