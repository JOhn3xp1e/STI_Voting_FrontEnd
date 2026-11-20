"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { DASHBOARD_HOME } from "@/config/navigation";
import { useAdminSignIn } from "@/hooks/use-admin-sign-in";
import { useLoginTransition } from "@/hooks/use-login-transition";
import { AUTH_ROUTES, decideFromMe, LOGIN_NOTICES, readLoginNotice, safeNext } from "@/lib/auth-routing";
import { DEV_SKIP_AUTH } from "@/lib/dev-auth";
import { cn } from "@/lib/utils";
import { getMe, getSession } from "@/services/auth/admin-auth.service";

import styles from "./login-effects.module.css";
import { LoginForm } from "./login-form";
import { useLoginLayout } from "./login-stage";
import { SuccessCheck } from "./success-check";

/**
 * White sign-in card with the corner pixel decoration.
 *
 * Connects the sign-in request (`useAdminSignIn`) to the success animation and
 * dashboard transition (`useLoginTransition`). `data-auth-phase` exposes the
 * transition phase to CSS (see `.card` / `.stage` in login-effects.module.css).
 *
 * Also picks the screen's composition: empty form → dark page (form without a
 * card); something typed → white card. After signing in the layout stays put
 * and only the card itself turns dark (`data-card-dark`), so the success
 * checkmark plays in its dark version on a dark card.
 */
