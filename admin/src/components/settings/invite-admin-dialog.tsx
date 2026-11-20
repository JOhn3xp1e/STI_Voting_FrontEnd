"use client";

import { useRef, useState, type ReactNode } from "react";

import { DialogCancel, DialogFrame, DialogHeading, dialogPrimaryClassName } from "@/components/shared/dialog-frame";
import { errorClassName, fieldClassName, labelClassName } from "@/components/shared/form-styles";
import styles from "@/components/shared/motion.module.css";
import { Caret, OptionMenu } from "@/components/students/option-menu";
import { cn } from "@/lib/utils";
import { ADMIN_EMAIL_DOMAINS, getInviteErrorMessage, inviteAdmin } from "@/services/admins/admin-accounts.service";
import {
  ELECTION_ADMIN_TYPES,
  createElectionAdmin,
  getElectionAdminErrorMessage,
  type ElectionAdmin,
  type ElectionAdminType,
} from "@/services/admins/election-admins.service";
import type { AdminAccount } from "@/types/auth.types";
import type { Election } from "@/types/election.types";

type Role = "super" | "election";

const ROLE_OPTIONS: readonly { value: Role; label: string }[] = [
  { value: "super", label: "Super Admin" },
  { value: "election", label: "Election Admin" },
];

const TYPE_OPTIONS = ELECTION_ADMIN_TYPES.map((type) => ({ value: type, label: type }));

/** Same rules (and wording) as the backend's super-admin invites. */
function validateAdminEmail(email: string): string | null {
  const value = email.trim().toLowerCase();
  if (!value) return "Enter the new admin's email.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Enter a valid email address.";
  const domain = value.slice(value.lastIndexOf("@") + 1);
  if (!(ADMIN_EMAIL_DOMAINS as readonly string[]).includes(domain)) {
    return "Admin emails must be a school email (@legazpi.sti.edu.ph) or a Gmail address (@gmail.com).";
  }
  return null;
}

interface ElectionAdminDraft {
  electionId: string | null;
  type: ElectionAdminType;
  fullName: string;
  email: string;
  facultyId: string;
  studentId: string;
}

type ElectionAdminErrors = Partial<Record<"electionId" | "fullName" | "email" | "facultyId" | "studentId", string>>;

function validateElectionAdmin(draft: ElectionAdminDraft): ElectionAdminErrors {
  const errors: ElectionAdminErrors = {};
  if (!draft.electionId) errors.electionId = "Pick the election they'll manage.";
  if (!draft.fullName.trim()) errors.fullName = "Enter their full name.";
  const email = draft.email.trim();
  if (!email) errors.email = "Enter their email.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email address.";
  if (draft.type === "Faculty" && !draft.facultyId.trim()) errors.facultyId = "Enter their faculty ID.";
  if (draft.type === "Student" && !/^\d{11}$/.test(draft.studentId.trim())) errors.studentId = "Enter the 11-digit student number, e.g. 02000404138.";
  return errors;
}

/** Elections an admin can still be assigned to: not cancelled or finished, soonest first. */
function assignableElections(elections: readonly Election[]): Election[] {
  return elections.filter((e) => e.status !== "Cancelled" && e.status !== "Completed").sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

interface InviteAdminDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called with the new super admin (Invite pending) once the invitation was sent. */
  onInvited: (admin: AdminAccount) => void;
  /** Called with the new election admin once it was saved. */
  onAssigned: (admin: ElectionAdmin) => void;
  /** For the election admin's election picker; `null` while loading or when they couldn't be loaded. */
  elections: readonly Election[] | null;
}

/**
 * "+ Invite admin": a super admin (email + optional name; the backend emails the invite) or an
 * election admin (one election, type, name, email and faculty ID / student number; saved only).
 */
export function InviteAdminDialog({ open, onClose, onInvited, onAssigned, elections }: InviteAdminDialogProps) {
  const [sending, setSending] = useState(false);
  // A new form on every open (so it starts empty), kept while the dialog animates closed.
  const [formKey, setFormKey] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setFormKey((key) => key + 1);
  }

  return (
    <DialogFrame open={open} onOpenChange={(next) => !next && onClose()} locked={sending} widthClassName="w-[min(32rem,calc(100vw-2rem))]">
      <InviteAdminForm key={formKey} sending={sending} setSending={setSending} onClose={onClose} onInvited={onInvited} onAssigned={onAssigned} elections={elections} />
    </DialogFrame>
  );
}

