"use client";

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Info, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SignInStatus } from "@/hooks/use-admin-sign-in";
import { AUTH_ROUTES } from "@/lib/auth-routing";
import { cn } from "@/lib/utils";
import type { AdminSignInRequest } from "@/types/auth.types";

import { FormField, authInputClassName, fieldErrorId } from "./form-field";
import { GoogleIcon } from "./google-icon";
import styles from "./login-effects.module.css";
import { PasswordInput } from "./password-input";

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
  /** Leaves for Google sign-in (only admins who linked Google on the accept page can use it). */
  onGoogleSignIn: (rememberMe: boolean) => void;
  /** Called when the user edits a field (clears a stale sign-in error). */
  onEdit: () => void;
  /** Called when the email / password go from empty to typed or back (drives the screen's layout). */
  onHasTextChange?: (hasText: boolean) => void;
  className?: string;
}

export function LoginForm({ status, error, onSignIn, onGoogleSignIn, onEdit, onHasTextChange, className }: LoginFormProps) {
  const [values, setValues] = useState<AdminSignInRequest>({
    email: "",
    password: "",
    rememberMe: false,
  });
  const [submitted, setSubmitted] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const verifying = status === "verifying";
  const redirecting = status === "redirecting";
  // Stays locked after success while the transition plays (and while leaving for Google).
  const locked = verifying || redirecting || status === "authenticated";

  // Errors appear after the first submit attempt, then update as the user types.
  const errors = submitted ? validate(values) : {};

  function update<K extends keyof AdminSignInRequest>(key: K, value: AdminSignInRequest[K]) {
    const next = { ...values, [key]: value };
    setValues(next);
    onEdit();
    const hadText = values.email !== "" || values.password !== "";
    const hasText = next.email !== "" || next.password !== "";
    if (hasText !== hadText) onHasTextChange?.(hasText);
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

  // After a failed password attempt the fields are enabled again: put the cursor back in the password.
  // (Not for messages shown on arrival, e.g. "Your session has expired".)
  useEffect(() => {
    if (error && submitted) passwordRef.current?.focus();
  }, [error, submitted]);

  // Never keep the password around once the screen is left.
  useLayoutEffect(() => {
    return () => {
      setValues((current) => ({ ...current, password: "" }));
      setSubmitted(false);
    };
  }, []);

  return (
    <form noValidate onSubmit={handleSubmit} aria-busy={verifying || redirecting} className={cn(className)}>
      {error ? (
        <div
          role="alert"
          className="mb-5 flex gap-2.5 rounded-md border border-brand-blue/20 bg-brand-blue/5 px-3 py-2.5 text-xs leading-5 text-brand-navy transition-colors login-alt:border-brand-white/15 login-alt:bg-brand-white/6 login-alt:text-brand-white"
        >
          <Info className="mt-0.5 size-4 shrink-0 text-brand-blue transition-colors login-alt:text-brand-gold" aria-hidden />
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
              className="border-input focus-visible:border-brand-blue focus-visible:ring-brand-blue/20 login-alt:border-brand-white/75 login-alt:data-checked:border-brand-gold login-alt:data-checked:bg-brand-gold login-alt:data-checked:text-brand-navy"
            />
            Remember me
          </Label>

          <Link
            href={AUTH_ROUTES.forgotPassword}
            prefetch={false}
            className="rounded-sm text-[0.8125rem] font-semibold text-brand-blue transition-colors outline-none hover:underline hover:underline-offset-4 focus-visible:ring-3 focus-visible:ring-brand-blue/30 login-alt:text-brand-gold"
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
            // Alternate composition: Primary Blue button on the navy page.
            "login-alt:bg-brand-blue login-alt:hover:bg-[color-mix(in_oklab,var(--color-brand-blue)_86%,var(--color-brand-white))]",
            // Waiting: stay fully opaque (not the faded disabled look); the glow comes from `.submit[data-pending]`.
            locked && "disabled:opacity-100",
          )}
        >
          {locked && !redirecting ? (
            <>
              <LoaderCircle className="animate-spin" aria-hidden />
              Verifying credentials…
            </>
          ) : (
            "Sign in"
          )}
        </Button>

        <div aria-hidden className="-my-1 flex items-center gap-3 text-[0.6875rem] font-medium tracking-wide text-brand-muted uppercase">
          <span className="h-px flex-1 bg-brand-navy/10 transition-colors login-alt:bg-brand-white/15" />
          or
          <span className="h-px flex-1 bg-brand-navy/10 transition-colors login-alt:bg-brand-white/15" />
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => onGoogleSignIn(values.rememberMe)}
          disabled={locked}
          className={cn(
            "h-9 w-full gap-2.5 rounded-md border-brand-navy/15 bg-brand-white text-[0.8125rem] font-semibold text-brand-navy",
            "duration-200 ease-out hover:border-brand-navy/25 hover:bg-[#f5f7fb] hover:text-brand-navy",
            "focus-visible:border-brand-blue focus-visible:ring-brand-blue/30",
            "login-alt:border-brand-white/15 login-alt:bg-brand-white/6 login-alt:text-brand-white",
            "login-alt:hover:border-brand-white/30 login-alt:hover:bg-brand-white/10 login-alt:hover:text-brand-white",
            redirecting && "disabled:opacity-100",
          )}
        >
          {redirecting ? <LoaderCircle className="animate-spin" aria-hidden /> : <GoogleIcon className="size-4" />}
          {redirecting ? "Opening Google…" : "Continue with Google"}
        </Button>
      </div>
    </form>
  );
}
