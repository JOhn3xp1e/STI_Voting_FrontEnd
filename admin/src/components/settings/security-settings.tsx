"use client";

import type { ReactNode } from "react";
import { KeyRound } from "lucide-react";

import styles from "@/components/shared/motion.module.css";
import { Toast, useNotice } from "@/components/shared/page-feedback";
import { cn } from "@/lib/utils";

import {
  SettingRow,
  SettingSelect,
  SettingsCard,
  SettingsTabs,
  Switch,
  labelled,
  rowListClassName,
  settingsPrimaryButtonClassName,
  settingsSecondaryButtonClassName,
} from "./settings-ui";
import { useSettingsDraft } from "./use-settings-draft";

const INITIAL = {
  idleTimeout: 30,
  lockAfter: 5,
  twoStepSuperAdmins: true,
  twoStepElectionAdmins: false,
  methodPassword: true,
  methodGoogle: true,
  methodMicrosoft: false,
  minLength: 10,
  reuseBlock: 5,
  inviteExpiry: 7,
  voterDomain: "legazpi.sti.edu.ph",
  blockLoa: true,
  singleSession: true,
};

const IDLE_TIMEOUTS = labelled([
  [15, "15 minutes"],
  [30, "30 minutes"],
  [60, "1 hour"],
  [240, "4 hours"],
] as const);

const LOCK_AFTER = labelled([
  [3, "3 attempts"],
  [5, "5 attempts"],
  [10, "10 attempts"],
] as const);

const MIN_LENGTHS = labelled([
  [8, "8 characters"],
  [10, "10 characters"],
  [12, "12 characters"],
  [14, "14 characters"],
] as const);

const REUSE_BLOCK = labelled([
  [0, "Off"],
  [3, "Last 3"],
  [5, "Last 5"],
  [10, "Last 10"],
] as const);

const INVITE_EXPIRY = labelled([
  [1, "1 day"],
  [3, "3 days"],
  [7, "7 days"],
  [14, "14 days"],
] as const);

const VOTER_DOMAINS = labelled([["legazpi.sti.edu.ph", "@legazpi.sti.edu.ph"]] as const);

type MethodKey = "methodPassword" | "methodGoogle" | "methodMicrosoft";

const METHODS: { key: MethodKey; title: string; description: string; icon: ReactNode }[] = [
  {
    key: "methodPassword",
    title: "Email & password",
    description: "School email and password. Can only be turned off while another method is on.",
    icon: <KeyRound className="size-4 text-brand-navy/70" strokeWidth={1.75} />,
  },
  {
    key: "methodGoogle",
    title: "Google",
    description: "School Google accounts · @legazpi.sti.edu.ph only",
    // eslint-disable-next-line @next/next/no-img-element
    icon: <img src="/images/signin-google.svg" alt="" width={18} height={18} />,
  },
  {
    key: "methodMicrosoft",
    title: "Microsoft",
    description: "School Microsoft 365 accounts · @legazpi.sti.edu.ph only",
    // eslint-disable-next-line @next/next/no-img-element
    icon: <img src="/images/signin-microsoft.svg" alt="" width={16} height={16} />,
  },
];

