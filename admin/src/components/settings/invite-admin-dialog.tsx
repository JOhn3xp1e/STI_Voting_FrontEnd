"use client";

import { useRef, useState } from "react";

import { DialogCancel, DialogFrame, DialogHeading, dialogPrimaryClassName } from "@/components/shared/dialog-frame";
import { errorClassName, fieldClassName, labelClassName } from "@/components/shared/form-styles";
import { LockedField } from "@/components/shared/locked-field";
import styles from "@/components/shared/motion.module.css";
import { cn } from "@/lib/utils";
import { ADMIN_EMAIL_DOMAINS, getInviteErrorMessage, inviteAdmin } from "@/services/admins/admin-accounts.service";
import type { AdminAccount } from "@/types/auth.types";

/** Same rules (and wording) as the backend. */
function validateEmail(email: string): string | null {
  const value = email.trim().toLowerCase();
  if (!value) return "Enter the new admin's email.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Enter a valid email address.";
  const domain = value.slice(value.lastIndexOf("@") + 1);
  if (!(ADMIN_EMAIL_DOMAINS as readonly string[]).includes(domain)) {
    return "Admin emails must be a school email (@legazpi.sti.edu.ph) or a Gmail address (@gmail.com).";
  }
  return null;
}

interface InviteAdminDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called with the new admin (Invite pending) once the invitation was sent. */
  onInvited: (admin: AdminAccount) => void;
}

/** "+ Invite admin": email (required) and full name (optional). The backend creates the admin and emails the invite. */
export function InviteAdminDialog({ open, onClose, onInvited }: InviteAdminDialogProps) {
  const [sending, setSending] = useState(false);
  // A new form on every open (so it starts empty), kept while the dialog animates closed.
  const [formKey, setFormKey] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setFormKey((key) => key + 1);
  }

  return (
    <DialogFrame open={open} onOpenChange={(next) => !next && onClose()} locked={sending} widthClassName="w-[min(30rem,calc(100vw-2rem))]">
      <InviteAdminForm key={formKey} sending={sending} setSending={setSending} onClose={onClose} onInvited={onInvited} />
    </DialogFrame>
  );
}

function InviteAdminForm({
  sending,
  setSending,
  onClose,
  onInvited,
}: Omit<InviteAdminDialogProps, "open"> & { sending: boolean; setSending: (sending: boolean) => void }) {
  const emailRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const emailError = submitted ? validateEmail(email) : null;

  async function send() {
    setSubmitted(true);
    setServerError(null);
    if (validateEmail(email)) {
      emailRef.current?.focus();
      return;
    }
    setSending(true);
    try {
      const admin = await inviteAdmin({ email, fullName });
      onInvited(admin);
      onClose();
    } catch (error) {
      setServerError(getInviteErrorMessage(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <form
      noValidate
      aria-busy={sending}
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <DialogHeading
        eyebrow="Settings · Admins"
        title="Invite admin"
        description="We'll email them a link to set up their account. The link works once."
        closeDisabled={sending}
      />

      <div className="flex flex-col gap-4 px-6 py-5">
        <div>
          <label htmlFor="invite-email" className={labelClassName}>
            Email
          </label>
          <input
            id="invite-email"
            ref={emailRef}
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setServerError(null);
            }}
            placeholder="name@legazpi.sti.edu.ph"
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? "invite-email-error" : "invite-email-hint"}
            disabled={sending}
            className={fieldClassName}
          />
          {emailError ? (
            <p id="invite-email-error" role="alert" className={cn(errorClassName, styles.fieldError)}>
              {emailError}
            </p>
          ) : (
            <p id="invite-email-hint" className="mt-1 text-[0.6875rem] leading-4 text-muted-foreground">
              School email (@legazpi.sti.edu.ph) or Gmail (@gmail.com).
            </p>
          )}
        </div>

        <div>
          <label htmlFor="invite-full-name" className={labelClassName}>
            Full name <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <input
            id="invite-full-name"
            type="text"
            autoComplete="off"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="They can add it when they accept"
            disabled={sending}
            className={fieldClassName}
          />
        </div>

        <LockedField id="invite-role" label="Role" value="Super Admin" />

        {serverError ? (
          <p role="alert" className={cn("rounded-md bg-destructive/8 px-3 py-2 text-[0.8125rem] text-destructive", styles.fieldError)}>
            {serverError}
          </p>
        ) : null}
      </div>

      <div className="flex justify-end gap-2.5 border-t border-border px-6 py-4">
        <DialogCancel disabled={sending} />
        <button type="submit" disabled={sending} className={dialogPrimaryClassName}>
          {sending ? "Sending…" : "Send invite"}
        </button>
      </div>
    </form>
  );
}
