"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { KeyRound, LoaderCircle, X } from "lucide-react";

import { StatusAction } from "@/components/elections/status-action";
import { EMAIL_LABEL, emailGroup, formatStampLong } from "@/lib/voters";
import { formatYear } from "@/lib/students";
import { cn } from "@/lib/utils";
import { fetchVoterEmailHistory, type VoterEmailEntry, type VoterRow } from "@/services/voters/voters.service";
import type { VoterEnrollment } from "@/types/election.types";

import { ActiveChip, Avatar, EmailChip, VoteChip } from "./voters-ui";

interface VoterDrawerProps {
  voter: VoterRow | null;
  enrollment: VoterEnrollment | undefined;
  election: { id: string; title: string };
  /** Login emails can go out (the election is scheduled or open). */
  emailsOpen: boolean;
  /** Voters can be turned off and on (voting hasn't ended). */
  togglesOpen: boolean;
  onClose: () => void;
  /** Sends a login email; `resend` gives the voter a new passcode. Rejects with the reason. */
  onSend: (voter: VoterRow, resend: boolean) => Promise<void>;
  onSetActive: (voter: VoterRow, active: boolean) => Promise<void>;
}

/** Side sheet with one voter's record, login and timeline. Never shows a passcode (only the server has its hash). */
export function VoterDrawer({ voter, enrollment, election, emailsOpen, togglesOpen, onClose, onSend, onSetActive }: VoterDrawerProps) {
  // Keep the last voter while the sheet slides out.
  const [shown, setShown] = useState<VoterRow | null>(voter);
  if (voter && voter !== shown) setShown(voter);
  const v = voter ?? shown;

  return (
    <Dialog.Root open={voter !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop
          data-themed
          className="fixed inset-0 z-50 bg-brand-background/40 backdrop-blur-[1.5px] transition-opacity duration-300 data-ending-style:opacity-0 data-starting-style:opacity-0"
        />
        <Dialog.Popup
          data-themed
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-[min(30rem,100vw)] flex-col border-l border-border bg-popover text-popover-foreground shadow-[-24px_0_60px_-30px_rgb(11_18_32/0.5)] outline-none",
            "transition-[translate,opacity] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] data-ending-style:translate-x-full data-starting-style:translate-x-full data-ending-style:duration-250",
            "motion-reduce:transition-opacity motion-reduce:data-ending-style:translate-x-0 motion-reduce:data-starting-style:translate-x-0 motion-reduce:data-ending-style:opacity-0 motion-reduce:data-starting-style:opacity-0",
          )}
        >
          {v ? (
            <DrawerBody
              key={v.id}
              voter={v}
              enrollment={enrollment}
              election={election}
              emailsOpen={emailsOpen}
              togglesOpen={togglesOpen}
              onSend={onSend}
              onSetActive={onSetActive}
            />
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <dt className="text-[0.8125rem] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right text-[0.8125rem] text-foreground">{children}</dd>
    </div>
  );
}

function Section({ title, children, index }: { title: string; children: ReactNode; index: number }) {
  return (
    <section
      style={{ animationDelay: `${80 + index * 70}ms` }}
      className="overflow-hidden rounded-[0.375rem] border border-[#e2e8f0] animate-in fade-in slide-in-from-right-2 duration-400 fill-mode-both dark:border-border motion-reduce:animate-none"
    >
      <h3 className="border-b border-[#e2e8f0] px-4 py-2 font-mono text-[0.625rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase dark:border-border">{title}</h3>
      {children}
    </section>
  );
}

function DrawerBody({ voter, enrollment, election, emailsOpen, togglesOpen, onSend, onSetActive }: Omit<VoterDrawerProps, "voter" | "onClose"> & { voter: VoterRow }) {
  const [history, setHistory] = useState<VoterEmailEntry[] | null>(null);
  const voted = voter.voteStatus === "completed";
  const group = emailGroup(voter.emailStatus);
  const program = enrollment ? [enrollment.programCode, formatYear(enrollment.level)].filter(Boolean).join(" · ") : null;

  useEffect(() => {
    const controller = new AbortController();
    fetchVoterEmailHistory(voter.id, { signal: controller.signal })
      .then((list) => {
        if (!controller.signal.aborted) setHistory(list);
      })
      .catch(() => {
        if (!controller.signal.aborted) setHistory([]);
      });
    return () => controller.abort();
  }, [voter.id, voter.emailStatus]);

  const sendBlocked = !emailsOpen
    ? "Login emails go out once the election is scheduled."
    : !voter.isActive
      ? "Reactivate the voter to send a login email."
      : voted
        ? "Already voted."
        : group === "queued"
          ? "An email is already on its way."
          : !voter.email
            ? "The student has no email."
            : null;

  return (
    <>
      <header className="flex items-start gap-3.5 border-b border-border px-5 pt-5 pb-4">
        <Avatar name={voter.name} className="size-11 text-[0.8125rem]" />
        <div className="min-w-0 flex-1">
          <Dialog.Title className="truncate text-[1.0625rem] font-semibold text-foreground">{voter.name ?? voter.studentId}</Dialog.Title>
          <Dialog.Description className="mt-0.5 truncate font-mono text-[0.6875rem] text-muted-foreground">
            {[voter.studentId, program, voter.email].filter(Boolean).join(" · ")}
          </Dialog.Description>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <EmailChip status={voter.emailStatus} />
            <ActiveChip active={voter.isActive} />
          </div>
        </div>
        <Dialog.Close
          aria-label="Close"
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border text-foreground outline-none transition-[background-color,rotate] duration-200 hover:rotate-90 hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand-blue/30 motion-reduce:hover:rotate-0"
        >
          <X aria-hidden className="size-4" />
        </Dialog.Close>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 [scrollbar-width:thin]">
        <Section title="Voter record" index={0}>
          <dl className="divide-y divide-[#e2e8f0] dark:divide-border">
            <Row label="Voter ID">
              <span className="font-mono">{voter.id}</span>
            </Row>
            <Row label="Student ID">
              <span className="font-mono">{voter.studentId}</span>
            </Row>
            <Row label="Election">
              <span className="font-mono">{election.id}</span> <span className="text-muted-foreground">{election.title}</span>
            </Row>
            <Row label="Vote">
              <VoteChip status={voter.voteStatus} />
            </Row>
            <Row label="Active">
              <ActiveChip active={voter.isActive} />
            </Row>
          </dl>
        </Section>

        <Section title="Login" index={1}>
          <div className="flex items-start gap-3 px-4 py-3">
            <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full", voter.hasPasscode ? "bg-[#ecfdf3] text-[#16a34a] dark:bg-[#22c55e]/15 dark:text-[#4ade80]" : "bg-muted text-muted-foreground")}>
              <KeyRound aria-hidden className="size-3.5" />
            </span>
            <div className="min-w-0 text-[0.8125rem] leading-5">
              <p className="font-medium text-foreground">{voter.hasPasscode ? "Passcode sent" : "No passcode yet"}</p>
              <p className="text-muted-foreground">
                Passcodes are made when the login email is sent and kept only as a salted hash, so nobody can read them here. Sending a new one replaces the old passcode.
              </p>
            </div>
          </div>
          <div className="space-y-2 border-t border-[#e2e8f0] px-4 py-3 dark:border-border">
            {group === "sent" ? (
              <StatusAction
                label="Send a new passcode"
                variant="outline"
                disabled={!!sendBlocked}
                confirmTitle="Send a new passcode?"
                confirmBody="The voter gets a new login email. Their current passcode stops working."
                confirmLabel="Send new passcode"
                onConfirm={() => onSend(voter, true)}
              />
            ) : (
              <StatusAction
                label={group === "failed" ? "Try the login email again" : "Send login email"}
                variant="outline"
                disabled={!!sendBlocked}
                confirmTitle={group === "failed" ? "Try again?" : "Send the login email?"}
                confirmBody={`It goes to ${voter.email ?? "the student's email"} with a new passcode.`}
                confirmLabel="Send"
                onConfirm={() => onSend(voter, false)}
              />
            )}
            {sendBlocked ? <p className="text-[0.75rem] text-muted-foreground">{sendBlocked}</p> : null}
            {voter.lastError && group === "failed" ? <p className="text-[0.75rem] text-destructive">Last error: {voter.lastError}</p> : null}
          </div>
        </Section>

        <Section title="Timeline" index={2}>
          <dl className="divide-y divide-[#e2e8f0] dark:divide-border">
            <Row label="Added as voter">{formatStampLong(voter.createdAt)}</Row>
            <Row label="Login email">
              {voter.emailStatus === "not_sent"
                ? "— not sent yet"
                : `${EMAIL_LABEL[voter.emailStatus]} · ${formatStampLong(voter.deliveredAt ?? voter.sentAt ?? voter.failedAt ?? voter.queuedAt)}`}
            </Row>
            <Row label="Voted">{voter.votedAt ? formatStampLong(voter.votedAt) : "— not yet"}</Row>
          </dl>
          <div className="border-t border-[#e2e8f0] px-4 py-3 dark:border-border">
            <p className="mb-1.5 font-mono text-[0.625rem] tracking-[0.1em] text-muted-foreground uppercase">Email history</p>
            {history === null ? (
              <p className="flex items-center gap-2 text-[0.75rem] text-muted-foreground">
                <LoaderCircle aria-hidden className="size-3.5 animate-spin" /> Loading…
              </p>
            ) : history.length === 0 ? (
              <p className="text-[0.75rem] text-muted-foreground">No emails yet.</p>
            ) : (
              <ul className="space-y-1">
                {history.slice(0, 6).map((entry, index) => (
                  <li key={entry.id} style={{ animationDelay: `${index * 50}ms` }} className="flex items-center justify-between gap-3 text-[0.75rem] animate-in fade-in duration-300 fill-mode-both motion-reduce:animate-none">
                    <span className="text-muted-foreground">{formatStampLong(entry.queuedAt)}</span>
                    <span className="text-foreground">
                      {EMAIL_LABEL[entry.status]}
                      {entry.attempts > 1 ? <span className="text-muted-foreground"> · {entry.attempts} tries</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>
      </div>

      {togglesOpen && !voted ? (
        <footer className="border-t border-border px-5 py-3.5">
          {voter.isActive ? (
            <StatusAction
              label="Deactivate voter"
              variant="danger"
              confirmTitle="Deactivate this voter?"
              confirmBody="They can't sign in or vote, and no login emails go to them. You can reactivate them later."
              confirmLabel="Deactivate"
              onConfirm={() => onSetActive(voter, false)}
            />
          ) : (
            <StatusAction
              label="Reactivate voter"
              variant="outline"
              confirmTitle="Reactivate this voter?"
              confirmBody="They can sign in and vote again with their passcode."
              confirmLabel="Reactivate"
              onConfirm={() => onSetActive(voter, true)}
            />
          )}
        </footer>
      ) : null}
    </>
  );
}
