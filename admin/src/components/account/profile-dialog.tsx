"use client";

import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { Dialog } from "@base-ui/react/dialog";
import { Camera, Check, LoaderCircle, X } from "lucide-react";

import { useAdminSession } from "@/components/auth/admin-session";
import { meetsPasswordRule, MIN_PASSWORD_LENGTH, validateNewPassword, type NewPasswordErrors } from "@/components/auth/new-password-fields";
import { PasswordInput } from "@/components/auth/password-input";
import { AdminAvatar } from "@/components/dashboard/admin-avatar";
import { dialogPrimaryClassName, dialogSecondaryClassName } from "@/components/shared/dialog-frame";
import { errorClassName, fieldClassName, labelClassName } from "@/components/shared/form-styles";
import { Toast, useNotice } from "@/components/shared/page-feedback";
import { SectionCard } from "@/components/shared/section-card";
import { formatDate, todayIso } from "@/lib/dates";
import { getTermStatus } from "@/lib/terms";
import { cn } from "@/lib/utils";
import { checkAvatarFile, removeAdminAvatar, updateAdminAccount, uploadAdminAvatar } from "@/services/admins/admin-accounts.service";
import { getApiErrorMessage } from "@/services/api/error-message";
import {
  getAuthErrorMessage,
  getCurrentSignInMethod,
  hasGoogleIdentity,
  linkGoogle,
  signOutOtherDevices,
  updatePassword,
  type SignInMethod,
} from "@/services/auth/admin-auth.service";
import { fetchElections } from "@/services/elections/elections.service";
import { fetchTerms } from "@/services/terms/terms.service";

/* -------------------------------------------------------------------------- */
/*                                  Provider                                  */
/* -------------------------------------------------------------------------- */

/** Part of the pop-up to open on: the top, or the Password form already open. */
export type ProfileSection = "profile" | "password";

interface ProfileDialogContextValue {
  openProfile: (section?: ProfileSection) => void;
}

const ProfileDialogContext = createContext<ProfileDialogContextValue | null>(null);

/** Opens the "My profile" pop-up from anywhere in the dashboard (e.g. the account menu). */
export function useProfileDialog(): ProfileDialogContextValue {
  const value = useContext(ProfileDialogContext);
  if (!value) throw new Error("useProfileDialog must be used inside <ProfileDialogProvider>.");
  return value;
}

