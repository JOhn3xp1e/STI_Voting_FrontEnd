"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { authenticateAdmin, getSignInErrorMessage } from "@/services/auth/admin-auth.service";
import type { AdminSignInRequest } from "@/types/auth.types";

/**
 * - `idle`: waiting for the user.
 * - `verifying`: request sent, waiting for the response.
 * - `authenticated`: the backend (or the dev animation preview) accepted the sign-in.
 * - `error`: the sign-in failed; `error` holds the message.
 */
export type SignInStatus = "idle" | "verifying" | "authenticated" | "error";

/**
 * Sign-in request state, without any animation concerns.
 *
 * Only one request can be in flight: repeated submits are ignored until the
 * current one fails. After success, further submits are ignored as well.
 */
export function useAdminSignIn() {
  const [status, setStatus] = useState<SignInStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  /** Synchronous guard: state updates are async, so rapid clicks could slip past a status check. */
  const busyRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);

  /** Resolves `true` when signed in, `false` when the attempt failed or was ignored. */
  const signIn = useCallback(async (request: AdminSignInRequest): Promise<boolean> => {
    if (busyRef.current) return false;
    busyRef.current = true;

    const controller = new AbortController();
    controllerRef.current = controller;
    setError(null);
    setStatus("verifying");

    try {
      await authenticateAdmin(request, { signal: controller.signal });
      if (controller.signal.aborted) return false;
      setStatus("authenticated");
      return true;
    } catch (cause) {
      if (controller.signal.aborted) return false;
      busyRef.current = false;
      setError(getSignInErrorMessage(cause));
      setStatus("error");
      return false;
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  // When the screen is left (unmounted, or hidden by Next.js' route
  // preservation), cancel any pending request and start fresh next time.
  useLayoutEffect(() => {
    return () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
      busyRef.current = false;
      setStatus("idle");
      setError(null);
    };
  }, []);

  return { status, error, signIn, clearError };
}
