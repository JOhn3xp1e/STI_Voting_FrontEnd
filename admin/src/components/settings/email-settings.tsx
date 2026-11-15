"use client";

import { useRef, useState } from "react";

import styles from "@/components/shared/motion.module.css";
import { fieldClassName } from "@/components/shared/form-styles";
import { Toast, useNotice } from "@/components/shared/page-feedback";
import { cn } from "@/lib/utils";

import {
  SettingsCard,
  SettingsSelectField,
  SettingsTabs,
  SettingsTextField,
  SettingRow,
  Switch,
  labelled,
  rowListClassName,
  settingsLabelClassName,
  settingsPrimaryButtonClassName,
  settingsSecondaryButtonClassName,
} from "./settings-ui";
import { useSettingsDraft } from "./use-settings-draft";

const DEFAULT_BODY = [
  "Hi {{first_name}},",
  "",
  "Your one-time code for {{election}} is {{code}}.",
  "It expires in {{expires_in}} and works once.",
  "",
  "— STI Legazpi SLVP",
].join("\n");

const INITIAL = {
  fromName: "STI Legazpi SLVP",
  fromAddress: "no-reply@legazpi.sti.edu.ph",
  replyTo: "mis@legazpi.sti.edu.ph",
  dailyLimit: 2000,
  subject: "Your SLVP voting code: {{code}}",
  body: DEFAULT_BODY,
  codeExpiry: 10,
  usesPerCode: 1,
  votingOpens: true,
  closingSoon: true,
  resultsPublished: false,
  adminInvite: true,
};

const DAILY_LIMITS = labelled([
  [500, "500"],
  [1000, "1,000"],
  [2000, "2,000"],
  [5000, "5,000"],
] as const);

const CODE_EXPIRY = labelled([
  [5, "5 minutes"],
  [10, "10 minutes"],
  [15, "15 minutes"],
  [30, "30 minutes"],
] as const);

const USES_PER_CODE = labelled([
  [1, "1"],
  [2, "2"],
  [3, "3"],
] as const);

const VARIABLES = ["{{first_name}}", "{{code}}", "{{election}}", "{{expires_in}}"] as const;

const AUTOMATIC_EMAILS = [
  { key: "votingOpens", title: "Voting opens", description: "Sent to every voter when an election starts" },
  { key: "closingSoon", title: "Closing soon", description: "24 hours before voting closes, to voters who haven’t voted" },
  { key: "resultsPublished", title: "Results published", description: "When a Super Admin publishes results" },
  { key: "adminInvite", title: "Admin invite", description: "When someone is added as an election admin" },
] as const;

/** Sample values for the preview. */
function fillSample(text: string, expiry: number) {
  return text
    .replaceAll("{{first_name}}", "Angelina")
    .replaceAll("{{election}}", "CSC Elections 2025–2026")
    .replaceAll("{{code}}", "482 913")
    .replaceAll("{{expires_in}}", `${expiry} minutes`);
}

