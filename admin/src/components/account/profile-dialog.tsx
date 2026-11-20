"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { Dialog } from "@base-ui/react/dialog";
import { Menu } from "@base-ui/react/menu";
import { Camera, Check, KeyRound, LoaderCircle, LogOut, Monitor, Pencil, ShieldCheck, Trash2, UserRoundCog, UsersRound, X } from "lucide-react";

import { useAdminSession } from "@/components/auth/admin-session";
import { MIN_PASSWORD_LENGTH, validateNewPassword } from "@/components/auth/new-password-fields";
import { PasswordInput } from "@/components/auth/password-input";
import { AdminAvatar } from "@/components/dashboard/admin-avatar";
import { menuItemClassName, popupClassName } from "@/components/dashboard/popup-styles";
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
  hasTwoStepSignIn,
  isWrongPasswordError,
  linkGoogle,
  signOutOtherDevices,
  updatePassword,
  verifyCurrentPassword,
  type SignInMethod,
} from "@/services/auth/admin-auth.service";
import { fetchElections } from "@/services/elections/elections.service";
import { fetchTerms } from "@/services/terms/terms.service";

/* -------------------------------------------------------------------------- */
/*                                  Provider                                  */
/* -------------------------------------------------------------------------- */

/** Tab to open on: the profile, or the Change password form. */
export type ProfileSection = "profile" | "password";

interface ProfileDialogContextValue {
  openProfile: (section?: ProfileSection) => void;
}

const ProfileDialogContext = createContext<ProfileDialogContextValue | null>(null);

/** Opens the "Personal settings" pop-up from anywhere in the dashboard (e.g. the account menu). */
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

const TABS: { id: ProfileSection; label: string; icon: typeof UsersRound }[] = [
  { id: "profile", label: "My profile", icon: UsersRound },
  { id: "password", label: "Change password", icon: KeyRound },
];

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

/** "Maria Clara Santos" → ["Maria Clara", "Santos"]; a single word is all first name. */
function splitName(fullName: string): [string, string] {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return [words[0] ?? "", ""];
  return [words.slice(0, -1).join(" "), words[words.length - 1]];
}

function joinName(first: string, last: string): string {
  return `${first} ${last}`.trim().replace(/\s+/g, " ");
}

/** "super admin" → "Super Admin" */
function titleCase(value: string): string {
  return value.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

type Loadable<T> = { status: "loading" } | { status: "ready"; value: T } | { status: "error" };

/** Small result line under an action: green check on success, red on failure. */
type ActionNote = { tone: "success" | "error"; text: string } | null;

interface PasswordErrors {
  current?: string;
  password?: string;
  confirm?: string;
}

/** Fade-and-rise entrance, staggered by `index` (cards of a tab). */
function enter(index: number): { className: string; style: CSSProperties } {
  return {
    className: "animate-in fade-in slide-in-from-bottom-3 duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] fill-mode-both motion-reduce:slide-in-from-bottom-0",
    style: { animationDelay: `${index * 70}ms` },
  };
}

/* -------------------------------------------------------------------------- */
/*                                 Small parts                                */
/* -------------------------------------------------------------------------- */

const pillClassName = "inline-flex h-5 shrink-0 items-center rounded-[0.1875rem] px-2 font-mono text-[0.625rem] font-semibold tracking-[0.06em] uppercase";
const pressClassName = "transition-[background-color,border-color,color,opacity,scale] active:scale-[0.97] motion-reduce:active:scale-100";
const linkButtonClassName =
  "shrink-0 cursor-pointer rounded-sm text-[0.84375rem] font-medium text-brand-blue outline-none hover:underline hover:underline-offset-2 focus-visible:ring-2 focus-visible:ring-brand-blue/30 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:no-underline dark:text-[#7aa7e6]";

function RolePill({ role }: { role: string }) {
  return <span className={cn(pillClassName, "bg-brand-navy text-white dark:bg-white dark:text-brand-navy")}>{role}</span>;
}

function AccessRow({ title, description, children }: { title: string; description: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-[0.875rem] leading-5 font-medium text-foreground">{title}</p>
        <p className="text-[0.78125rem] leading-4.5 text-muted-foreground">{description}</p>
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
        "flex items-start gap-1.5 text-[0.75rem] leading-4.5 animate-in fade-in slide-in-from-top-1 duration-300",
        note.tone === "error" ? "text-destructive" : "text-emerald-700 dark:text-emerald-400",
        className,
      )}
    >
      {note.tone === "success" ? <Check aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.4} /> : null}
      {note.text}
    </p>
  );
}