function InviteAdminForm({
  sending,
  setSending,
  onClose,
  onInvited,
  onAssigned,
  elections,
}: Omit<InviteAdminDialogProps, "open"> & { sending: boolean; setSending: (sending: boolean) => void }) {
  const firstInvalidRef = useRef<HTMLDivElement>(null);
  const [role, setRole] = useState<Role>("super");
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Super admin
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");

  // Election admin
  const [draft, setDraft] = useState<ElectionAdminDraft>({ electionId: null, type: "Faculty", fullName: "", email: "", facultyId: "", studentId: "" });
  const update = (patch: Partial<ElectionAdminDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setServerError(null);
  };

  const superEmailError = submitted && role === "super" ? validateAdminEmail(email) : null;
  const electionErrors: ElectionAdminErrors = submitted && role === "election" ? validateElectionAdmin(draft) : {};
  const options = assignableElections(elections ?? []);
  const election = options.find((e) => e.id === draft.electionId) ?? null;

  /** Focuses the first field with an error after a failed submit. */
  function focusFirstInvalid() {
    requestAnimationFrame(() => firstInvalidRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
  }

  async function send() {
    setSubmitted(true);
    setServerError(null);
    if (role === "super" ? validateAdminEmail(email) : Object.keys(validateElectionAdmin(draft)).length > 0) {
      focusFirstInvalid();
      return;
    }
    setSending(true);
    try {
      if (role === "super") {
        onInvited(await inviteAdmin({ email, fullName }));
      } else {
        onAssigned(
          await createElectionAdmin({
            electionId: draft.electionId!,
            type: draft.type,
            fullName: draft.fullName,
            email: draft.email,
            facultyId: draft.facultyId,
            studentId: draft.studentId,
          }),
        );
      }
      onClose();
    } catch (error) {
      setServerError(role === "super" ? getInviteErrorMessage(error) : getElectionAdminErrorMessage(error));
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
        title={role === "super" ? "Invite admin" : "Add election admin"}
        description={
          role === "super"
            ? "We'll email them a link to set up their account. The link works once."
            : "They'll only see and manage the election you pick. Invitation emails for election admins aren't available yet."
        }
        closeDisabled={sending}
      />

      <div ref={firstInvalidRef} className="flex flex-col gap-4 px-6 py-5">
        <Field label="Role" id="invite-role">
          <Segmented
            label="Role"
            value={role}
            options={ROLE_OPTIONS}
            disabled={sending}
            onChange={(next) => {
              setRole(next);
              setSubmitted(false);
              setServerError(null);
            }}
          />
        </Field>

        {role === "super" ? (
          <>
            <Field label="Email" id="invite-email" error={superEmailError} hint="School email (@legazpi.sti.edu.ph) or Gmail (@gmail.com).">
              <input
                id="invite-email"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setServerError(null);
                }}
                placeholder="name@legazpi.sti.edu.ph"
                aria-invalid={superEmailError ? true : undefined}
                aria-describedby={superEmailError ? "invite-email-error" : "invite-email-hint"}
                disabled={sending}
                className={fieldClassName}
              />
            </Field>
            <Field label="Full name" optional id="invite-full-name">
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
            </Field>
          </>
        ) : (
          <>
            <Field
              label="Election"
              id="ea-election"
              error={electionErrors.electionId}
              hint={elections === null ? "Loading elections…" : options.length === 0 ? "No upcoming or ongoing elections to assign." : undefined}
            >
              <OptionMenu<string>
                id="ea-election"
                label="Election"
                value={draft.electionId}
                options={options.map((e) => ({ value: e.id, label: `${e.title} · ${e.status}` }))}
                onChange={(id) => update({ electionId: id })}
                invalid={Boolean(electionErrors.electionId)}
                triggerClassName={cn(fieldClassName, "justify-between gap-2", !election && "text-muted-foreground")}
              >
                <span className="truncate">{election ? election.title : "Choose an election"}</span>
                <Caret />
              </OptionMenu>
            </Field>

            <Field label="Admin type" id="ea-type">
              <Segmented label="Admin type" value={draft.type} options={TYPE_OPTIONS} disabled={sending} onChange={(type) => update({ type })} />
            </Field>

            <Field label="Full name" id="ea-name" error={electionErrors.fullName}>
              <input
                id="ea-name"
                type="text"
                autoComplete="off"
                value={draft.fullName}
                onChange={(e) => update({ fullName: e.target.value })}
                placeholder="e.g. Ma. Reyes"
                aria-invalid={electionErrors.fullName ? true : undefined}
                aria-describedby={electionErrors.fullName ? "ea-name-error" : undefined}
                disabled={sending}
                className={fieldClassName}
              />
            </Field>

            <Field label="Email" id="ea-email" error={electionErrors.email}>
              <input
                id="ea-email"
                type="email"
                autoComplete="off"
                value={draft.email}
                onChange={(e) => update({ email: e.target.value })}
                placeholder="name@legazpi.sti.edu.ph"
                aria-invalid={electionErrors.email ? true : undefined}
                aria-describedby={electionErrors.email ? "ea-email-error" : undefined}
                disabled={sending}
                className={fieldClassName}
              />
            </Field>

            {draft.type === "Faculty" ? (
              <Field label="Faculty ID" id="ea-faculty" error={electionErrors.facultyId}>
                <input
                  id="ea-faculty"
                  type="text"
                  autoComplete="off"
                  value={draft.facultyId}
                  onChange={(e) => update({ facultyId: e.target.value })}
                  aria-invalid={electionErrors.facultyId ? true : undefined}
                  aria-describedby={electionErrors.facultyId ? "ea-faculty-error" : undefined}
                  disabled={sending}
                  className={fieldClassName}
                />
              </Field>
            ) : draft.type === "Student" ? (
              <Field label="Student No." id="ea-student" error={electionErrors.studentId}>
                <input
                  id="ea-student"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={draft.studentId}
                  // Digits only, so pasted numbers like "0200-040-4138" work too.
                  onChange={(e) => update({ studentId: e.target.value.replace(/\D/g, "").slice(0, 11) })}
                  placeholder="02000404138"
                  aria-invalid={electionErrors.studentId ? true : undefined}
                  aria-describedby={electionErrors.studentId ? "ea-student-error" : undefined}
                  disabled={sending}
                  className={cn(fieldClassName, "font-mono")}
                />
              </Field>
            ) : null}

            {election ? (
              <p className="text-[0.6875rem] leading-4 text-muted-foreground">This admin will only see and manage {election.title}.</p>
            ) : null}
          </>
        )}

        {serverError ? (
          <p role="alert" className={cn("rounded-md bg-destructive/8 px-3 py-2 text-[0.8125rem] text-destructive", styles.fieldError)}>
            {serverError}
          </p>
        ) : null}
      </div>

      <div className="flex justify-end gap-2.5 border-t border-border px-6 py-4">
        <DialogCancel disabled={sending} />
        <button type="submit" disabled={sending} className={dialogPrimaryClassName}>
          {role === "super" ? (sending ? "Sending…" : "Send invite") : sending ? "Adding…" : "Add election admin"}
        </button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Pieces                                   */
/* -------------------------------------------------------------------------- */

function Field({
  label,
  id,
  optional = false,
  error,
  hint,
  children,
}: {
  label: string;
  id: string;
  optional?: boolean;
  error?: string | null;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClassName}>
        {label} {optional ? <span className="font-normal text-muted-foreground">(optional)</span> : null}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className={cn(errorClassName, styles.fieldError)}>
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-[0.6875rem] leading-4 text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Equal-width choice buttons; the chosen one is filled blue (Figma "Admin type"). */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid rounded-md border border-border bg-background p-0.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-9 cursor-pointer rounded-[0.3125rem] px-3 text-[0.8125rem] font-medium whitespace-nowrap outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-brand-blue/30 disabled:cursor-not-allowed",
              checked ? "bg-brand-blue text-white dark:bg-[#3b6fb8]" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