/** Settings → Email: sender, the OTP email template, automatic emails and a live preview. */
export function EmailSettings() {
  const { draft, update, dirty, discard } = useSettingsDraft(INITIAL);
  const { notice, say } = useNotice();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [testTo, setTestTo] = useState("");

  /** Inserts a variable at the cursor in the body. */
  function insertVariable(variable: string) {
    const field = bodyRef.current;
    const start = field?.selectionStart ?? draft.body.length;
    const end = field?.selectionEnd ?? draft.body.length;
    update("body", draft.body.slice(0, start) + variable + draft.body.slice(end));
    requestAnimationFrame(() => {
      field?.focus();
      field?.setSelectionRange(start + variable.length, start + variable.length);
    });
  }

  const previewLines = fillSample(draft.body, draft.codeExpiry).split("\n");

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
              onClick={() => say("Saving email settings isn't available yet.", "info")}
              className={settingsPrimaryButtonClassName}
            >
              Save email settings
            </button>
          </>
        }
      />

      <div className={cn("mt-5 grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_23.75rem] xl:gap-6", styles.riseIn)}>
        <div className="flex min-w-0 flex-col gap-5">
          <SettingsCard title="Sender" meta="domain verified · SPF · DKIM" bodyClassName="grid grid-cols-1 gap-3.5 py-4.5 sm:grid-cols-2 sm:gap-x-3">
            <SettingsTextField id="email-from-name" label="From name" value={draft.fromName} onChange={(v) => update("fromName", v)} />
            <SettingsTextField id="email-from-address" label="From address" type="email" value={draft.fromAddress} onChange={(v) => update("fromAddress", v)} />
            <SettingsTextField id="email-reply-to" label="Reply-to" type="email" value={draft.replyTo} onChange={(v) => update("replyTo", v)} />
            <SettingsSelectField id="email-daily-limit" label="Daily send limit" value={draft.dailyLimit} options={DAILY_LIMITS} onChange={(v) => update("dailyLimit", v)} />
          </SettingsCard>

          <SettingsCard title="OTP login email" meta="sent from Voters & passcodes" bodyClassName="flex flex-col gap-3.5 py-4.5">
            <SettingsTextField id="email-subject" label="Subject" value={draft.subject} onChange={(v) => update("subject", v)} />
            <div>
              <label htmlFor="email-body" className={cn(settingsLabelClassName, "text-[0.8125rem] font-medium")}>
                Body
              </label>
              <textarea
                id="email-body"
                ref={bodyRef}
                rows={7}
                value={draft.body}
                onChange={(e) => update("body", e.target.value)}
                className={cn(fieldClassName, "h-auto resize-y rounded-lg px-3 py-2.5 text-[0.8125rem] leading-[1.375rem]")}
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Insert</span>
              {VARIABLES.map((variable) => (
                <button
                  key={variable}
                  type="button"
                  onClick={() => insertVariable(variable)}
                  className="cursor-pointer rounded-full border border-border px-2.25 py-1 font-mono text-[0.65625rem] text-foreground outline-none transition-colors hover:border-brand-blue/40 hover:bg-brand-blue/5 focus-visible:ring-2 focus-visible:ring-brand-blue/30"
                >
                  {variable}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <SettingsSelectField id="email-code-expiry" label="Code expires after" value={draft.codeExpiry} options={CODE_EXPIRY} onChange={(v) => update("codeExpiry", v)} />
              <SettingsSelectField id="email-uses" label="Uses per code" value={draft.usesPerCode} options={USES_PER_CODE} onChange={(v) => update("usesPerCode", v)} />
            </div>
          </SettingsCard>

          <SettingsCard title="Automatic emails" bodyClassName={cn(rowListClassName, "py-1")}>
            {AUTOMATIC_EMAILS.map((email) => (
              <SettingRow
                key={email.key}
                labelId={`email-auto-${email.key}`}
                title={email.title}
                description={email.description}
                control={<Switch checked={draft[email.key]} onChange={(v) => update(email.key, v)} labelledBy={`email-auto-${email.key}`} />}
              />
            ))}
          </SettingsCard>
        </div>

        <SettingsCard title="Preview" meta="OTP email" bodyClassName="flex flex-col gap-3.5 py-4.5">
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="border-b border-border px-3.5 py-2.5">
              <p className="truncate font-mono text-[0.65625rem] text-muted-foreground">
                {draft.fromName} &lt;{draft.fromAddress}&gt;
              </p>
              <p className="mt-0.5 truncate text-[0.8125rem] font-medium text-foreground">{fillSample(draft.subject, draft.codeExpiry)}</p>
            </div>
            <div className="flex flex-col gap-2.5 p-3.5 text-[0.8125rem] text-foreground">
              {previewLines.map((line, index) =>
                line.includes("482 913") ? (
                  <PreviewCodeLine key={index} line={line} />
                ) : line.trim() ? (
                  <p key={index} className={cn(/expires/i.test(line) && "text-xs text-muted-foreground")}>
                    {line}
                  </p>
                ) : null,
              )}
            </div>
          </div>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              say("Sending test emails isn't available yet.", "info");
            }}
          >
            <SettingsTextField id="email-test-to" label="Send a test to" type="email" value={testTo} placeholder="admin@legazpi.sti.edu.ph" onChange={setTestTo} className="flex-1" />
            <button type="submit" className={settingsSecondaryButtonClassName}>
              Send test
            </button>
          </form>
        </SettingsCard>
      </div>

      <Toast notice={notice} />
    </div>
  );
}

/** The line with the code: text before it, then the code in a dark tile. */
function PreviewCodeLine({ line }: { line: string }) {
  const [before, after] = line.split("482 913");
  return (
    <>
      {before.trim() ? <p>{before.trim()}</p> : null}
      <p className="w-fit rounded-lg bg-brand-background px-3.5 py-2.5 font-display text-lg font-semibold text-white dark:bg-white dark:text-brand-navy">
        482 913
      </p>
      {after.replace(/^[.\s]+/, "").trim() ? <p>{after.replace(/^[.\s]+/, "").trim()}</p> : null}
    </>
  );
}
