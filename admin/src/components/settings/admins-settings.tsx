"use client";

import { useEffect, useState } from "react";

import { useAdminSession } from "@/components/auth/admin-session";
import { AdminAvatar } from "@/components/dashboard/admin-avatar";
import styles from "@/components/shared/motion.module.css";
import { PageError, PageLoading, Toast, useNotice } from "@/components/shared/page-feedback";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/services/api/error-message";
import {
  fetchAdminAccounts,
  getAdminStatus,
  getInviteErrorMessage,
  isAlreadyAccepted,
  resendAdminInvite,
} from "@/services/admins/admin-accounts.service";
import { getCurrentSignInMethod, type SignInMethod } from "@/services/auth/admin-auth.service";
import type { AdminAccount } from "@/types/auth.types";

import { InviteAdminDialog } from "./invite-admin-dialog";
import { SettingsCard, SettingsTabs, rowListClassName, settingsPrimaryButtonClassName } from "./settings-ui";

type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; admins: AdminAccount[] };

const ROLES = [
  { title: "Super Admin", description: "Everything: terms, programs, students, every election and these settings." },
  { title: "Election Admin", description: "Only the elections they’re assigned to: positions, candidates, voters and results." },
] as const;

/** Settings → Admins: super admins, pending invitations and the invite dialog. */
export function AdminsSettings() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [inviteOpen, setInviteOpen] = useState(false);
  const { notice, say } = useNotice();

  useEffect(() => {
    const controller = new AbortController();
    fetchAdminAccounts({ signal: controller.signal })
      .then((admins) => setState({ status: "ready", admins }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ status: "error", message: getApiErrorMessage(error) });
      });
    return () => controller.abort();
  }, [attempt]);

  const reload = () => setAttempt((n) => n + 1);

  return (
    <div className="px-4 pt-2 pb-28 sm:px-6 lg:px-8">
      <SettingsTabs
        actions={
          <button type="button" onClick={() => setInviteOpen(true)} className={settingsPrimaryButtonClassName}>
            + Invite admin
          </button>
        }
      />

      {state.status === "loading" ? (
        <PageLoading label="Loading admins…" />
      ) : state.status === "error" ? (
        <PageError
          title="Couldn't load the admins"
          message={state.message}
          onRetry={() => {
            setState({ status: "loading" });
            reload();
          }}
        />
      ) : (
        <AdminsWorkspace
          admins={state.admins}
          setAdmins={(update) => setState((s) => (s.status === "ready" ? { ...s, admins: update(s.admins) } : s))}
          onStale={reload}
          say={say}
        />
      )}

      <InviteAdminDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={(admin) => {
          setState((s) => (s.status === "ready" ? { ...s, admins: [...s.admins.filter((a) => a.id !== admin.id), admin] } : s));
          say(`Invitation sent to ${admin.email}`);
        }}
      />

      <Toast notice={notice} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Workspace                                 */
/* -------------------------------------------------------------------------- */

interface WorkspaceProps {
  admins: AdminAccount[];
  setAdmins: (update: (admins: AdminAccount[]) => AdminAccount[]) => void;
  /** The list is out of date (e.g. an invite was accepted meanwhile): load it again. */
  onStale: () => void;
  say: ReturnType<typeof useNotice>["say"];
}

function AdminsWorkspace({ admins, setAdmins, onStale, say }: WorkspaceProps) {
  const { me } = useAdminSession();
  const myId = me.admin?.id ?? null;
  const [resending, setResending] = useState<string | null>(null);
  // Only known for your own login (from the session); the backend doesn't say how others sign in.
  const [myMethod, setMyMethod] = useState<SignInMethod | null>(null);

  useEffect(() => {
    let live = true;
    void getCurrentSignInMethod().then((method) => {
      if (live) setMyMethod(method);
    });
    return () => {
      live = false;
    };
  }, []);

  const members = admins
    .filter((a) => getAdminStatus(a) !== "pending")
    // You first, then active before deactivated, then by name.
    .sort((a, b) => Number(b.id === myId) - Number(a.id === myId) || Number(b.isActive) - Number(a.isActive) || displayName(a).localeCompare(displayName(b)));
  const pending = admins
    .filter((a) => getAdminStatus(a) === "pending")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  async function resend(admin: AdminAccount) {
    if (resending) return;
    setResending(admin.id);
    try {
      const { message, admin: updated } = await resendAdminInvite(admin.id);
      setAdmins((list) => list.map((a) => (a.id === updated.id ? updated : a)));
      say(message || `Invitation sent to ${admin.email}`);
    } catch (error) {
      if (isAlreadyAccepted(error)) {
        say(`${admin.email} has already accepted the invitation.`, "info");
        onStale();
      } else {
        say(getInviteErrorMessage(error), "error");
      }
    } finally {
      setResending(null);
    }
  }

  const notYet = (what: string) => say(`${what} isn't available yet.`, "info");

  return (
    <div className={cn("mt-5 grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_17.4375rem] xl:gap-6", styles.riseIn)}>
      <div className="flex min-w-0 flex-col gap-5">
        <SettingsCard title="Admins" bodyClassName="px-5 pt-1.5 pb-4">
          {members.length === 0 ? (
            <p className="py-6 text-center text-[0.8125rem] text-muted-foreground">No admins yet.</p>
          ) : (
            <ul className={rowListClassName}>
              {members.map((admin) => (
                <AdminRow
                  key={admin.id}
                  admin={admin}
                  isYou={admin.id === myId}
                  method={admin.id === myId ? myMethod : null}
                  onEdit={() => notYet("Editing admins")}
                />
              ))}
            </ul>
          )}
        </SettingsCard>

        <SettingsCard
          title="Pending invites"
          meta={pending.length > 0 ? `${pending.length} waiting` : undefined}
          bodyClassName="px-5 pt-1.5 pb-4"
        >
          {pending.length === 0 ? (
            <p className="py-6 text-center text-[0.8125rem] text-muted-foreground">
              No pending invites. Use <span className="font-medium text-foreground">+ Invite admin</span> to add someone.
            </p>
          ) : (
            <ul className={rowListClassName}>
              {pending.map((admin) => (
                <InviteRow
                  key={admin.id}
                  admin={admin}
                  resending={resending === admin.id}
                  disabled={resending !== null}
                  onResend={() => void resend(admin)}
                  onRevoke={() => notYet("Revoking invites")}
                />
              ))}
            </ul>
          )}
        </SettingsCard>
      </div>

      <SettingsCard title="Roles" meta="who can do what" className="xl:w-66" bodyClassName={cn(rowListClassName, "pt-1.5 pb-4")}>
        {ROLES.map((role) => (
          <div key={role.title} className="py-3">
            <p className="text-[0.8125rem] font-medium text-foreground">{role.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{role.description}</p>
          </div>
        ))}
      </SettingsCard>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    Rows                                    */
/* -------------------------------------------------------------------------- */

function displayName(admin: AdminAccount): string {
  return admin.fullName?.trim() || admin.email.split("@")[0] || admin.email;
}

const pillClassName = "inline-flex w-26 shrink-0 items-center justify-center rounded px-2 py-0.75 font-mono text-[0.625rem] font-medium tracking-[0.04em] whitespace-nowrap";

const textButtonClassName =
  "cursor-pointer rounded-sm text-[0.8125rem] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-blue/30 disabled:cursor-not-allowed disabled:opacity-50";

const SIGN_IN_METHODS: Record<SignInMethod, { label: string; src?: string; size: number }> = {
  password: { label: "Signs in with email & password", size: 12 },
  google: { label: "Signs in with Google", src: "/images/signin-google.svg", size: 14 },
  microsoft: { label: "Signs in with Microsoft", src: "/images/signin-microsoft.svg", size: 12 },
};

/** How the admin signed in, in a 14px slot after the verified badge (lock, Google or Microsoft). */
function SignInMethodIcon({ method }: { method: SignInMethod }) {
  const { label, src, size } = SIGN_IN_METHODS[method];
  return (
    <span title={label} className="inline-flex size-3.5 shrink-0 items-center justify-center">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={label} width={size} height={size} />
      ) : (
        <svg role="img" aria-label={label} width={size} height={size} viewBox="0 0 12 12" fill="none" className="text-[#64748b] dark:text-muted-foreground">
          <path d="M9 5H3a1.5 1.5 0 0 0-1.5 1.5V10A1.5 1.5 0 0 0 3 11.5h6a1.5 1.5 0 0 0 1.5-1.5V6.5A1.5 1.5 0 0 0 9 5Z" fill="currentColor" />
          <path d="M3.5 5V3.5a2.5 2.5 0 0 1 5 0V5" stroke="currentColor" strokeWidth={1.4} />
        </svg>
      )}
    </span>
  );
}

function AdminRow({
  admin,
  isYou,
  method,
  onEdit,
}: {
  admin: AdminAccount;
  isYou: boolean;
  method: SignInMethod | null;
  onEdit: () => void;
}) {
  const name = displayName(admin);
  const deactivated = !admin.isActive;
  return (
    <li className={cn("flex flex-wrap items-center gap-3 py-3 sm:flex-nowrap", deactivated && "opacity-70")}>
      <AdminAvatar name={name} src={admin.avatarUrl} tone="gold" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[0.8125rem] font-medium text-foreground">
          <span className="truncate">{name}</span>
          {admin.isVerified && !deactivated ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/images/verified-badge.svg" alt="Verified" title="Verified" width={14} height={14} className="shrink-0" />
          ) : null}
          {method ? <SignInMethodIcon method={method} /> : null}
        </p>
        <p className="truncate text-xs text-muted-foreground">{admin.email}</p>
      </div>
      <p className="hidden w-40 shrink-0 text-xs text-muted-foreground md:block">All elections</p>
      {deactivated ? (
        <span className={cn(pillClassName, "bg-muted text-muted-foreground")}>DEACTIVATED</span>
      ) : (
        <span className={cn(pillClassName, "bg-brand-gold text-brand-navy/70")}>SUPER ADMIN</span>
      )}
      <span className="w-8 shrink-0 text-right">
        {isYou ? (
          <span className="text-[0.8125rem] font-medium text-muted-foreground">You</span>
        ) : (
          <button type="button" onClick={onEdit} aria-label={`Edit ${name}`} className={cn(textButtonClassName, "text-brand-blue dark:text-[#7aa7e6]")}>
            Edit
          </button>
        )}
      </span>
    </li>
  );
}

function formatSentDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

function InviteRow({
  admin,
  resending,
  disabled,
  onResend,
  onRevoke,
}: {
  admin: AdminAccount;
  resending: boolean;
  disabled: boolean;
  onResend: () => void;
  onRevoke: () => void;
}) {
  const sent = formatSentDate(admin.updatedAt || admin.createdAt);
  const details = [admin.fullName?.trim(), "Super Admin", sent && `sent ${sent}`].filter(Boolean).join(" · ");
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 sm:flex-nowrap">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.8125rem] font-medium text-foreground">{admin.email}</p>
        <p className="truncate text-xs text-muted-foreground">{details}</p>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1 rounded bg-[#fff2d6] px-2 py-0.75 font-mono text-[0.625rem] font-medium text-[#b27305] dark:bg-[#b27305]/20 dark:text-[#f5c46a]">
        <span aria-hidden className="size-1.5 rounded-full bg-current" />
        PENDING
      </span>
      <button
        type="button"
        onClick={onResend}
        disabled={disabled}
        aria-label={`Resend invitation to ${admin.email}`}
        className={cn(textButtonClassName, "text-brand-blue dark:text-[#7aa7e6]", resending && "disabled:opacity-100")}
      >
        {resending ? "Sending…" : "Resend"}
      </button>
      <button
        type="button"
        onClick={onRevoke}
        disabled={disabled}
        aria-label={`Revoke invitation to ${admin.email}`}
        className={cn(textButtonClassName, "text-[#cc2929] dark:text-[#f07575]")}
      >
        Revoke
      </button>
    </li>
  );
}
