"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { decideFromMe, LOGIN_NOTICES } from "@/lib/auth-routing";
import {
  getAuthErrorMessage,
  getMe,
  signInWithGoogle,
  signInWithPassword,
  signOut,
} from "@/services/auth/admin-auth.service";
import type { AdminSignInRequest } from "@/types/auth.types";

/**
 * - `idle`: waiting for the user.
 * - `verifying`: password sign-in sent, waiting for Supabase and `/me`.
 * - `redirecting`: leaving for Google.
 * - `authenticated`: an admin; `destination` holds where to go next.
 * - `error`: the sign-in failed; `error` holds the message.
 */
export type SignInStatus = "idle" | "verifying" | "redirecting" | "authenticated" | "error";

/**
 * Sign-in request state, without any animation concerns.
 *
 * Password: Supabase checks the credentials, then `GET /api/auth/me` says
 * whether this login is an admin (active → `next` or the dashboard; invited →
 * the accept page; deactivated / not invited → signed out again with a message).
 *
 * Only one attempt runs at a time; further submits are ignored until it fails.
 */
export function useAdminSignIn(next: string | null) {
  const [status, setStatus] = useState<SignInStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [destination, setDestination] = useState<string | null>(null);

  /** Synchronous guard: state updates are async, so rapid clicks could slip past a status check. */
  const busyRef = useRef(false);
  /** Bumped when the screen is left, so a late answer from an old attempt is ignored. */
  const attemptRef = useRef(0);

  const fail = useCallback((message: string) => {
    busyRef.current = false;
    setError(message);
    setStatus("error");
  }, []);

  /** Resolves `true` when signed in, `false` when the attempt failed or was ignored. */
  const signIn = useCallback(
    async (request: AdminSignInRequest): Promise<boolean> => {
      if (busyRef.current) return false;
      busyRef.current = true;
      const attempt = ++attemptRef.current;
      setError(null);
      setStatus("verifying");

      try {
        await signInWithPassword(request);
      } catch (cause) {
        if (attempt === attemptRef.current) fail(getAuthErrorMessage(cause, "sign-in"));
        return false;
      }

      try {
        const decision = decideFromMe(await getMe(), next);
        if (attempt !== attemptRef.current) return false;
        if (decision.kind === "deny") {
          await signOut();
          fail(LOGIN_NOTICES[decision.notice]);
          return false;
        }
        setDestination(decision.href);
        setStatus("authenticated");
        return true;
      } catch (cause) {
        // Signed in to Supabase but the admin server couldn't confirm access: start over cleanly.
        await signOut();
        if (attempt === attemptRef.current) fail(getAuthErrorMessage(cause));
        return false;
      }
    },
    [fail, next],
  );

  const signInGoogle = useCallback(
    async (rememberMe: boolean) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setError(null);
      setStatus("redirecting");
      try {
        await signInWithGoogle({ rememberMe, next });
        // The browser is now leaving for Google; stay in `redirecting`.
      } catch (cause) {
        fail(getAuthErrorMessage(cause));
      }
    },
    [fail, next],
  );

  const clearError = useCallback(() => setError(null), []);

  // When the screen is left (unmounted, or hidden by Next.js' route
  // preservation), drop any pending attempt and start fresh next time.
  useLayoutEffect(() => {
    return () => {
      attemptRef.current += 1;
      busyRef.current = false;
      setStatus("idle");
      setError(null);
      setDestination(null);
    };
  }, []);

  return { status, error, destination, signIn, signInGoogle, clearError };
}