/** Rows of the "Your new password" checklist: a ring that fills with a tick once met. */
function Requirement({ met, pending, children }: { met: boolean; pending?: ReactNode; children: ReactNode }) {
  return (
    <li className={cn("flex items-center gap-2.5 text-[0.84375rem] leading-5 transition-colors duration-300", met ? "text-foreground" : "text-muted-foreground")}>
      <span
        aria-hidden
        className={cn(
          "relative flex size-3.5 shrink-0 items-center justify-center rounded-full border transition-[border-color,background-color,scale] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
          met ? "scale-100 border-transparent bg-transparent text-brand-blue dark:text-[#7aa7e6]" : "scale-90 border-[#b8c2cf] dark:border-white/30",
        )}
      >
        <Check
          strokeWidth={3}
          className={cn(
            "size-3.5 transition-[opacity,scale] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-opacity",
            met ? "scale-100 opacity-100" : "scale-0 opacity-0",
          )}
        />
      </span>
      <span>
        {children}
        {!met && pending ? <span className="text-muted-foreground"> · {pending}</span> : null}
      </span>
      <span className="sr-only">{met ? "(done)" : "(not yet)"}</span>
    </li>
  );
}

function Switch({ checked, onChange, disabled, labelledBy, describedBy }: { checked: boolean; onChange: (next: boolean) => void; disabled?: boolean; labelledBy: string; describedBy?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5.5 w-9.5 shrink-0 cursor-pointer items-center rounded-full outline-none",
        "transition-colors duration-300 focus-visible:ring-3 focus-visible:ring-brand-blue/25 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-brand-blue" : "bg-[#cfd6df] dark:bg-white/20",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-0.75 left-0.75 size-4 rounded-full bg-white shadow-[0_1px_3px_rgb(11_18_32/0.3)]",
          "transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none",
          checked ? "translate-x-4" : "translate-x-0",
        )}
      />
    </button>
  );
}

