"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { decideFromMe, loginHref } from "@/lib/auth-routing";
import { beginDashboardEntrance } from "@/lib/dashboard-entrance";
import { cn } from "@/lib/utils";
import {
  getAuthErrorMessage,
  getMe,
  getSession,
  signOut,
  signOutOtherDevices,
  updatePassword,
} from "@/services/auth/admin-auth.service";

import { ApprovedOwl, AuthAlert, AuthChecking, AuthScreen, authPrimaryButtonClassName } from "./auth-screen";
import { LinkExpired } from "./link-expired";
import { NewPasswordFields, validateNewPassword } from "./new-password-fields";

type Phase = "checking" | "no-session" | "ready" | "done";

/**
 * "Set a new password". Needs the session created by the reset link
 * (`/auth/confirm`). Afterwards the admin is signed out everywhere else and
 * stays signed in here, so "Continue to dashboard" routes by `/me`.
 */
export function ResetPassword() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void getSession().then((session) => {
      if (!cancelled) setPhase(session ? "ready" : "no-session");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const errors = submitted ? validateNewPassword(password, confirm) : {};

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setSubmitted(true);
    const validation = validateNewPassword(password, confirm);
    if (validation.password || validation.confirm) {
      passwordRef.current?.focus();
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await updatePassword(password);
    } catch (cause) {
      setBusy(false);
      setError(getAuthErrorMessage(cause, "password"));
      return;
    }
    await signOutOtherDevices();
    setBusy(false);
    setPassword("");
    setConfirm("");
    setPhase("done");
  }

  async function onContinue() {
    if (busy) return;
    setBusy(true);
    try {
      const decision = decideFromMe(await getMe());
      if (decision.kind === "go") {
        beginDashboardEntrance();
        router.replace(decision.href);
      } else {
        await signOut();
        router.replace(loginHref(decision.notice));
      }
    } catch {
      // The password is saved; signing in again works even if the admin server is asleep.
      router.replace(loginHref());
    }
  }

  if (phase === "checking") {
    return (
      <AuthScreen title="Set a new password">
        <AuthChecking label="Checking your reset link…" />
      </AuthScreen>
    );
  }

  if (phase === "no-session") return <LinkExpired kind="reset" />;

  if (phase === "done") {
    return (
      <AuthScreen
        illustration={<ApprovedOwl />}
        title="Password updated"
        description="Your password was changed. Use it the next time you sign in."
        footer="Didn't do this? Contact the MIS office right away."
      >
        <Button
          type="button"
          onClick={onContinue}
          disabled={busy}
          className={cn(authPrimaryButtonClassName, busy && "disabled:opacity-100")}
        >
          {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
          Continue to dashboard
        </Button>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title="Set a new password"
      description="Choose a password you haven't used for SLVP before."
      footer="You'll be signed out of SLVP on every other device."
    >
      <form noValidate onSubmit={onSubmit} aria-busy={busy} className="flex flex-col gap-5">
        {error ? <AuthAlert>{error}</AuthAlert> : null}
        <NewPasswordFields
          password={password}
          confirm={confirm}
          onPasswordChange={setPassword}
          onConfirmChange={setConfirm}
          errors={errors}
          disabled={busy}
          passwordRef={passwordRef}
        />
        <Button type="submit" disabled={busy} className={cn(authPrimaryButtonClassName, busy && "disabled:opacity-100")}>
          {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
          {busy ? "Updating…" : "Update password & sign in"}
        </Button>
      </form>
    </AuthScreen>
  );
}
