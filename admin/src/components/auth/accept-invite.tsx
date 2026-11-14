"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { CircleCheck, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DASHBOARD_HOME } from "@/config/navigation";
import { decideFromMe, loginHref } from "@/lib/auth-routing";
import { beginDashboardEntrance } from "@/lib/dashboard-entrance";
import { cn } from "@/lib/utils";
import { isApiError } from "@/services/api/client";
import {
  acceptInvite,
  getAuthErrorMessage,
  getMe,
  getSession,
  hasGoogleIdentity,
  linkGoogle,
  signOut,
  updatePassword,
} from "@/services/auth/admin-auth.service";

import {
  ApprovedOwl,
  AuthAlert,
  AuthChecking,
  AuthScreen,
  AuthTextButton,
  authPrimaryButtonClassName,
  authSecondaryButtonClassName,
} from "./auth-screen";
import { FormField, authInputClassName, fieldErrorId } from "./form-field";
import { NewPasswordFields, validateNewPassword, type NewPasswordErrors } from "./new-password-fields";

const ROUTE = "/accept-invite";
/** Keeps the typed name across the round trip to Google when linking it. */
const NAME_DRAFT_KEY = "slvp-accept-invite-name";

function readDraft(): string | null {
  try {
    return window.sessionStorage.getItem(NAME_DRAFT_KEY);
  } catch {
    return null;
  }
}

function writeDraft(value: string | null) {
  try {
    if (value === null) window.sessionStorage.removeItem(NAME_DRAFT_KEY);
    else window.sessionStorage.setItem(NAME_DRAFT_KEY, value);
  } catch {
    // Storage unavailable: the name just won't survive the redirect.
  }
}

type Phase = { kind: "checking" } | { kind: "load-error"; message: string } | { kind: "ready" } | { kind: "done" };

interface FieldErrors extends NewPasswordErrors {
  fullName?: string;
}

/**
 * Account setup after accepting an invitation (needs the session from the
 * email link). The admin confirms their name and sets a password and/or links
 * Google, so they can always sign in again; then `POST /api/auth/accept-invite`
 * activates the account. Can be reopened any time until it's finished.
 */