export function LoginCard({ className }: { className?: string }) {
  const router = useRouter();
  /** Page to open after signing in (`?next=`), read once on mount. */
  const [next, setNext] = useState<string | null>(null);
  /** Why the screen was opened (`?error=` / `?expired=1`), shown until the user acts. */
  const [notice, setNotice] = useState<string | null>(null);
  const { status, error, destination, signIn, signInGoogle, clearError } = useAdminSignIn(next);
  const { requestVariant } = useLoginLayout();
  const [hasText, setHasText] = useState(false);

  const authenticated = status === "authenticated";
  const target = destination ?? DASHBOARD_HOME;
  const settingUp = target.startsWith(AUTH_ROUTES.acceptInvite);

  useEffect(() => {
    requestVariant(hasText ? 1 : 2);
  }, [hasText, requestVariant]);

  // Query string: `?next=` (where to go after signing in) and `?error=` / `?expired=1` (why we're here).
  // Read in an effect rather than with useSearchParams, so the page keeps its static shell.
  useEffect(() => {
    const url = new URL(window.location.href);
    const requested = safeNext(url.searchParams.get("next"));

    // Local DEV_SKIP_AUTH shortcut: there's no sign-in to do, so go straight to the dashboard.
    if (DEV_SKIP_AUTH) {
      router.replace(requested ?? DASHBOARD_HOME);
      return;
    }

    const notice = readLoginNotice(url.searchParams);
    /* eslint-disable react-hooks/set-state-in-effect */
    setNext(requested);
    // Only ever set here (never cleared), so Strict Mode's re-run after the URL is cleaned keeps it.
    if (notice) setNotice(LOGIN_NOTICES[notice]);
    /* eslint-enable react-hooks/set-state-in-effect */

    // Drop the notice from the address bar, so a refresh doesn't show it again.
    if (notice) {
      url.searchParams.delete("error");
      url.searchParams.delete("expired");
      window.history.replaceState(window.history.state, "", url);
      return;
    }

    // Already signed in as an active admin (e.g. opened /login in a new tab): go straight in.
    let cancelled = false;
    void (async () => {
      if (!(await getSession())) return;
      try {
        const decision = decideFromMe(await getMe(), requested);
        if (!cancelled && decision.kind === "go") router.replace(decision.href);
      } catch {
        // Couldn't check: stay on the sign-in screen.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const phase = useLoginTransition(authenticated, target);

  const announcement =
    status === "verifying"
      ? "Verifying credentials…"
      : status === "redirecting"
        ? "Opening Google sign-in…"
        : status === "authenticated"
          ? settingUp
            ? "Signed in. Opening account setup."
            : "Authentication successful. Opening the admin dashboard."
          : "";

  return (
    <div
      data-login-card
      data-auth-phase={phase}
      data-card-dark={authenticated || undefined}
      className={cn("group/card relative w-full", styles.card, className)}
    >
      {/* Blue ambient glow, faded in on hover, while the form has focus, or after signing in (opacity only, no movement). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-3xl opacity-0 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-brand-blue)_30%,transparent),0_28px_90px_-24px_color-mix(in_oklab,var(--color-brand-blue)_80%,transparent)] transition-opacity duration-500 ease-out group-focus-within/card:opacity-100 group-hover/card:opacity-100 group-data-[auth-phase=success]/card:opacity-100 login-alt:opacity-0!"
      />

      <section
        aria-labelledby="admin-sign-in-title"
        className="relative w-full overflow-hidden rounded-3xl px-6 pt-24 pb-10 text-brand-navy transition-colors duration-500 sm:px-12 sm:py-20 lg:pt-31 lg:pb-28 login-alt:text-brand-white group-data-[card-dark]/card:text-brand-white lg:login-alt:pt-36 lg:login-alt:pr-10.5 lg:login-alt:pb-23 lg:login-alt:pl-13.5"
      >
        {/*
         * The card's white surface. In the alternate composition it melts away
         * (fades and shrinks slightly), leaving the form directly on the page.
         * After signing in it turns navy (the card goes dark; the layout stays).
         */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-3xl bg-brand-white shadow-2xl shadow-black/40 ring-white/10 transition-[opacity,scale,box-shadow,background-color] duration-500 ease-out group-hover/card:shadow-black/50 login-alt:scale-[0.96] login-alt:opacity-0 group-data-[card-dark]/card:bg-login-background group-data-[card-dark]/card:shadow-black/60 group-data-[card-dark]/card:ring-1"
        />

        <Image
          src="/images/image2.png"
          alt=""
          aria-hidden
          width={289}
          height={212}
          className="pointer-events-none absolute top-0 right-0 z-20 w-32 select-none sm:w-40"
        />

        {/* Fades out under the success panel. */}
        <div data-morph="form" className="relative transition-opacity duration-300 group-data-[auth-phase=leaving]/card:opacity-0 group-data-[auth-phase=success]/card:opacity-0">
          <h1 id="admin-sign-in-title" className="text-[1.75rem] font-semibold tracking-tight sm:text-3xl">
            Admin Sign In
          </h1>
          <p className="mt-5 text-sm leading-tight text-brand-muted sm:text-[0.9375rem]">
            Use your STI admin account to manage terms and elections.
          </p>

          <LoginForm
            status={status}
            error={error ?? notice}
            onSignIn={(request) => {
              setNotice(null);
              return signIn(request);
            }}
            onGoogleSignIn={(rememberMe) => {
              setNotice(null);
              signInGoogle(rememberMe);
            }}
            onEdit={() => {
              clearError();
              setNotice(null);
            }}
            onHasTextChange={setHasText}
            className="mt-4"
          />

          <p className="mt-5 text-center text-xs leading-4 text-brand-muted">
            Admins are added by a Super Admin. For access issues, contact the MIS office.
          </p>
        </div>

        {phase !== "idle" ? (
          <div
            aria-hidden
            className={cn(
              "absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center",
              styles.successPanel,
            )}
          >
            <SuccessCheck className="size-18" />
            <p
              className={cn(
                "mt-7 text-lg font-semibold tracking-tight text-brand-navy sm:text-xl login-alt:text-brand-white group-data-[card-dark]/card:text-brand-white",
                styles.successText,
              )}
            >
              {settingUp ? "Signed in" : "Authentication successful"}
            </p>
            <p className={cn("mt-1.5 font-mono text-xs text-brand-muted", styles.successText)}>
              {settingUp ? "Opening account setup…" : "Opening the admin dashboard…"}
            </p>
          </div>
        ) : null}
      </section>

      {/* Screen-reader announcements for the sign-in progress. */}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
