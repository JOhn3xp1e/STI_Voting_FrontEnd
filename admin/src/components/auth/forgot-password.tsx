"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { isAuthError } from "@supabase/supabase-js";
import { ArrowLeft, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AUTH_ROUTES } from "@/lib/auth-routing";
import { getAuthErrorMessage, isTemporaryAuthError, sendPasswordResetEmail } from "@/services/auth/admin-auth.service";

import {
  AuthAlert,
  AuthButtonLink,
  AuthLink,
  AuthScreen,
  AuthTextButton,
  authPrimaryButtonClassName,
} from "./auth-screen";
import { FormField, authInputClassName, fieldErrorId } from "./form-field";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Supabase allows one reset email per address about every minute. */
const RESEND_AFTER_S = 60;

/**
 * "Forgot password?": emails a reset link that leads to `/reset-password`.
 *
 * The confirmation reads the same whether or not the email has an account,
 * so the page can't be used to find out which emails are admins.
 */
export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Address the link was sent to; `null` while on the first card. */
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const emailRef = useRef<HTMLInputElement>(null);

  // Countdown until another link can be requested.
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  /** Sends the link; resolves `true` when the confirmation should show. */
  async function send(address: string): Promise<boolean> {
    setError(null);
    setBusy(true);
    try {
      await sendPasswordResetEmail(address);
      return true;
    } catch (cause) {
      // Tell about temporary or setup problems; any other answer from Supabase gets the same neutral reply.
      if (isTemporaryAuthError(cause) || !isAuthError(cause)) {
        setError(getAuthErrorMessage(cause));
        return false;
      }
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const value = email.trim();
    if (!EMAIL_PATTERN.test(value)) {
      setFieldError(value ? "Enter a valid email address." : "Enter your email address.");
      emailRef.current?.focus();
      return;
    }
    setFieldError(null);
    if (await send(value)) {
      setSentTo(value);
      setResendIn(RESEND_AFTER_S);
    }
  }

  async function onResend() {
    if (!sentTo || busy || resendIn > 0) return;
    if (await send(sentTo)) setResendIn(RESEND_AFTER_S);
  }

  if (sentTo) {
    const minutes = Math.floor(resendIn / 60);
    const seconds = String(resendIn % 60).padStart(2, "0");
    return (
      <AuthScreen
        title="Check your email"
        description={
          <>
            If <span className="font-medium text-brand-navy">{sentTo}</span> belongs to an admin, we sent it a link to
            reset your password.
          </>
        }
        footer="For your security, the link works only once."
      >
        {error ? <AuthAlert>{error}</AuthAlert> : null}
        <div className="flex items-center justify-between gap-4 text-[0.8125rem]">
          {resendIn > 0 ? (
            <span className="text-brand-muted" aria-live="off">
              Resend link in {minutes}:{seconds}
            </span>
          ) : (
            <AuthTextButton onClick={onResend} disabled={busy}>
              {busy ? "Sending…" : "Resend link"}
            </AuthTextButton>
          )}
          <AuthTextButton
            onClick={() => {
              setSentTo(null);
              setError(null);
            }}
          >
            Use a different email
          </AuthTextButton>
        </div>
        <AuthButtonLink href={AUTH_ROUTES.login}>Back to sign in</AuthButtonLink>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title="Reset password"
      description="Enter your admin email and we'll send you a link to reset your password."
      footer="Didn't get one? Check spam, or contact the MIS office."
    >
      <form noValidate onSubmit={onSubmit} aria-busy={busy} className="flex flex-col gap-5">
        {error ? <AuthAlert>{error}</AuthAlert> : null}
        <FormField id="email" label="Email" error={fieldError ?? undefined}>
          <Input
            ref={emailRef}
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="admin@legazpi.sti.edu.ph"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={busy}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? fieldErrorId("email") : undefined}
            className={authInputClassName}
          />
        </FormField>
        <div className="flex justify-end text-[0.8125rem]">
          <AuthLink href={AUTH_ROUTES.login} className="inline-flex items-center gap-1">
            <ArrowLeft className="size-3.5" aria-hidden />
            Back to sign in
          </AuthLink>
        </div>
        <Button type="submit" disabled={busy} className={authPrimaryButtonClassName}>
          {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
          {busy ? "Sending…" : "Send reset link"}
        </Button>
      </form>
    </AuthScreen>
  );
}
