"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { AUTH_ROUTES, decideFromMe, loginHref } from "@/lib/auth-routing";
import { DEV_ME, DEV_SKIP_AUTH } from "@/lib/dev-auth";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { isApiError, setAuthFailureHandler } from "@/services/api/client";
import {
  getAuthErrorMessage,
  getMe,
  getSession,
  peekCachedMe,
  signOut as endSession,
  toAdminProfile,
} from "@/services/auth/admin-auth.service";
import type { AdminProfile, MeResponse } from "@/types/auth.types";

interface AdminSession {
  admin: AdminProfile;
  me: MeResponse;
  /** Signs out on this device and returns to the sign-in screen. */
  signOut: () => Promise<void>;
  /** Asks `/me` again (e.g. after changing the name or avatar). */
  refresh: () => Promise<void>;
}

const AdminSessionContext = createContext<AdminSession | null>(null);

/** The signed-in admin. Only inside the dashboard (`AdminSessionGate`). */
export function useAdminSession(): AdminSession {
  const session = useContext(AdminSessionContext);
  if (!session) throw new Error("useAdminSession must be used inside <AdminSessionGate>.");
  return session;
}

/** Current page, to come back to after signing in again. */
function currentPath(): string {
  return `${window.location.pathname}${window.location.search}`;
}

function activeOrNull(me: MeResponse | null): MeResponse | null {
  return me?.status === "active" && me.admin ? me : null;
}

/**
 * Protects the dashboard: no session → sign-in screen; a session that isn't an
 * active admin → wherever `/me` says (account setup, or signed out with the
 * reason). Only then is the shell rendered, with the real admin.
 *
 * Hiding pages is only for the user experience: the backend checks the token
 * on every request anyway. Also registers the app-wide reaction to 401 / 403
 * API responses.
 *
 * Right after signing in, the `/me` answer from the sign-in screen is reused,
 * so the dashboard opens at once (and is re-checked in the background).
 */
export function AdminSessionGate({
  children,
  fallback,
  bare = false,
}: {
  children: ReactNode;
  fallback: ReactNode;
  /** Full-screen pages (the QR viewer): signed-in admins only, but without the sidebar and header. */
  bare?: boolean;
}) {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(() => (DEV_SKIP_AUTH ? DEV_ME : activeOrNull(peekCachedMe())));
  /** Why the session couldn't be checked; only shown while the dashboard isn't open yet. */
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const leave = useCallback(
    async (href: string, endSessionFirst: boolean) => {
      if (endSessionFirst) await endSession();
      router.replace(href);
    },
    [router],
  );

  /** Applies a `/me` answer: stay (active) or go where it says. */
  const apply = useCallback(
    async (answer: MeResponse) => {
      const decision = decideFromMe(answer);
      if (decision.kind === "deny") return leave(loginHref(decision.notice), true);
      if (answer.status !== "active") return leave(decision.href, false);
      setMe(answer);
    },
    [leave],
  );

  const check = useCallback(async () => {
    if (DEV_SKIP_AUTH) return; // local shortcut: stay on the dashboard as DEV_ME
    if (!(await getSession())) return leave(loginHref(undefined, currentPath()), false);
    try {
      await apply(await getMe());
      setError(null);
    } catch (cause) {
      if (isApiError(cause) && cause.status === 401) return leave(loginHref("expired", currentPath()), true);
      // Ignored while the dashboard is open (e.g. a background re-check failed).
      setError(getAuthErrorMessage(cause));
    }
  }, [apply, leave]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async: state is only set after the session check resolves
    void check();
  }, [check, attempt]);

  // 401 anywhere → session expired; 403 → re-check `/me` (deactivated meanwhile, …).
  useEffect(() => {
    if (DEV_SKIP_AUTH) return;
    return setAuthFailureHandler((status) => {
      if (status === 401) void leave(loginHref("expired", currentPath()), true);
      else void getMe().then(apply, () => {});
    });
  }, [apply, leave]);

  // Signed out elsewhere (another tab, or the refresh token was revoked).
  useEffect(() => {
    if (DEV_SKIP_AUTH || !isSupabaseConfigured()) return;
    const { data } = getSupabase().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.replace(AUTH_ROUTES.login);
    });
    return () => data.subscription.unsubscribe();
  }, [router]);

  const session = useMemo<AdminSession | null>(() => {
    if (!me?.admin) return null;
    return {
      me,
      admin: toAdminProfile(me.admin, me.email),
      signOut: () => leave(AUTH_ROUTES.login, true),
      refresh: async () => {
        if (DEV_SKIP_AUTH) return;
        await apply(await getMe());
      },
    };
  }, [me, apply, leave]);

  if (!session) {
    if (!error) return fallback;
    return (
      <div role="alert" data-themed className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <p className="max-w-md text-sm text-foreground/80">{error}</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setAttempt((n) => n + 1);
            }}
            className="h-9 rounded-md bg-brand-navy px-4 text-[0.8125rem] font-semibold text-brand-white outline-none hover:bg-[color-mix(in_oklab,var(--color-brand-navy)_84%,var(--color-brand-blue))] focus-visible:ring-3 focus-visible:ring-brand-blue/40"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => void leave(AUTH_ROUTES.login, true)}
            className="h-9 rounded-md border border-border px-4 text-[0.8125rem] font-semibold text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-brand-blue/40"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <AdminSessionContext value={session}>
      {bare ? children : <DashboardShell admin={session.admin}>{children}</DashboardShell>}
    </AdminSessionContext>
  );
}