/** Settings → Security: admin sign-in, sign-in methods, password rules and voter access. */
export function SecuritySettings() {
  const { draft, update, dirty, discard } = useSettingsDraft(INITIAL);
  const { notice, say } = useNotice();

  const methodsOn = METHODS.filter((m) => draft[m.key]).length;

  return (
    <div className="px-4 pt-2 pb-28 sm:px-6 lg:px-8">
      <SettingsTabs
        actions={
          <>
            <button type="button" onClick={discard} disabled={!dirty} className={settingsSecondaryButtonClassName}>
              Discard
            </button>
            <button
              type="button"
              onClick={() => say("Saving security settings isn't available yet.", "info")}
              className={settingsPrimaryButtonClassName}
            >
              Save security settings
            </button>
          </>
        }
      />

      <div className={cn("mt-5 grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_23.75rem] xl:gap-6", styles.riseIn)}>
        <div className="flex min-w-0 flex-col gap-5">
          <SettingsCard title="Admin sign-in" meta="Super Admins & Election Admins" bodyClassName={rowListClassName}>
            <SettingRow
              title="Sign out after inactivity"
              description="Admins are signed out when idle"
              control={<SettingSelect label="Sign out after inactivity" value={draft.idleTimeout} options={IDLE_TIMEOUTS} onChange={(v) => update("idleTimeout", v)} />}
            />
            <SettingRow
              title="Lock account after failed attempts"
              description="Locked for 15 minutes, or until a Super Admin unlocks it"
              control={<SettingSelect label="Lock account after failed attempts" value={draft.lockAfter} options={LOCK_AFTER} onChange={(v) => update("lockAfter", v)} />}
            />
            <SettingRow
              labelId="security-2fa-super"
              title="Two-step sign-in for Super Admins"
              description="Email code on every new device"
              control={<Switch checked={draft.twoStepSuperAdmins} onChange={(v) => update("twoStepSuperAdmins", v)} labelledBy="security-2fa-super" />}
            />
            <SettingRow
              labelId="security-2fa-election"
              title="Two-step sign-in for Election Admins"
              description="Recommended for student admins"
              control={<Switch checked={draft.twoStepElectionAdmins} onChange={(v) => update("twoStepElectionAdmins", v)} labelledBy="security-2fa-election" />}
            />
          </SettingsCard>

          <SettingsCard title="Sign-in methods" meta="admin login page" bodyClassName="py-1.5">
            <div className={rowListClassName}>
              {METHODS.map((method) => {
                const on = draft[method.key];
                // At least one method has to stay on.
                const isLast = on && methodsOn === 1;
                return (
                  <SettingRow
                    key={method.key}
                    labelId={`security-${method.key}`}
                    icon={method.icon}
                    title={method.title}
                    description={method.description}
                    control={
                      <Switch
                        checked={on}
                        disabled={isLast}
                        onChange={(v) => update(method.key, v)}
                        labelledBy={`security-${method.key}`}
                      />
                    }
                  />
                );
              })}
            </div>
            <p className="pt-2.5 pb-3.5 text-xs text-muted-foreground">
              At least one method has to stay on. Changes apply the next time someone signs in.
            </p>
          </SettingsCard>

          <SettingsCard title="Passwords & links" bodyClassName={rowListClassName}>
            <SettingRow
              title="Minimum length"
              description="Must also include a number"
              control={<SettingSelect label="Minimum length" value={draft.minLength} options={MIN_LENGTHS} onChange={(v) => update("minLength", v)} />}
            />
            <SettingRow
              title="Block reuse of recent passwords"
              control={<SettingSelect label="Block reuse of recent passwords" value={draft.reuseBlock} options={REUSE_BLOCK} onChange={(v) => update("reuseBlock", v)} />}
            />
            <SettingRow
              title="Admin invite links expire after"
              description="Each link works once"
              control={<SettingSelect label="Admin invite links expire after" value={draft.inviteExpiry} options={INVITE_EXPIRY} onChange={(v) => update("inviteExpiry", v)} />}
            />
          </SettingsCard>
        </div>

        <SettingsCard title="Voter access" meta="applies to every election" bodyClassName={rowListClassName}>
          <SettingRow
            title="Allowed email domain"
            description="Voter codes are only sent to this domain"
            control={<SettingSelect label="Allowed email domain" value={draft.voterDomain} options={VOTER_DOMAINS} onChange={(v) => update("voterDomain", v)} />}
          />
          <SettingRow
            labelId="security-block-loa"
            title="Block students on leave (LOA)"
            description="They stay on the list but can’t sign in to vote"
            control={<Switch checked={draft.blockLoa} onChange={(v) => update("blockLoa", v)} labelledBy="security-block-loa" />}
          />
          <SettingRow
            labelId="security-single-session"
            title="One voting session at a time"
            description="Signing in on a second device ends the first"
            control={<Switch checked={draft.singleSession} onChange={(v) => update("singleSession", v)} labelledBy="security-single-session" />}
          />
        </SettingsCard>
      </div>

      <Toast notice={notice} />
    </div>
  );
}