/** Sidebar tabs with a highlight that glides to the selected one. */
function TabNav({ tab, onChange }: { tab: ProfileSection; onChange: (tab: ProfileSection) => void }) {
  const listRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const measure = useCallback(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-tab="${tab}"]`);
    if (el) setRect({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
  }, [tab]);

  useLayoutEffect(() => {
    measure();
    const list = listRef.current;
    if (!list) return;
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [measure]);

  return (
    <div ref={listRef} role="tablist" aria-orientation="vertical" aria-label="Personal settings" className="relative flex gap-1 md:flex-col">
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-0 left-0 rounded-lg border border-[#dfe5ec] bg-card shadow-[0_1px_2px_rgb(11_18_32/0.06),0_4px_12px_-6px_rgb(11_18_32/0.12)] dark:border-white/10 dark:bg-white/6",
          "transition-[translate,width,height,opacity] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          rect ? "opacity-100" : "opacity-0",
        )}
        style={rect ? { translate: `${rect.x}px ${rect.y}px`, width: rect.w, height: rect.h } : undefined}
      />
      {TABS.map(({ id, label, icon: Icon }) => {
        const selected = id === tab;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            data-tab={id}
            id={`profile-tab-${id}`}
            aria-selected={selected}
            aria-controls="profile-tabpanel"
            onClick={() => onChange(id)}
            className={cn(
              "group relative z-1 flex h-10 cursor-pointer items-center gap-3 rounded-lg px-3 text-[0.875rem] whitespace-nowrap outline-none",
              "transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-brand-blue/30",
              selected ? "font-semibold text-foreground" : "font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <Icon
              aria-hidden
              strokeWidth={1.75}
              className={cn("size-4.5 shrink-0 transition-[color,scale] duration-300", selected ? "text-brand-navy dark:text-white" : "group-hover:scale-110")}
            />
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Dialog                                   */
/* -------------------------------------------------------------------------- */

interface ProfileDialogProps {
  open: boolean;
  /** Tab to show when it opens; "password" also focuses the first password field. */
  section: ProfileSection;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

/**
 * "Personal settings" pop-up for the signed-in admin, in two tabs:
 * - My profile: name (Save changes) and photo (applies at once) through `/api/admin/accounts/{id}`;
 *   access (role, elections, two-step, Google linking) and this device's sign-in.
 * - Change password: current password check, the new password with a live checklist, and
 *   optionally signing out the other devices (Supabase).
 * Closing with an unsaved name or a half-typed password asks first.
 */
function ProfileDialog({ open, section, onOpenChange, onSaved }: ProfileDialogProps) {
  const { admin, me, refresh, signOut } = useAdminSession();
  const formId = useId();
  const othersSwitchId = useId();
  const fileRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<ProfileSection>(section);

  const [firstName, setFirstName] = useState(() => splitName(admin.fullName)[0]);
  const [lastName, setLastName] = useState(() => splitName(admin.fullName)[1]);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  const [photoBusy, setPhotoBusy] = useState<"upload" | "remove" | null>(null);
  const [photoNote, setPhotoNote] = useState<ActionNote>(null);

  const [elections, setElections] = useState<Loadable<string>>({ status: "loading" });
  const [signInMethod, setSignInMethod] = useState<SignInMethod | null>(null);
  const [twoStep, setTwoStep] = useState<Loadable<boolean>>({ status: "loading" });
  const [googleLinked, setGoogleLinked] = useState<Loadable<boolean>>({ status: "loading" });
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleNote, setGoogleNote] = useState<ActionNote>(null);

  const [othersBusy, setOthersBusy] = useState(false);
  const [othersNote, setOthersNote] = useState<ActionNote>(null);

  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [passwordErrors, setPasswordErrors] = useState<PasswordErrors>({});
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordNote, setPasswordNote] = useState<ActionNote>(null);

  // The pop-up only renders in the browser, so reading the user agent here is safe.
  const [device] = useState(() => (typeof navigator === "undefined" ? "This browser" : describeThisDevice()));

  // Each time it opens: start from the saved profile on the asked-for tab.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const [first, last] = splitName(admin.fullName);
      setTab(section);
      setFirstName(first);
      setLastName(last);
      setNameError(null);
      setSaveError(null);
      setConfirmClose(false);
      setPhotoNote(null);
      setElections({ status: "loading" });
      setTwoStep({ status: "loading" });
      setGoogleLinked({ status: "loading" });
      setGoogleNote(null);
      setOthersNote(null);
      setCurrent("");
      setPassword("");
      setConfirm("");
      setSignOutOthers(true);
      setPasswordErrors({});
      setPasswordNote(null);
    }
  }

  // Opened from "Change password": focus the first password field once the pop-up has rendered.
  useEffect(() => {
    if (!open || section !== "password") return;
    const timer = setTimeout(() => document.getElementById("profile-current-password")?.focus({ preventScroll: true }), 160);
    return () => clearTimeout(timer);
  }, [open, section]);

  // Elections this admin can manage (super admins: all of them), counted for the current term,
  // plus how this session signed in, two-step status and whether Google is linked.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([fetchElections({ signal }), fetchTerms({ signal })])
      .then(([list, terms]) => {
        const currentTerm = terms.find((t) => getTermStatus(t, todayIso()) === "current");
        const value = currentTerm
          ? `All elections · ${list.filter((e) => e.termId === currentTerm.id).length} in ${currentTerm.id}`
          : `All elections · ${list.length} in total`;
        setElections({ status: "ready", value });
      })
      .catch(() => {
        if (!signal.aborted) setElections({ status: "error" });
      });
    void getCurrentSignInMethod().then((method) => {
      if (!signal.aborted) setSignInMethod(method);
    });
    hasTwoStepSignIn()
      .then((on) => {
        if (!signal.aborted) setTwoStep({ status: "ready", value: on });
      })
      .catch(() => {
        if (!signal.aborted) setTwoStep({ status: "error" });
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

  const fullName = joinName(firstName, lastName);
  const nameDirty = fullName !== joinName(...splitName(admin.fullName));
  const passwordDirty = current !== "" || password !== "" || confirm !== "";
  const dirty = nameDirty || passwordDirty;
  const previewName = fullName || admin.fullName;
  const roleLabel = titleCase(admin.role);
  const roleDescription = ROLE_DESCRIPTIONS[admin.role.toLowerCase()] ?? "Access set by a Super Admin";
  const adminSince = me.admin?.createdAt ? formatDate(me.admin.createdAt.slice(0, 10)) : null;
  // Signed in with Google/Microsoft: there may be no password yet, so the current one is optional.
  const currentRequired = signInMethod === null || signInMethod === "password";

  /* ------------------------------ name (Save) ------------------------------ */

  function validateName(first: string, last: string): string | null {
    if (!first.trim()) return "Enter your first name.";
    if (joinName(first, last).length > MAX_NAME_LENGTH) return `Use at most ${MAX_NAME_LENGTH} characters in all.`;
    return null;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!nameDirty || saving) return;
    const error = validateName(firstName, lastName);
    setNameError(error);
    if (error) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateAdminAccount(admin.id, { fullName });
      await refresh();
      onSaved();
    } catch (cause) {
      setSaveError(getApiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  function discardName() {
    const [first, last] = splitName(admin.fullName);
    setFirstName(first);
    setLastName(last);
    setNameError(null);
    setSaveError(null);
  }

  function clearPassword() {
    setCurrent("");
    setPassword("");
    setConfirm("");
    setPasswordErrors({});
    setPasswordNote(null);
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

  async function endOtherSessions() {
    setOthersBusy(true);
    setOthersNote(null);
    await signOutOtherDevices();
    setOthersBusy(false);
    setOthersNote({ tone: "success", text: "Your other devices were signed out." });
  }

  /* -------------------------------- password ------------------------------- */

  function checkPassword(): PasswordErrors {
    const errors: PasswordErrors = { ...validateNewPassword(password, confirm) };
    if (currentRequired && !current) errors.current = "Enter your current password.";
    if (!errors.password && current && password === current) errors.password = "Choose a password different from your current one.";
    return errors;
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (passwordBusy) return;
    const errors = checkPassword();
    setPasswordErrors(errors);
    if (Object.keys(errors).length) {
      const first = errors.current ? "profile-current-password" : errors.password ? "profile-new-password" : "profile-confirm-password";
      document.getElementById(first)?.focus();
      return;
    }
    setPasswordBusy(true);
    setPasswordNote(null);
    try {
      if (current) {
        try {
          await verifyCurrentPassword(admin.email, current);
        } catch (cause) {
          if (isWrongPasswordError(cause)) {
            setPasswordErrors({ current: "That isn't your current password." });
            document.getElementById("profile-current-password")?.focus();
            return;
          }
          throw cause;
        }
      }
      await updatePassword(password);
    } catch (cause) {
      setPasswordNote({ tone: "error", text: getAuthErrorMessage(cause, "password") });
      return;
    } finally {
      setPasswordBusy(false);
    }
    if (signOutOthers) await signOutOtherDevices();
    setCurrent("");
    setPassword("");
    setConfirm("");
    setConfirmClose(false);
    setPasswordNote({
      tone: "success",
      text: signOutOthers ? "Password updated. Your other devices were signed out." : "Password updated.",
    });
  }

  const busy = saving || photoBusy !== null || passwordBusy;
  const isProfile = tab === "profile";
  const heading = isProfile
    ? { title: "My profile", description: "Your name, contact details and where you're signed in." }
    : {
        title: signInMethod && signInMethod !== "password" ? "Change or set a password" : "Change password",
        description: `Use at least ${MIN_PASSWORD_LENGTH} characters with a number. You stay signed in on this device.`,
      };

  const lengthMet = password.length >= MIN_PASSWORD_LENGTH;
  const numberMet = /\d/.test(password);
  const matchMet = confirm !== "" && confirm === password;
  const differentMet = password !== "" && current !== "" && password !== current;

  return (
    <Dialog.Root open={open} onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}>
      <Dialog.Portal>
        <Dialog.Backdrop
          data-themed
          className="fixed inset-0 z-50 bg-brand-background/45 backdrop-blur-[3px] transition-[opacity,backdrop-filter] duration-300 ease-out data-ending-style:opacity-0 data-starting-style:opacity-0 data-starting-style:backdrop-blur-none"
        />
        <Dialog.Popup
          data-themed
          className={cn(
            "fixed top-1/2 left-1/2 z-50 flex h-[min(47.5rem,calc(100dvh-2rem))] w-[min(62.5rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden md:flex-row",
            "rounded-2xl border border-border bg-popover text-popover-foreground shadow-[0_40px_100px_-30px_rgb(11_18_32/0.6),0_0_0_1px_rgb(11_18_32/0.02)] outline-none",
            "transition-[opacity,scale,translate,filter] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)]",
            "data-starting-style:translate-y-[calc(-50%+16px)] data-starting-style:scale-[0.95] data-starting-style:opacity-0 data-starting-style:blur-[2px]",
            "data-ending-style:translate-y-[calc(-50%+8px)] data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-ending-style:duration-200",
            "motion-reduce:transition-opacity motion-reduce:data-starting-style:blur-none",
          )}
        >
          {/* ------------------------------ Sidebar ------------------------------ */}
          <aside className="flex shrink-0 items-center gap-2 border-b border-border bg-[#fbfcfd] px-3 py-2.5 md:w-58 md:flex-col md:items-stretch md:gap-0 md:border-r md:border-b-0 md:px-4 md:pt-6 md:pb-5 dark:bg-white/1.5">
            <p className="hidden px-1 font-mono text-[0.6875rem] font-medium tracking-widest text-muted-foreground uppercase md:block">Personal settings</p>
            <div className="mt-3.5 mb-5 hidden items-center gap-3 px-1 md:flex animate-in fade-in slide-in-from-left-2 duration-500 fill-mode-both" style={{ animationDelay: "80ms" }}>
              <AdminAvatar name={previewName} src={admin.avatarUrl} tone="blue" className="size-9.5 text-[0.75rem] transition-transform duration-300" />
              <div className="min-w-0">
                <p className="truncate text-[0.875rem] leading-5 font-semibold text-foreground">{previewName}</p>
                <p className="truncate text-[0.75rem] leading-4 text-muted-foreground">{roleLabel}</p>
              </div>
            </div>
            <div className="min-w-0 flex-1 overflow-x-auto md:flex-none md:overflow-visible">
              <TabNav
                tab={tab}
                onChange={(next) => {
                  setTab(next);
                  setConfirmClose(false);
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              disabled={busy}
              aria-label="Log out"
              className={cn(
                "group flex h-10 shrink-0 cursor-pointer items-center gap-3 rounded-lg px-3 text-[0.875rem] font-medium text-muted-foreground outline-none md:mt-auto",
                "transition-colors duration-200 hover:bg-destructive/8 hover:text-destructive focus-visible:ring-2 focus-visible:ring-destructive/30 disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              <LogOut aria-hidden strokeWidth={1.75} className="size-4.5 transition-transform duration-300 group-hover:translate-x-0.5" />
              <span className="hidden md:inline">Log out</span>
            </button>
          </aside>

          {/* ------------------------------- Main -------------------------------- */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex items-start gap-4 border-b border-border px-5 pt-5 pb-4 sm:px-7 sm:pt-6">
              <div key={tab} className="min-w-0 flex-1 animate-in fade-in slide-in-from-left-1 duration-300">
                <Dialog.Title className="text-[1.25rem] leading-7 font-semibold tracking-tight text-foreground">{heading.title}</Dialog.Title>
                <Dialog.Description className="mt-0.5 text-[0.8125rem] leading-5 text-muted-foreground">{heading.description}</Dialog.Description>
              </div>
              <button
                type="button"
                onClick={requestClose}
                disabled={saving || passwordBusy}
                aria-label="Close"
                className="-mr-2 flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground outline-none transition-[background-color,color,rotate] duration-300 hover:rotate-90 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand-blue/30 disabled:cursor-wait disabled:opacity-50 motion-reduce:hover:rotate-0"
              >
                <X aria-hidden className="size-4.5" />
              </button>
            </div>

            {/* Unsaved-changes prompt / save error */}
            {confirmClose ? (
              <div
                role="alert"
                className="flex flex-wrap items-center gap-3 border-b border-[#f3d26b] bg-[#fff8db] px-5 py-2.5 text-[0.8125rem] text-brand-navy animate-in fade-in slide-in-from-top-2 duration-300 sm:px-7 dark:border-brand-gold/30 dark:bg-brand-gold/10 dark:text-foreground"
              >
                <span className="flex-1">
                  You have unsaved changes{nameDirty && passwordDirty ? " to your profile and password" : nameDirty ? " to your profile" : " to your password"}.
                </span>
                <button type="button" onClick={() => setConfirmClose(false)} className="cursor-pointer rounded-sm font-medium underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand-blue/30">
                  Keep editing
                </button>
                <button
                  type="button"
                  onClick={() => {
                    discardName();
                    clearPassword();
                    setConfirmClose(false);
                    onOpenChange(false);
                  }}
                  className="cursor-pointer rounded-sm font-semibold text-destructive underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-destructive/30"
                >
                  Discard and close
                </button>
              </div>
            ) : saveError && isProfile ? (
              <p role="alert" className="border-b border-destructive/20 bg-destructive/5 px-5 py-2.5 text-[0.8125rem] text-destructive animate-in fade-in slide-in-from-top-2 duration-300 sm:px-7">
                Couldn&apos;t save: {saveError}
              </p>
            ) : null}

            <div
              key={tab}
              id="profile-tabpanel"
              role="tabpanel"
              aria-labelledby={`profile-tab-${tab}`}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 scrollbar-gutter-stable sm:px-7"
            >
              {isProfile ? (
                <div className="flex flex-col gap-4">
                  {/* ---------------------------- Profile ---------------------------- */}
                  <SectionCard title="Profile" aside={adminSince ? `admin since ${adminSince}` : undefined} {...enter(0)}>
                    <div className="flex items-center gap-3.5">
                      <span className="group/avatar relative shrink-0">
                        <AdminAvatar name={previewName} src={admin.avatarUrl} tone="blue" className="size-14 text-[0.9375rem] ring-4 ring-brand-blue/8 transition-shadow duration-300 group-hover/avatar:ring-brand-blue/15" />
                        <span
                          aria-hidden
                          className={cn(
                            "pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-brand-navy/55 text-white transition-opacity duration-300",
                            photoBusy ? "opacity-100" : "opacity-0 group-hover/avatar:opacity-100",
                          )}
                        >
                          {photoBusy ? <LoaderCircle className="size-4.5 animate-spin" /> : <Camera className="size-4.5" />}
                        </span>
                        <PhotoButton
                          hasPhoto={Boolean(admin.avatarUrl)}
                          disabled={busy}
                          onPick={() => fileRef.current?.click()}
                          onRemove={() => void removePhoto()}
                        />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[1.125rem] leading-6 font-semibold text-foreground">{previewName}</p>
                        <p className="truncate text-[0.8125rem] text-muted-foreground">{admin.email}</p>
                      </div>
                      <span className="hidden sm:inline-flex">
                        <RolePill role={admin.role} />
                      </span>
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
                    <Note note={photoNote} className="mt-2.5" />

                    <form id={formId} onSubmit={submit} noValidate className="mt-5 grid grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="profile-first-name" className={labelClassName}>
                          First name
                        </label>
                        <input
                          id="profile-first-name"
                          value={firstName}
                          onChange={(e) => {
                            setFirstName(e.target.value);
                            if (nameError) setNameError(validateName(e.target.value, lastName));
                            setSaveError(null);
                            setConfirmClose(false);
                          }}
                          disabled={saving}
                          autoComplete="given-name"
                          maxLength={MAX_NAME_LENGTH}
                          aria-invalid={!!nameError || undefined}
                          aria-describedby={nameError ? "profile-name-error" : undefined}
                          className={fieldClassName}
                        />
                      </div>
                      <div>
                        <label htmlFor="profile-last-name" className={labelClassName}>
                          Last name
                        </label>
                        <input
                          id="profile-last-name"
                          value={lastName}
                          onChange={(e) => {
                            setLastName(e.target.value);
                            if (nameError) setNameError(validateName(firstName, e.target.value));
                            setSaveError(null);
                            setConfirmClose(false);
                          }}
                          disabled={saving}
                          autoComplete="family-name"
                          maxLength={MAX_NAME_LENGTH}
                          className={fieldClassName}
                        />
                      </div>
                      {nameError ? (
                        <p id="profile-name-error" className={cn(errorClassName, "-mt-2.5 animate-in fade-in slide-in-from-top-1 duration-200 sm:col-span-2")}>
                          {nameError}
                        </p>
                      ) : null}

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
                            className={cn(fieldClassName, "cursor-default bg-muted/60 pr-20 text-muted-foreground hover:border-border focus:border-border focus:ring-0 focus-visible:border-border focus-visible:ring-0 dark:bg-white/5")}
                          />
                          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-[0.65625rem] text-muted-foreground">read-only</span>
                        </div>
                        <p id="profile-email-hint" className="mt-1.5 text-[0.75rem] leading-4 text-muted-foreground">
                          Your sign-in email. Another Super Admin can change it from the Admins list.
                        </p>
                      </div>
                    </form>
                  </SectionCard>

                  {/* ---------------------------- Access ----------------------------- */}
                  <SectionCard title="Access" aside="set by a Super Admin" bodyClassName="px-5 py-4 divide-y divide-[#e2e8f0] dark:divide-border" {...enter(1)}>
                    <AccessRow title="Role" description={roleDescription}>
                      <RolePill role={admin.role} />
                    </AccessRow>
                    <AccessRow
                      title="Elections you can manage"
                      description={
                        elections.status === "ready" ? (
                          <span className="animate-in fade-in duration-300">{elections.value}</span>
                        ) : elections.status === "loading" ? (
                          <span className="inline-block h-3 w-40 animate-pulse rounded-sm bg-muted align-middle" />
                        ) : (
                          "All elections"
                        )
                      }
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
                    <AccessRow
                      title="Two-step sign-in"
                      description={
                        twoStep.status === "ready" && twoStep.value
                          ? "A code from your authenticator app is asked for when you sign in"
                          : "Ask the system owner to turn on a code from an authenticator app"
                      }
                    >
                      {twoStep.status === "loading" ? (
                        <LoaderCircle aria-label="Checking" className="size-4 animate-spin text-muted-foreground" />
                      ) : twoStep.status === "ready" ? (
                        <span
                          className={cn(
                            pillClassName,
                            "border animate-in fade-in zoom-in-90 duration-300",
                            twoStep.value ? "border-emerald-600/25 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400" : "border-border text-muted-foreground",
                          )}
                        >
                          {twoStep.value ? "On" : "Off"}
                        </span>
                      ) : (
                        <span className="text-[0.75rem] text-muted-foreground">Unavailable</span>
                      )}
                    </AccessRow>
                    <div className="py-3.5 last:pb-0">
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-[0.875rem] leading-5 font-medium text-foreground">Google sign-in</p>
                          <p className="text-[0.78125rem] leading-4.5 text-muted-foreground">Sign in with your Google account instead of a password</p>
                        </div>
                        {googleLinked.status === "ready" && googleLinked.value ? (
                          <span className={cn(pillClassName, "border border-emerald-600/25 bg-emerald-600/10 text-emerald-700 animate-in fade-in zoom-in-90 duration-300 dark:text-emerald-400")}>Linked</span>
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

                  {/* ------------------------ Where you're signed in ------------------------ */}
                  <SectionCard title="Where you're signed in" aside="this browser" bodyClassName="px-5 py-4" {...enter(2)}>
                    <div className="flex items-center gap-3.5">
                      <span className="relative flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-blue/8 text-brand-blue dark:bg-white/8 dark:text-[#7aa7e6]">
                        <Monitor aria-hidden strokeWidth={1.75} className="size-5" />
                        <span aria-hidden className="absolute -top-0.5 -right-0.5 flex size-2.5">
                          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:animate-none" />
                          <span className="relative inline-flex size-2.5 rounded-full border-2 border-card bg-emerald-500" />
                        </span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.875rem] leading-5 font-medium text-foreground">{device}</p>
                        <p className="text-[0.78125rem] leading-4.5 text-muted-foreground">
                          Active now{signInMethod ? ` · signed in with ${SIGN_IN_METHOD_LABELS[signInMethod]}` : ""}
                        </p>
                      </div>
                      <span className={cn(pillClassName, "bg-brand-gold text-brand-navy")}>This device</span>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#e2e8f0] pt-4 dark:border-border">
                      <p className="max-w-md text-[0.78125rem] leading-4.5 text-muted-foreground">Signed in somewhere you don&apos;t recognise? Sign out everywhere else; this device stays signed in.</p>
                      <button
                        type="button"
                        onClick={() => void endOtherSessions()}
                        disabled={othersBusy}
                        className={cn(dialogSecondaryClassName, pressClassName, "inline-flex items-center gap-2")}
                      >
                        {othersBusy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}
                        Sign out other devices
                      </button>
                    </div>
                    <Note note={othersNote} className="mt-2" />
                  </SectionCard>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {/* ------------------------- Change password ------------------------- */}
                  <SectionCard title="Change password" aside={admin.email} bodyClassName="p-0" {...enter(0)}>
                    <form onSubmit={changePassword} noValidate>
                      <div className="flex flex-col gap-4 px-5 pt-5 pb-5">
                        {passwordNote ? <Note note={passwordNote} className={cn("rounded-md px-3 py-2.5 text-[0.8125rem]", passwordNote.tone === "success" ? "bg-emerald-600/8" : "bg-destructive/6")} /> : null}

                        <div>
                          <label htmlFor="profile-current-password" className={labelClassName}>
                            Current password
                            {!currentRequired ? <span className="ml-1.5 font-normal text-muted-foreground">(leave blank if you never set one)</span> : null}
                          </label>
                          <PasswordInput
                            id="profile-current-password"
                            autoComplete="current-password"
                            value={current}
                            onChange={(e) => {
                              setCurrent(e.target.value);
                              setConfirmClose(false);
                              setPasswordNote(null);
                              if (passwordErrors.current) setPasswordErrors((prev) => ({ ...prev, current: undefined }));
                            }}
                            disabled={passwordBusy}
                            aria-invalid={!!passwordErrors.current || undefined}
                            className={fieldClassName}
                          />
                          {passwordErrors.current ? <p className={cn(errorClassName, "animate-in fade-in slide-in-from-top-1 duration-200")}>{passwordErrors.current}</p> : null}
                        </div>
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
                              setPasswordNote(null);
                              if (passwordErrors.password || passwordErrors.confirm) {
                                setPasswordErrors((prev) => ({ current: prev.current, ...validateNewPassword(e.target.value, confirm) }));
                              }
                            }}
                            disabled={passwordBusy}
                            aria-invalid={!!passwordErrors.password || undefined}
                            aria-describedby="profile-password-checklist"
                            className={fieldClassName}
                          />
                          {passwordErrors.password ? <p className={cn(errorClassName, "animate-in fade-in slide-in-from-top-1 duration-200")}>{passwordErrors.password}</p> : null}
                        </div>
                        <div>
                          <label htmlFor="profile-confirm-password" className={labelClassName}>
                            Confirm new password
                          </label>
                          <PasswordInput
                            id="profile-confirm-password"
                            autoComplete="new-password"
                            value={confirm}
                            onChange={(e) => {
                              setConfirm(e.target.value);
                              setConfirmClose(false);
                              setPasswordNote(null);
                              if (passwordErrors.confirm) setPasswordErrors((prev) => ({ ...prev, confirm: validateNewPassword(password, e.target.value).confirm }));
                            }}
                            disabled={passwordBusy}
                            aria-invalid={!!passwordErrors.confirm || undefined}
                            className={fieldClassName}
                          />
                          {passwordErrors.confirm ? <p className={cn(errorClassName, "animate-in fade-in slide-in-from-top-1 duration-200")}>{passwordErrors.confirm}</p> : null}
                        </div>

                        <div id="profile-password-checklist" className="rounded-lg bg-[#f3f6f9] px-4 py-3.5 dark:bg-white/4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-mono text-[0.6875rem] font-medium tracking-widest text-muted-foreground uppercase">Your new password</p>
                            <StrengthBar steps={[lengthMet, numberMet, matchMet, differentMet]} />
                          </div>
                          <ul className="mt-2.5 flex flex-col gap-1.5">
                            <Requirement met={lengthMet}>Has at least {MIN_PASSWORD_LENGTH} characters</Requirement>
                            <Requirement met={numberMet}>Includes a number</Requirement>
                            <Requirement met={matchMet}>Matches the confirmation</Requirement>
                            <Requirement met={differentMet} pending={!current ? "checked when you save" : undefined}>
                              Isn&apos;t your current password
                            </Requirement>
                          </ul>
                        </div>

                        <div className="flex items-center justify-between gap-4 border-t border-[#e2e8f0] pt-4 dark:border-border">
                          <div className="min-w-0">
                            <p id={othersSwitchId} className="text-[0.875rem] leading-5 font-medium text-foreground">
                              Sign out of my other devices
                            </p>
                            <p id={`${othersSwitchId}-hint`} className="text-[0.78125rem] leading-4.5 text-muted-foreground">
                              Recommended if you think someone else knows your password
                            </p>
                          </div>
                          <Switch checked={signOutOthers} onChange={setSignOutOthers} disabled={passwordBusy} labelledBy={othersSwitchId} describedBy={`${othersSwitchId}-hint`} />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 border-t border-[#e2e8f0] px-5 py-4 dark:border-border">
                        <button type="button" onClick={clearPassword} disabled={passwordBusy || !passwordDirty} className={cn(dialogSecondaryClassName, pressClassName)}>
                          Cancel
                        </button>
                        <button type="submit" disabled={passwordBusy} className={cn(dialogPrimaryClassName, pressClassName, "inline-flex min-w-36 items-center justify-center gap-2")}>
                          {passwordBusy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}
                          {passwordBusy ? "Updating…" : "Update password"}
                        </button>
                      </div>
                    </form>
                  </SectionCard>

                  {/* --------------------------- Good to know --------------------------- */}
                  <SectionCard title="Good to know" bodyClassName="px-5 py-4" {...enter(1)}>
                    <ul className="flex flex-col gap-3.5">
                      <Tip icon={KeyRound} title="Forgot your current password?">
                        Log out, then choose &ldquo;Forgot password?&rdquo; on the sign-in page to get a reset link at {admin.email}.
                      </Tip>
                      <Tip icon={ShieldCheck} title="Keep it to yourself">
                        Never share your password. Other admins can manage your access without it, so no one needs to ask for it.
                      </Tip>
                      <Tip icon={UserRoundCog} title="Signing in with Google?">
                        Your Google sign-in keeps working after you change your password here.
                      </Tip>
                    </ul>
                  </SectionCard>
                </div>
              )}
            </div>

            {/* Footer: profile tab only (the password form has its own buttons) */}
            {isProfile ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-popover px-5 py-3.5 sm:px-7">
                <p key={String(nameDirty)} className="flex items-center gap-2 text-[0.78125rem] text-muted-foreground animate-in fade-in duration-300">
                  {nameDirty ? (
                    <>
                      <span aria-hidden className="relative flex size-2">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-gold opacity-70 motion-reduce:animate-none" />
                        <span className="relative inline-flex size-2 rounded-full bg-brand-gold" />
                      </span>
                      <span className="text-foreground">Unsaved changes</span>
                    </>
                  ) : (
                    "Changes apply to your account only."
                  )}
                </p>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={discardName} disabled={!nameDirty || saving} className={cn(dialogSecondaryClassName, pressClassName)}>
                    Discard
                  </button>
                  <button type="submit" form={formId} disabled={!nameDirty || saving} className={cn(dialogPrimaryClassName, pressClassName, "inline-flex min-w-32 items-center justify-center gap-2")}>
                    {saving ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* -------------------------------------------------------------------------- */
/*                               More small parts                             */
/* -------------------------------------------------------------------------- */

/** Pencil badge on the avatar: picks a photo, or (when there is one) offers Change / Remove. */
function PhotoButton({ hasPhoto, disabled, onPick, onRemove }: { hasPhoto: boolean; disabled: boolean; onPick: () => void; onRemove: () => void }) {
  const badgeClassName = cn(
    "absolute -right-0.5 -bottom-0.5 flex size-6 cursor-pointer items-center justify-center rounded-full border-2 border-card bg-card text-foreground shadow-[0_2px_6px_rgb(11_18_32/0.18)] outline-none",
    "transition-[scale,background-color,color] duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-110 hover:bg-brand-navy hover:text-white focus-visible:ring-2 focus-visible:ring-brand-blue/40",
    "disabled:cursor-wait disabled:opacity-60 disabled:hover:scale-100 dark:hover:bg-white dark:hover:text-brand-navy",
  );

  if (!hasPhoto) {
    return (
      <button type="button" onClick={onPick} disabled={disabled} aria-label="Upload photo" title="Upload photo (JPG, PNG or WEBP, up to 5 MB)" className={badgeClassName}>
        <Pencil aria-hidden className="size-3" strokeWidth={2.2} />
      </button>
    );
  }

  return (
    <Menu.Root modal={false}>
      <Menu.Trigger disabled={disabled} aria-label="Change photo" className={badgeClassName}>
        <Pencil aria-hidden className="size-3" strokeWidth={2.2} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="start" sideOffset={6} className="z-60 outline-none">
          <Menu.Popup data-themed className={cn(popupClassName, "w-52 p-1.5")}>
            <Menu.Item onClick={onPick} className={menuItemClassName}>
              <Camera aria-hidden />
              Upload new photo
            </Menu.Item>
            <Menu.Item onClick={onRemove} className={cn(menuItemClassName, "data-highlighted:bg-destructive/8 data-highlighted:text-destructive data-highlighted:[&_svg]:text-destructive")}>
              <Trash2 aria-hidden />
              Remove photo
            </Menu.Item>
            <p className="px-2.5 pt-1.5 pb-1 text-[0.6875rem] leading-4 text-muted-foreground">JPG, PNG or WEBP, up to 5 MB. Applies right away.</p>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** Four segments that fill (and warm from gold to blue) as the checklist is met. */
function StrengthBar({ steps }: { steps: boolean[] }) {
  const done = steps.filter(Boolean).length;
  const color = done === steps.length ? "bg-brand-blue dark:bg-[#7aa7e6]" : done >= 2 ? "bg-brand-gold" : "bg-[#e0a49b]";
  return (
    <div className="flex items-center gap-2" aria-hidden>
      <div className="flex gap-1">
        {steps.map((_, i) => (
          <span key={i} className="relative h-1 w-5 overflow-hidden rounded-full bg-[#dfe5ec] dark:bg-white/10">
            <span
              className={cn("absolute inset-0 origin-left rounded-full transition-[scale,background-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]", color, i < done ? "scale-x-100" : "scale-x-0")}
              style={{ transitionDelay: `${i * 40}ms` }}
            />
          </span>
        ))}
      </div>
      <span className="w-7 text-right font-mono text-[0.65625rem] text-muted-foreground tabular-nums">
        {done}/{steps.length}
      </span>
    </div>
  );
}

function Tip({ icon: Icon, title, children }: { icon: typeof KeyRound; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-blue/8 text-brand-blue dark:bg-white/8 dark:text-[#7aa7e6]">
        <Icon aria-hidden strokeWidth={1.75} className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[0.84375rem] leading-5 font-medium text-foreground">{title}</p>
        <p className="text-[0.78125rem] leading-4.5 text-muted-foreground">{children}</p>
      </div>
    </li>
  );
}
