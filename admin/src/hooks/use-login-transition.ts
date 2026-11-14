"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AUTH_ROUTES } from "@/lib/auth-routing";
import { beginDashboardEntrance } from "@/lib/dashboard-entrance";

/**
 * - `idle`: the normal sign-in screen.
 * - `success`: the success checkmark is showing on the card.
 * - `leaving`: the sign-in screen is fading out before navigation.
 */
export type LoginTransitionPhase = "idle" | "success" | "leaving";

/** How long the success state stays on screen before the screen fades out. */
const SUCCESS_HOLD_MS = 1000;
/** Fade-out of the sign-in screen (keep in sync with `.stage` in login-effects.module.css). */
const LEAVE_MS = 450;

const REDUCED_SUCCESS_HOLD_MS = 900;
const REDUCED_LEAVE_MS = 250;

/**
 * Animation timeline that runs once sign-in has succeeded:
 * success checkmark → fade out the sign-in screen → navigate to `destination`,
 * where the dashboard plays its entrance (not for account setup). Contains no authentication logic.
 */
export function useLoginTransition(authenticated: boolean, destination: string): LoginTransitionPhase {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!authenticated) return;

    router.prefetch(destination);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hold = reduceMotion ? REDUCED_SUCCESS_HOLD_MS : SUCCESS_HOLD_MS;
    const leave = reduceMotion ? REDUCED_LEAVE_MS : LEAVE_MS;

    const leaveTimer = setTimeout(() => setLeaving(true), hold);
    const navigateTimer = setTimeout(() => {
      // The entrance belongs to the dashboard shell; account setup has none.
      if (!destination.startsWith(AUTH_ROUTES.acceptInvite)) beginDashboardEntrance();
      router.push(destination);
    }, hold + leave);

    return () => {
      clearTimeout(leaveTimer);
      clearTimeout(navigateTimer);
    };
  }, [authenticated, destination, router]);

  // Reset once the screen is hidden, so returning to it shows the form again.
  useLayoutEffect(() => {
    return () => setLeaving(false);
  }, []);

  if (!authenticated) return "idle";
  return leaving ? "leaving" : "success";
}
