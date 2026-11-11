"use client";

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Info, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { env } from "@/config/env";
import type { SignInStatus } from "@/hooks/use-admin-sign-in";
import { cn } from "@/lib/utils";
import type { AdminSignInRequest } from "@/types/auth.types";

import { FormField, authInputClassName, fieldErrorId } from "./form-field";
import styles from "./login-effects.module.css";
import { PasswordInput } from "./password-input";

/** Route of the password-recovery screen (not implemented yet). */
const FORGOT_PASSWORD_HREF = "/forgot-password";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldErrors = Partial<Record<"email" | "password", string>>;

function validate({ email, password }: AdminSignInRequest): FieldErrors {
  const errors: FieldErrors = {};
  const trimmedEmail = email.trim();

  if (!trimmedEmail) errors.email = "Enter your email address.";
  else if (!EMAIL_PATTERN.test(trimmedEmail)) errors.email = "Enter a valid email address.";

  if (!password) errors.password = "Enter your password.";

  return errors;
}

interface LoginFormProps {
  /** Sign-in request state (owned by `useAdminSignIn`). */
  status: SignInStatus;
  /** Message of the last failed sign-in. */
  error: string | null;
  onSignIn: (request: AdminSignInRequest) => Promise<boolean>;
  /** Called when the user edits a field (clears a stale sign-in error). */
  onEdit: () => void;
  className?: string;
}

export function LoginForm({ status, error, onSignIn, onEdit, className }: LoginFormProps) {
  const [values, setValues] = useState<AdminSignInRequest>({
    email: "",
    password: "",
    rememberMe: false,
  });
  const [submitted, setSubmitted] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const verifying = status === "verifying";
  // Stays locked after success while the transition plays.
  const locked = verifying || status === "authenticated";

  // Errors appear after the first submit attempt, then update as the user types.
  const errors = submitted ? validate(values) : {};

  function update<K extends keyof AdminSignInRequest>(key: K, value: AdminSignInRequest[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    onEdit();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked) return;

    setSubmitted(true);

    const validationErrors = validate(values);
    if (validationErrors.email || validationErrors.password) {
      (validationErrors.email ? emailRef : passwordRef).current?.focus();
      return;
    }

    await onSignIn({ ...values, email: values.email.trim() });
  }

  // After a failed attempt the fields are enabled again: put the cursor back in the password.
  useEffect(() => {
    if (error) passwordRef.current?.focus();
  }, [error]);

  // Never keep the password around once the screen is left.
  useLayoutEffect(() => {
    return () => {
      setValues((current) => ({ ...current, password: "" }));
      setSubmitted(false);
    };
  }, []);

  return (
    <form noValidate onSubmit={handleSubmit} aria-busy={verifying} className={cn(className)}>
      {error ? (
        <div
          role="alert"
          className="mb-5 flex gap-2.5 rounded-md border border-brand-blue/20 bg-brand-blue/5 px-3 py-2.5 text-xs leading-5 text-brand-navy"
        >
          <Info className="mt-0.5 size-4 shrink-0 text-brand-blue" aria-hidden />
          <p>{error}</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-5">
        <FormField id="email" label="Email" error={errors.email}>
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
            value={values.email}
            onChange={(event) => update("email", event.target.value)}
            disabled={locked}
            required
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? fieldErrorId("email") : undefined}
            className={authInputClassName}
          />
        </FormField>

        <FormField id="password" label="Password" error={errors.password}>
          <PasswordInput
            ref={passwordRef}
            id="password"
            name="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            value={values.password}
            onChange={(event) => update("password", event.target.value)}
            disabled={locked}
            required
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? fieldErrorId("password") : undefined}
            className={authInputClassName}
          />
        </FormField>

        <div className="flex items-center justify-between gap-4 leading-none">
          <Label className="cursor-pointer text-[0.8125rem] font-normal text-brand-muted">
            <Checkbox
              name="rememberMe"
              checked={values.rememberMe}
              onCheckedChange={(checked) => update("rememberMe", checked)}
              disabled={locked}
              className="border-input focus-visible:border-brand-blue focus-visible:ring-brand-blue/20"
            />
            Remember me
          </Label>

          <Link
            href={FORGOT_PASSWORD_HREF}
            prefetch={false}
            className="rounded-sm text-[0.8125rem] font-semibold text-brand-blue outline-none hover:underline hover:underline-offset-4 focus-visible:ring-3 focus-visible:ring-brand-blue/30"
          >
            Forgot password?
          </Link>
        </div>

        <Button
          type="submit"
          disabled={locked}
          data-pending={locked ? "" : undefined}
          className={cn(
            styles.submit,
            "h-9 w-full rounded-md bg-brand-navy text-[0.8125rem] font-semibold text-brand-white",
            "duration-200 ease-out focus-visible:border-brand-blue focus-visible:ring-brand-blue/40",
            // Hover: lift 1px, blend a little Primary Blue into the navy, cast a soft blue shadow.
            "hover:-translate-y-px hover:bg-[color-mix(in_oklab,var(--color-brand-navy)_84%,var(--color-brand-blue))]",
            "hover:shadow-[0_10px_24px_-12px_color-mix(in_oklab,var(--color-brand-blue)_90%,transparent)]",
            // Press: the base button settles 1px down; the shadow tightens quickly.
            "active:shadow-[0_4px_12px_-8px_color-mix(in_oklab,var(--color-brand-blue)_80%,transparent)] active:duration-75",
            "motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0",
            // Waiting: stay fully opaque (not the faded disabled look); the glow comes from `.submit[data-pending]`.
            locked && "disabled:opacity-100",
          )}
        >
          {locked ? (
            <>
              <LoaderCircle className="animate-spin" aria-hidden />
              Verifying credentials…
            </>
          ) : (
            "Sign in"
          )}
        </Button>

        {env.authDemoMode ? (
          <p className="-mt-2 text-center font-mono text-[0.6875rem] leading-4 text-brand-muted">
            Animation preview: sign-in is simulated, no account is checked.
          </p>
        ) : null}
      </div>
    </form>
  );
}
