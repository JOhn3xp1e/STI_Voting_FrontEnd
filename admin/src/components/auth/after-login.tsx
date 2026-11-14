"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { decideFromMe, loginHref, safeNext } from "@/lib/auth-routing";
import { getAuthErrorMessage, getMe, getSession, signOut } from "@/services/auth/admin-auth.service";

import { AuthAlert, AuthChecking, AuthLink, AuthScreen, authPrimaryButtonClassName } from "./auth-screen";

/**
 * Landing step after a Google sign-in: asks the backend where this login
 * belongs (`/me`) and goes there (dashboard, account setup, or back to sign in
 * with the reason).
 */
export function AfterLogin() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const route = useCallback(
    async (isCancelled: () => boolean) => {
      const next = safeNext(new URLSearchParams(window.location.search).get("next"));
      if (!(await getSession())) {
        router.replace(loginHref(undefined, next));
        return;
      }
      try {
        const decision = decideFromMe(await getMe(), next);
        if (isCancelled()) return;
        if (decision.kind === "go") {
          router.replace(decision.href);
        } else {
          await signOut();
          router.replace(loginHref(decision.notice));
        }
      } catch (cause) {
        if (!isCancelled()) setError(getAuthErrorMessage(cause));
      }
    },
    [router],
  );

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async: state is only set after the session check resolves
    void route(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [route, attempt]);

  return (
    <AuthScreen
      title="Signing you in"
      footer={
        <>
          Not you? <AuthLink href={loginHref()}>Back to sign in</AuthLink>
        </>
      }
    >
      {error ? (
        <div className="flex flex-col gap-4">
          <AuthAlert>{error}</AuthAlert>
          <Button
            type="button"
            className={authPrimaryButtonClassName}
            onClick={() => {
              setError(null);
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </Button>
        </div>
      ) : (
        <AuthChecking label="Checking your admin access…" />
      )}
    </AuthScreen>
  );
}