export function AcceptInvite() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });
  const [reload, setReload] = useState(0);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [googleLinked, setGoogleLinked] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState<"finish" | "google" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  /** The password already saved to Supabase, so a retry after a failed finish doesn't set it twice. */
  const savedPasswordRef = useRef<string | null>(null);
  /** `?google=failed`, read once (kept across Strict Mode's effect re-run, after the URL is cleaned). */
  const googleFailedRef = useRef<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (googleFailedRef.current === null) {
        const url = new URL(window.location.href);
        googleFailedRef.current = url.searchParams.get("google") === "failed";
        if (googleFailedRef.current) {
          url.searchParams.delete("google");
          window.history.replaceState(window.history.state, "", url);
        }
      }
      const googleFailed = googleFailedRef.current;

      if (!(await getSession())) {
        router.replace(loginHref());
        return;
      }
      try {
        const me = await getMe();
        if (cancelled) return;
        if (me.status !== "invited") {
          const decision = decideFromMe(me);
          if (decision.kind === "go") router.replace(decision.href);
          else {
            await signOut();
            router.replace(loginHref(decision.notice));
          }
          return;
        }
        const linked = await hasGoogleIdentity().catch(() => false);
        if (cancelled) return;
        setEmail(me.email ?? me.admin?.email ?? "");
        setFullName(readDraft() ?? me.admin?.fullName ?? "");
        setGoogleLinked(linked);
        if (googleFailed) {
          setError("Google couldn't be linked. It may already belong to another login. You can set a password instead.");
        }
        setPhase({ kind: "ready" });
      } catch (cause) {
        if (!cancelled) setPhase({ kind: "load-error", message: getAuthErrorMessage(cause) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, reload]);

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!fullName.trim()) errors.fullName = "Enter your full name.";
    // A password is optional once Google is linked, but must be valid if typed.
    if (!googleLinked || password || confirm) Object.assign(errors, validateNewPassword(password, confirm));
    return errors;
  }

  const errors = submitted ? validate() : {};

  async function onLinkGoogle() {
    if (busy) return;
    setBusy("google");
    setError(null);
    writeDraft(fullName);
    try {
      await linkGoogle(ROUTE);
      // Leaving for Google; it comes back here.
    } catch (cause) {
      setBusy(null);
      setError(getAuthErrorMessage(cause));
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setSubmitted(true);
    const validation = validate();
    if (validation.fullName) return nameRef.current?.focus();
    if (validation.password || validation.confirm) return passwordRef.current?.focus();

    setBusy("finish");
    setError(null);

    if (password && savedPasswordRef.current !== password) {
      try {
        await updatePassword(password);
        savedPasswordRef.current = password;
      } catch (cause) {
        setBusy(null);
        setError(getAuthErrorMessage(cause, "password"));
        return;
      }
    }

    try {
      await acceptInvite(fullName.trim());
      writeDraft(null);
      setBusy(null);
      setPhase({ kind: "done" });
    } catch (cause) {
      if (isApiError(cause) && (cause.status === 401 || cause.status === 403)) {
        const deactivated = /deactivated/i.test(cause.message);
        await signOut();
        router.replace(loginHref(cause.status === 401 ? "expired" : deactivated ? "deactivated" : "not_invited"));
        return;
      }
      setBusy(null);
      setError(getAuthErrorMessage(cause));
    }
  }

  if (phase.kind === "checking") {
    return (
      <AuthScreen title="Join SLVP as an admin">
        <AuthChecking label="Checking your invitation…" />
      </AuthScreen>
    );
  }

  if (phase.kind === "load-error") {
    return (
      <AuthScreen title="Join SLVP as an admin" footer="Need help? Contact the MIS office.">
        <AuthAlert>{phase.message}</AuthAlert>
        <Button
          type="button"
          className={authPrimaryButtonClassName}
          onClick={() => {
            setPhase({ kind: "checking" });
            setReload((n) => n + 1);
          }}
        >
          Try again
        </Button>
      </AuthScreen>
    );
  }

  if (phase.kind === "done") {
    return (
      <AuthScreen
        illustration={<ApprovedOwl />}
        title="You’re in"
        description="Your admin account is ready. You can now manage terms, elections and voters in the SLVP admin portal."
      >
        <Button
          type="button"
          className={authPrimaryButtonClassName}
          onClick={() => {
            beginDashboardEntrance();
            router.replace(DASHBOARD_HOME);
          }}
        >
          Go to dashboard
        </Button>
      </AuthScreen>
    );
  }

  const locked = busy !== null;

  return (
    <AuthScreen title="Join SLVP as an admin" description="Create your account to accept the invite.">
      <form noValidate onSubmit={onSubmit} aria-busy={locked} className="flex flex-col gap-5">
        <div className="flex items-center gap-3 rounded-[0.625rem] border border-brand-gold/45 bg-brand-gold/12 px-3.5 py-3">
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-background text-xs font-semibold text-brand-white"
          >
            SA
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[0.8125rem] font-semibold text-brand-navy">You’ve been invited</span>
            <span className="text-xs text-brand-muted">Super administrator</span>
          </span>
        </div>

        {error ? <AuthAlert>{error}</AuthAlert> : null}

        <div className="flex flex-col gap-1.5">
          <span id="invite-email-label" className="text-xs font-semibold text-brand-navy">
            Email
          </span>
          <p aria-labelledby="invite-email-label" className="flex h-10 items-center truncate px-3 font-mono text-[0.8125rem] text-brand-navy">
            {email}
          </p>
        </div>

        <FormField id="full-name" label="Full name" error={errors.fullName}>
          <Input
            ref={nameRef}
            id="full-name"
            name="name"
            autoComplete="name"
            placeholder="Juan Dela Cruz"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            disabled={locked}
            aria-invalid={errors.fullName ? true : undefined}
            aria-describedby={errors.fullName ? fieldErrorId("full-name") : undefined}
            className={authInputClassName}
          />
        </FormField>

        <NewPasswordFields
          label={googleLinked ? "Password (optional)" : "Password"}
          password={password}
          confirm={confirm}
          onPasswordChange={setPassword}
          onConfirmChange={setConfirm}
          errors={errors}
          disabled={locked}
          passwordRef={passwordRef}
        />

        <div aria-hidden className="flex items-center gap-3 text-xs text-brand-muted">
          <span className="h-px flex-1 bg-[#e4e8f0]" />
          or sign up with
          <span className="h-px flex-1 bg-[#e4e8f0]" />
        </div>

        {googleLinked ? (
          <p
            role="status"
            className="flex h-10 items-center justify-center gap-2 rounded-md border border-emerald-600/25 bg-emerald-600/5 text-[0.8125rem] font-semibold text-brand-navy"
          >
            <CircleCheck className="size-4 text-emerald-600" aria-hidden />
            Google linked
          </p>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={onLinkGoogle}
            disabled={locked}
            className={cn(authSecondaryButtonClassName, busy === "google" && "disabled:opacity-100")}
          >
            {busy === "google" ? (
              <LoaderCircle className="animate-spin" aria-hidden />
            ) : (
              <Image src="/images/google-mark.svg" alt="" width={18} height={18} aria-hidden className="size-4.5" />
            )}
            {busy === "google" ? "Opening Google…" : "Sign up with Google"}
          </Button>
        )}

        <Button
          type="submit"
          disabled={locked}
          className={cn(authPrimaryButtonClassName, busy === "finish" && "disabled:opacity-100")}
        >
          {busy === "finish" ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
          {busy === "finish" ? "Creating your account…" : "Accept invite & create account"}
        </Button>

        <p className="text-[0.8125rem] text-brand-muted">
          Already have an SLVP account?{" "}
          {/* The invite link signed this browser in; sign out first, or the sign-in screen sends them straight back here. */}
          <AuthTextButton
            disabled={locked}
            onClick={() => {
              void signOut().then(() => router.replace(loginHref()));
            }}
          >
            Sign in
          </AuthTextButton>
        </p>
      </form>
    </AuthScreen>
  );
}