/** Must sit inside `AdminSessionGate` (it reads and refreshes the signed-in admin). */
export function ProfileDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<ProfileSection>("profile");
  const { notice, say } = useNotice();
  const value = useMemo(
    () => ({
      openProfile: (next: ProfileSection = "profile") => {
        setSection(next);
        setOpen(true);
      },
    }),
    [],
  );

  return (
    <ProfileDialogContext.Provider value={value}>
      {children}
      <ProfileDialog
        open={open}
        section={section}
        onOpenChange={setOpen}
        onSaved={() => {
          setOpen(false);
          say("Profile saved.");
        }}
      />
      <Toast notice={notice} />
    </ProfileDialogContext.Provider>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Helpers                                  */
/* -------------------------------------------------------------------------- */

const MAX_NAME_LENGTH = 100;

const ROLE_DESCRIPTIONS: Record<string, string> = {
  "super admin": "Full access to terms, programs, students, every election and settings",
};

const SIGN_IN_METHOD_LABELS: Record<SignInMethod, string> = {
  password: "email and password",
  google: "Google",
  microsoft: "Microsoft",
};

/** "Chrome on Windows", from the browser's user agent. */
function describeThisDevice(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X/.test(ua)
            ? "macOS"
            : /Linux/.test(ua)
              ? "Linux"
              : "this device";
  return `${browser} on ${os}`;
}

type Loadable<T> = { status: "loading" } | { status: "ready"; value: T } | { status: "error" };

/** Small result line under an action: green check on success, red on failure. */
type ActionNote = { tone: "success" | "error"; text: string } | null;

/* -------------------------------------------------------------------------- */
/*                                 Small parts                                */
/* -------------------------------------------------------------------------- */

const pillClassName = "inline-flex h-5 shrink-0 items-center rounded-[0.1875rem] px-2 font-mono text-[0.625rem] font-semibold tracking-[0.06em] uppercase";
const inputClassName = cn(fieldClassName, "rounded-[0.25rem] border-[#e2e8f0] dark:border-border");
const outlineWideClassName = cn(dialogSecondaryClassName, "inline-flex w-full items-center justify-center gap-2 rounded-[0.25rem]");
const smallButtonClassName = cn(dialogSecondaryClassName, "inline-flex h-8 items-center gap-1.5 rounded-[0.25rem] px-3 text-[0.8125rem]");
const linkButtonClassName =
  "shrink-0 cursor-pointer rounded-sm text-[0.84375rem] font-medium text-brand-blue outline-none hover:underline hover:underline-offset-2 focus-visible:ring-2 focus-visible:ring-brand-blue/30 disabled:cursor-wait disabled:opacity-60 dark:text-[#7aa7e6]";

function RolePill({ role }: { role: string }) {
  return <span className={cn(pillClassName, "bg-brand-navy text-white dark:bg-white dark:text-brand-navy")}>{role}</span>;
}

function AccessRow({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-[0.84375rem] leading-5 font-medium text-foreground">{title}</p>
        <p className="text-[0.75rem] leading-4.5 text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

function Note({ note, className }: { note: ActionNote; className?: string }) {
  if (!note) return null;
  return (
    <p
      role={note.tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-1.5 text-[0.75rem] leading-4.5 animate-in fade-in duration-200",
        note.tone === "error" ? "text-destructive" : "text-emerald-700 dark:text-emerald-400",
        className,
      )}
    >
      {note.tone === "success" ? <Check aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.4} /> : null}
      {note.text}
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Dialog                                   */
/* -------------------------------------------------------------------------- */

interface ProfileDialogProps {
  open: boolean;
  /** "password" opens with the Password form showing and focused. */
  section: ProfileSection;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

/**
 * "My profile" pop-up for the signed-in admin:
 * - name (Save changes) and photo (applies at once), through `/api/admin/accounts/{id}`;
 * - access: role, elections, Google sign-in linking;
 * - this device's sign-in, signing out other devices, and changing the password (Supabase).
 * Closing with an unsaved name or a half-typed password asks first.
 */
function ProfileDialog({ open, section, onOpenChange, onSaved }: ProfileDialogProps) {
  const { admin, me, refresh } = useAdminSession();
  const formId = useId();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(admin.fullName);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  const [photoBusy, setPhotoBusy] = useState<"upload" | "remove" | null>(null);
  const [photoNote, setPhotoNote] = useState<ActionNote>(null);

  const [elections, setElections] = useState<Loadable<string>>({ status: "loading" });
  const [signInMethod, setSignInMethod] = useState<SignInMethod | null>(null);
  const [googleLinked, setGoogleLinked] = useState<Loadable<boolean>>({ status: "loading" });
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleNote, setGoogleNote] = useState<ActionNote>(null);

  const [othersBusy, setOthersBusy] = useState(false);
  const [othersNote, setOthersNote] = useState<ActionNote>(null);

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordErrors, setPasswordErrors] = useState<NewPasswordErrors>({});
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordNote, setPasswordNote] = useState<ActionNote>(null);

  // The pop-up only renders in the browser, so reading the user agent here is safe.
  const [device] = useState(() => (typeof navigator === "undefined" ? "This browser" : describeThisDevice()));

  // Opened from "Change password": bring the form into view and focus it once the pop-up has rendered.
  useEffect(() => {
    if (!open || section !== "password") return;
    const timer = setTimeout(() => {
      const input = document.getElementById("profile-new-password");
      input?.scrollIntoView({ behavior: "smooth", block: "center" });
      input?.focus({ preventScroll: true });
    }, 120);
    return () => clearTimeout(timer);
  }, [open, section]);

  // Each time it opens: start from the saved profile, everything collapsed (or the Password form, when asked for).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(admin.fullName);
      setNameError(null);
      setSaveError(null);
      setConfirmClose(false);
      setPhotoNote(null);
      setElections({ status: "loading" });
      setGoogleLinked({ status: "loading" });
      setGoogleNote(null);
      setOthersNote(null);
      setPasswordOpen(section === "password");
      setPassword("");
      setConfirm("");
      setPasswordErrors({});
      setPasswordNote(null);
    }
  }

  // Elections this admin can manage (super admins: all of them), counted for the current term,
  // plus how this session signed in and whether Google is linked.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([fetchElections({ signal }), fetchTerms({ signal })])
      .then(([list, terms]) => {
        const current = terms.find((t) => getTermStatus(t, todayIso()) === "current");
        const value = current
          ? `All elections · ${list.filter((e) => e.termId === current.id).length} in ${current.id}`
          : `All elections · ${list.length} in total`;
        setElections({ status: "ready", value });
      })
      .catch(() => {
        if (!signal.aborted) setElections({ status: "error" });
      });
    void getCurrentSignInMethod().then((method) => {
      if (!signal.aborted) setSignInMethod(method);
    });
    hasGoogleIdentity()
      .then((linked) => {
        if (!signal.aborted) setGoogleLinked({ status: "ready", value: linked });
      })
      .catch(() => {
        if (!signal.aborted) setGoogleLinked({ status: "error" });
      });
    return () => controller.abort();
  }, [open]);

  const nameDirty = name.trim() !== admin.fullName;
  const passwordDirty = passwordOpen && (password !== "" || confirm !== "");
  const dirty = nameDirty || passwordDirty;
  const previewName = name.trim() || admin.fullName;
  const roleDescription = ROLE_DESCRIPTIONS[admin.role.toLowerCase()] ?? "Access set by a Super Admin";
  const adminSince = me.admin?.createdAt ? formatDate(me.admin.createdAt.slice(0, 10)) : null;

  /* ------------------------------ name (Save) ------------------------------ */

  function validateName(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return "Required.";
    if (trimmed.length > MAX_NAME_LENGTH) return `Use at most ${MAX_NAME_LENGTH} characters.`;
    return null;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!nameDirty || saving) return;
    const error = validateName(name);
    setNameError(error);
    if (error) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateAdminAccount(admin.id, { fullName: name.trim() });
      await refresh();
      onSaved();
    } catch (cause) {
      setSaveError(getApiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    setName(admin.fullName);
    setNameError(null);
    setSaveError(null);
    setPassword("");
    setConfirm("");
    setPasswordErrors({});
    setPasswordOpen(false);
    setConfirmClose(false);
  }

  /** Close, unless there are unsaved edits: then ask first. */
  function requestClose() {
    if (saving || passwordBusy) return;
    if (dirty) setConfirmClose(true);
    else onOpenChange(false);
  }

  /* ---------------------------- photo (at once) ---------------------------- */

  async function onPhotoPicked(file: File | undefined) {
    if (!file) return;
    const problem = checkAvatarFile(file);
    if (problem) return setPhotoNote({ tone: "error", text: problem });
    setPhotoBusy("upload");
    setPhotoNote(null);
    try {
      await uploadAdminAvatar(admin.id, file);
      await refresh();
      setPhotoNote({ tone: "success", text: "Photo updated." });
    } catch (cause) {
      setPhotoNote({ tone: "error", text: getApiErrorMessage(cause) });
    } finally {
      setPhotoBusy(null);
    }
  }

  async function removePhoto() {
    setPhotoBusy("remove");
    setPhotoNote(null);
    try {
      await removeAdminAvatar(admin.id);
      await refresh();
      setPhotoNote({ tone: "success", text: "Photo removed." });
    } catch (cause) {
      setPhotoNote({ tone: "error", text: getApiErrorMessage(cause) });
    } finally {
      setPhotoBusy(null);
    }
  }

  /* ------------------------------ sign-in bits ----------------------------- */

  async function connectGoogle() {
    setGoogleBusy(true);
    setGoogleNote(null);
    try {
      // Leaves for Google, then comes back to this page.
      await linkGoogle(`${window.location.pathname}${window.location.search}`);
    } catch (cause) {
      setGoogleNote({ tone: "error", text: getAuthErrorMessage(cause) });
      setGoogleBusy(false);
    }
  }

  async function signOutOthers() {
    setOthersBusy(true);
    setOthersNote(null);
    await signOutOtherDevices();
    setOthersBusy(false);
    setOthersNote({ tone: "success", text: "Your other devices were signed out." });
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (passwordBusy) return;
    const errors = validateNewPassword(password, confirm);
    setPasswordErrors(errors);
    if (Object.keys(errors).length) return;
    setPasswordBusy(true);
    setPasswordNote(null);
    try {
      await updatePassword(password);
    } catch (cause) {
      setPasswordNote({ tone: "error", text: getAuthErrorMessage(cause, "password") });
      setPasswordBusy(false);
      return;
    }
    // Like the reset flow: a new password ends the other sessions.
    await signOutOtherDevices();
    setPasswordBusy(false);
    setPassword("");
    setConfirm("");
    setPasswordOpen(false);
    setConfirmClose(false);
    setPasswordNote({ tone: "success", text: "Password changed. Your other devices were signed out." });
  }

  const busy = saving || photoBusy !== null || passwordBusy;

  return (
    <Dialog.Root open={open} onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}>
      <Dialog.Portal>
        <Dialog.Backdrop
          data-themed
          className="fixed inset-0 z-50 bg-brand-background/45 backdrop-blur-[2px] transition-opacity duration-300 ease-out data-ending-style:opacity-0 data-starting-style:opacity-0"
        />
        <Dialog.Popup
          data-themed
          className={cn(
            "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[min(62rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden",
            "rounded-2xl border border-border bg-popover text-popover-foreground shadow-[0_32px_80px_-24px_rgb(11_18_32/0.55)] outline-none",
            "transition-[opacity,scale,translate] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
            "data-starting-style:translate-y-[calc(-50%+12px)] data-starting-style:scale-[0.96] data-starting-style:opacity-0",
            "data-ending-style:translate-y-[calc(-50%+6px)] data-ending-style:scale-[0.97] data-ending-style:opacity-0",
            "motion-reduce:transition-opacity",
          )}
        >
          {/* Header: title + actions */}
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4 sm:px-6">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-[1.25rem] leading-7 font-semibold tracking-tight text-foreground">My profile</Dialog.Title>
              <Dialog.Description className="sr-only">Your name, photo, access, sign-in and password.</Dialog.Description>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={discard} disabled={!dirty || saving} className={cn(dialogSecondaryClassName, "rounded-[0.25rem]")}>
                Discard
              </button>
              <button
                type="submit"
                form={formId}
                disabled={!nameDirty || saving}
                className={cn(dialogPrimaryClassName, "inline-flex items-center gap-2 rounded-[0.25rem]")}
              >
                {saving ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}
                Save changes
              </button>
              <button
                type="button"
                onClick={requestClose}
                disabled={saving || passwordBusy}
                aria-label="Close"
                className="ml-1 flex size-9 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand-blue/30 disabled:cursor-wait disabled:opacity-50"
              >
                <X aria-hidden className="size-4.5" />
              </button>
            </div>
          </div>

          {/* Unsaved-changes prompt / save error */}
          {confirmClose ? (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-3 border-b border-[#f3d26b] bg-[#fff8db] px-5 py-2.5 text-[0.8125rem] text-brand-navy animate-in fade-in slide-in-from-top-1 duration-200 sm:px-6 dark:border-brand-gold/30 dark:bg-brand-gold/10 dark:text-foreground"
            >
              <span className="flex-1">You have unsaved changes.</span>
              <button type="button" onClick={() => setConfirmClose(false)} className="cursor-pointer rounded-sm font-medium underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand-blue/30">
                Keep editing
              </button>
              <button
                type="button"
                onClick={() => {
                  discard();
                  onOpenChange(false);
                }}
                className="cursor-pointer rounded-sm font-semibold text-destructive underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-destructive/30"
              >
                Discard and close
              </button>
            </div>
          ) : saveError ? (
            <p role="alert" className="border-b border-destructive/20 bg-destructive/5 px-5 py-2.5 text-[0.8125rem] text-destructive sm:px-6">
              Couldn&apos;t save: {saveError}
            </p>
          ) : null}

          {/* Body */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#f6f8fb] p-4 sm:p-5 dark:bg-background/60">
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="flex min-w-0 flex-col gap-4">
                <SectionCard title="Profile" aside={adminSince ? `admin since ${adminSince}` : undefined}>
                  <div className="flex flex-wrap items-center gap-3.5">
                    <span className="relative">
                      <AdminAvatar name={previewName} src={admin.avatarUrl} tone="blue" className="size-14 text-[0.9375rem]" />
                      {photoBusy ? (
                        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-brand-navy/55 text-white">
                          <LoaderCircle aria-hidden className="size-4.5 animate-spin" />
                        </span>
                      ) : null}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[1.125rem] leading-6 font-semibold text-foreground">{previewName}</p>
                      <p className="truncate font-mono text-[0.6875rem] text-muted-foreground">{admin.email}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className={smallButtonClassName}>
                          <Camera aria-hidden className="size-3.5" />
                          {admin.avatarUrl ? "Change photo" : "Upload photo"}
                        </button>
                        {admin.avatarUrl ? (
                          <button type="button" onClick={() => void removePhoto()} disabled={busy} className={cn(linkButtonClassName, "text-[0.8125rem] text-muted-foreground dark:text-muted-foreground")}>
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <RolePill role={admin.role} />
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      tabIndex={-1}
                      aria-hidden
                      onChange={(e) => {
                        void onPhotoPicked(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </div>
                  <Note note={photoNote} className="mt-2" />
                  <p className="mt-1 text-[0.71875rem] leading-4 text-muted-foreground">JPG, PNG or WEBP, up to 5 MB. Changes to your photo apply right away.</p>

                  <form id={formId} onSubmit={submit} noValidate className="mt-5 grid grid-cols-1 gap-x-3 gap-y-3.5 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label htmlFor="profile-full-name" className={labelClassName}>
                        Full name
                      </label>
                      <input
                        id="profile-full-name"
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value);
                          if (nameError) setNameError(validateName(e.target.value));
                          setSaveError(null);
                          setConfirmClose(false);
                        }}
                        disabled={saving}
                        autoComplete="name"
                        maxLength={MAX_NAME_LENGTH + 20}
                        aria-invalid={!!nameError || undefined}
                        aria-describedby={nameError ? "profile-full-name-error" : undefined}
                        className={inputClassName}
                      />
                      {nameError ? (
                        <p id="profile-full-name-error" className={errorClassName}>
                          {nameError}
                        </p>
                      ) : null}
                    </div>

                    <div className="sm:col-span-2">
                      <label htmlFor="profile-email" className={labelClassName}>
                        Email
                      </label>
                      <div className="relative">
                        <input
                          id="profile-email"
                          value={admin.email}
                          readOnly
                          aria-describedby="profile-email-hint"
                          className={cn(inputClassName, "cursor-default bg-muted/70 pr-20 text-muted-foreground hover:border-[#e2e8f0] focus:ring-0 dark:bg-white/5")}
                        />
                        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-[0.65625rem] text-muted-foreground">read-only</span>
                      </div>
                      <p id="profile-email-hint" className="mt-1.5 text-[0.71875rem] leading-4 text-muted-foreground">
                        Your sign-in email. Another Super Admin can change it from the Admins list.
                      </p>
                    </div>
                  </form>
                </SectionCard>

                <SectionCard title="Access" aside="set by a Super Admin" bodyClassName="px-5 py-4 divide-y divide-[#e2e8f0] dark:divide-border">
                  <AccessRow title="Role" description={roleDescription}>
                    <RolePill role={admin.role} />
                  </AccessRow>
                  <AccessRow
                    title="Elections you can manage"
                    description={elections.status === "ready" ? elections.value : elections.status === "loading" ? "Counting elections…" : "All elections"}
                  >
                    <Link
                      href="/elections"
                      onClick={(e) => {
                        if (dirty) {
                          e.preventDefault();
                          setConfirmClose(true);
                        } else onOpenChange(false);
                      }}
                      className={linkButtonClassName}
                    >
                      View
                    </Link>
                  </AccessRow>
                  <div className="py-3 last:pb-0">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-[0.84375rem] leading-5 font-medium text-foreground">Google sign-in</p>
                        <p className="text-[0.75rem] leading-4.5 text-muted-foreground">Sign in with your Google account instead of a password</p>
                      </div>
                      {googleLinked.status === "ready" && googleLinked.value ? (
                        <span className={cn(pillClassName, "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400")}>Linked</span>
                      ) : googleLinked.status === "loading" ? (
                        <LoaderCircle aria-label="Checking" className="size-4 animate-spin text-muted-foreground" />
                      ) : (
                        <button type="button" onClick={() => void connectGoogle()} disabled={googleBusy || dirty} className={linkButtonClassName} title={dirty ? "Save or discard your changes first" : undefined}>
                          {googleBusy ? "Opening Google…" : "Link Google"}
                        </button>
                      )}
                    </div>
                    <Note note={googleNote} className="mt-1.5" />
                  </div>
                </SectionCard>
              </div>

              <div className="flex min-w-0 flex-col gap-4">
                <SectionCard title="Sign-in activity" aside="this browser" bodyClassName="px-5 pt-4 pb-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[0.84375rem] leading-5 font-medium text-foreground">{device}</p>
                      <p className="text-[0.75rem] leading-4.5 text-muted-foreground">
                        Active now{signInMethod ? ` · signed in with ${SIGN_IN_METHOD_LABELS[signInMethod]}` : ""}
                      </p>
                    </div>
                    <span className={cn(pillClassName, "bg-brand-gold text-brand-navy")}>This device</span>
                  </div>
                  <p className="mt-3.5 border-t border-[#e2e8f0] pt-3.5 text-[0.75rem] leading-4.5 text-muted-foreground dark:border-border">
                    Signed in somewhere you don&apos;t recognise? Sign out everywhere else; this device stays signed in.
                  </p>
                  <button type="button" onClick={() => void signOutOthers()} disabled={othersBusy} className={cn(outlineWideClassName, "mt-3.5")}>
                    {othersBusy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}
                    Sign out other devices
                  </button>
                  <Note note={othersNote} className="mt-2" />
                </SectionCard>

                <SectionCard title="Password" bodyClassName="px-5 pt-4 pb-5">
                  {passwordOpen ? (
                    <form onSubmit={changePassword} noValidate className="flex flex-col gap-3 animate-in fade-in slide-in-from-top-1 duration-200">
                      <div>
                        <label htmlFor="profile-new-password" className={labelClassName}>
                          New password
                        </label>
                        <PasswordInput
                          id="profile-new-password"
                          autoComplete="new-password"
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            setConfirmClose(false);
                            if (passwordErrors.password || passwordErrors.confirm) setPasswordErrors(validateNewPassword(e.target.value, confirm));
                          }}
                          disabled={passwordBusy}
                          aria-invalid={!!passwordErrors.password || undefined}
                          aria-describedby="profile-password-rule"
                          className={inputClassName}
                        />
                        {passwordErrors.password ? <p className={errorClassName}>{passwordErrors.password}</p> : null}
                      </div>
                      <div>
                        <label htmlFor="profile-confirm-password" className={labelClassName}>
                          Confirm password
                        </label>
                        <PasswordInput
                          id="profile-confirm-password"
                          autoComplete="new-password"
                          value={confirm}
                          onChange={(e) => {
                            setConfirm(e.target.value);
                            setConfirmClose(false);
                            if (passwordErrors.confirm) setPasswordErrors(validateNewPassword(password, e.target.value));
                          }}
                          disabled={passwordBusy}
                          aria-invalid={!!passwordErrors.confirm || undefined}
                          className={inputClassName}
                        />
                        {passwordErrors.confirm ? <p className={errorClassName}>{passwordErrors.confirm}</p> : null}
                      </div>
                      <p id="profile-password-rule" className="flex items-center gap-2 text-[0.75rem] text-muted-foreground">
                        <span
                          aria-hidden
                          className={cn(
                            "flex size-3.5 shrink-0 items-center justify-center rounded-[0.1875rem] border transition-colors duration-200",
                            meetsPasswordRule(password) ? "border-emerald-600 bg-emerald-600 text-white" : "border-[#d5dbe3] dark:border-border",
                          )}
                        >
                          {meetsPasswordRule(password) ? <Check className="size-2.5" strokeWidth={3} /> : null}
                        </span>
                        At least {MIN_PASSWORD_LENGTH} characters, with a number
                      </p>
                      <Note note={passwordNote?.tone === "error" ? passwordNote : null} />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setPasswordOpen(false);
                            setPassword("");
                            setConfirm("");
                            setPasswordErrors({});
                            setPasswordNote(null);
                          }}
                          disabled={passwordBusy}
                          className={cn(dialogSecondaryClassName, "flex-1 rounded-[0.25rem]")}
                        >
                          Cancel
                        </button>
                        <button type="submit" disabled={passwordBusy} className={cn(dialogPrimaryClassName, "inline-flex flex-1 items-center justify-center gap-2 rounded-[0.25rem]")}>
                          {passwordBusy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}
                          Update
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <p className="text-[0.75rem] leading-4.5 text-muted-foreground">
                        {signInMethod && signInMethod !== "password"
                          ? `You signed in with ${SIGN_IN_METHOD_LABELS[signInMethod]}. Set a password to sign in with your email too.`
                          : "Changing it signs you out on your other devices."}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setPasswordOpen(true);
                          setPasswordNote(null);
                        }}
                        className={cn(outlineWideClassName, "mt-3.5")}
                      >
                        {signInMethod && signInMethod !== "password" ? "Set a password" : "Change password"}
                      </button>
                      <Note note={passwordNote?.tone === "success" ? passwordNote : null} className="mt-2" />
                    </>
                  )}
                </SectionCard>
              </div>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
