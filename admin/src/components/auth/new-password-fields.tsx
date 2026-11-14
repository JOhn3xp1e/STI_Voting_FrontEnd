"use client";

import type { Ref } from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

import { FormField, authInputClassName, fieldErrorId } from "./form-field";
import { PasswordInput } from "./password-input";

/** Password rule of the admin portal (checked in the UI; Supabase enforces its own minimum too). */
export const MIN_PASSWORD_LENGTH = 10;
const PASSWORD_RULE = `At least ${MIN_PASSWORD_LENGTH} characters, with a number`;

export function meetsPasswordRule(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH && /\d/.test(password);
}

export interface NewPasswordErrors {
  password?: string;
  confirm?: string;
}

export function validateNewPassword(password: string, confirm: string): NewPasswordErrors {
  const errors: NewPasswordErrors = {};
  if (!password) errors.password = "Enter a new password.";
  else if (!meetsPasswordRule(password)) errors.password = `Use ${PASSWORD_RULE.toLowerCase()}.`;
  else if (confirm !== password) errors.confirm = "The passwords don't match.";
  return errors;
}

interface NewPasswordFieldsProps {
  password: string;
  confirm: string;
  onPasswordChange: (value: string) => void;
  onConfirmChange: (value: string) => void;
  errors: NewPasswordErrors;
  disabled?: boolean;
  passwordRef?: Ref<HTMLInputElement>;
  /** Label of the first field, e.g. "Password" on account setup. */
  label?: string;
}

/** New password + confirmation and the password rule, with the shared auth field styling. */
export function NewPasswordFields({
  password,
  confirm,
  onPasswordChange,
  onConfirmChange,
  errors,
  disabled,
  passwordRef,
  label = "New password",
}: NewPasswordFieldsProps) {
  const met = meetsPasswordRule(password);
  return (
    <>
      <FormField id="new-password" label={label} error={errors.password}>
        <PasswordInput
          ref={passwordRef}
          id="new-password"
          name="new-password"
          autoComplete="new-password"
          placeholder="••••••••••••"
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
          disabled={disabled}
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={cn(errors.password && fieldErrorId("new-password"), "password-rule") || undefined}
          className={authInputClassName}
        />
      </FormField>
      <FormField id="confirm-password" label="Confirm password" error={errors.confirm}>
        <PasswordInput
          id="confirm-password"
          name="confirm-password"
          autoComplete="new-password"
          placeholder="••••••••••••"
          value={confirm}
          onChange={(event) => onConfirmChange(event.target.value)}
          disabled={disabled}
          aria-invalid={errors.confirm ? true : undefined}
          aria-describedby={errors.confirm ? fieldErrorId("confirm-password") : undefined}
          className={authInputClassName}
        />
      </FormField>
      {/* Ticks itself once the password meets the rule. */}
      <p id="password-rule" className="flex items-center gap-2 text-[0.8125rem] text-brand-muted">
        <span
          aria-hidden
          className={cn(
            "flex size-4 shrink-0 items-center justify-center rounded-[0.25rem] border transition-colors duration-200",
            met ? "border-emerald-600 bg-emerald-600 text-brand-white" : "border-[#e4e8f0] bg-brand-white",
          )}
        >
          {met ? <Check className="size-3" strokeWidth={3} /> : null}
        </span>
        {PASSWORD_RULE}
        <span className="sr-only">{met ? "(met)" : "(not met yet)"}</span>
      </p>
    </>
  );
}
