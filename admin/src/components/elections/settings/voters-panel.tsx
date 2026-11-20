"use client";

import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { Check, ChevronRight, LoaderCircle, RotateCw, UserPlus, Users } from "lucide-react";

import { StatusAction } from "@/components/elections/status-action";
import motion from "@/components/shared/motion.module.css";
import { PageError, SearchInput } from "@/components/shared/page-feedback";
import { AnimatedNumber } from "@/components/students/animated-number";
import { toolbarButtonClassName } from "@/components/students/student-toolbar-styles";
import { formatYear } from "@/lib/students";
import { cn } from "@/lib/utils";
import {
  canAddVoters,
  canSendEmails,
  canToggleVoters,
  eligibleEnrollments,
  emailGroup,
  formatStamp,
  percent,
  rowAction,
  termEnrollments,
} from "@/lib/voters";
import { createVoter, queueVoterEmails, setVoterActive, type VoterRow } from "@/services/voters/voters.service";
import type { Election, VoterEnrollment } from "@/types/election.types";

import { runInBatches, type ElectionVoters } from "./use-election-voters";
import { VoterDrawer } from "./voter-drawer";
import { Avatar, EmailChip, FilterTabs, PAGE_SIZE, Pager, Progress, SectionLabel, TestModeBanner, VoteChip, type FilterTab } from "./voters-ui";

interface VotersPanelProps {
  mode: "voters" | "logins";
  election: Election;
  /** `null` when enrollments couldn't be loaded (no eligible count, nothing to add). */
  enrollments: readonly VoterEnrollment[] | null;
  data: ElectionVoters;
  /** The server said it only pretends to send (dry run). */
  testMode: boolean;
  onTestMode: () => void;
  say: (text: string, tone?: "success" | "error" | "info") => void;
}

const count = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, one: string, many = `${one}s`) => `${count(n)} ${n === 1 ? one : many}`;

/** Settings → Voters and Voter logins: one voter per eligible student, their passcode emails and vote progress. */
export function VotersPanel({ mode, election, enrollments, data, testMode, onTestMode, say }: VotersPanelProps) {
  const { rows, error, loading, refresh, patch } = data;
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ done: number; total: number } | null>(null);

  const eligible = useMemo(() => (enrollments ? eligibleEnrollments(enrollments, election) : null), [enrollments, election]);
  const byStudent = useMemo(() => (enrollments ? termEnrollments(enrollments, election.termId) : new Map<string, VoterEnrollment>()), [enrollments, election.termId]);
  const missing = useMemo(() => {
    if (!eligible || !rows) return [];
    const have = new Set(rows.map((r) => r.studentId));
    return [...eligible.keys()].filter((id) => !have.has(id));
  }, [eligible, rows]);

  const status = election.status;
  const addOpen = canAddVoters(status);
  const emailsOpen = canSendEmails(status);
  const togglesOpen = canToggleVoters(status);

  /* --------------------------------- actions -------------------------------- */

  async function addVoters(studentIds: readonly string[]) {
    setAdding({ done: 0, total: studentIds.length });
    const { failed } = await runInBatches(studentIds, (id) => createVoter(id, election.id), (done) => setAdding({ done, total: studentIds.length }));
    await refresh();
    setAdding(null);
    const added = studentIds.length - failed.length;
    say(failed.length ? `Added ${plural(added, "voter")}. ${count(failed.length)} failed: ${failed[0].message}` : `Added ${plural(added, "voter")}.`, failed.length ? "error" : "success");
  }

  async function send(voterIds: readonly string[] | undefined, resend: boolean) {
    const result = await queueVoterEmails(election.id, voterIds, resend);
    if (result.dryRun) onTestMode();
    await refresh();
    if (result.queued === 0) {
      throw new Error(result.skipped[0]?.reason ?? "Nobody needed an email.");
    }
    const skipped = result.skipped.length ? ` ${count(result.skipped.length)} skipped (${result.skipped[0].reason.replace(/\.$/, "").toLowerCase()}).` : "";
    say(`Queued ${plural(result.queued, "login email")}.${skipped}`);
  }

  async function setActive(voter: VoterRow, active: boolean) {
    await setVoterActive(voter.id, active);
    patch(voter.id, { isActive: active });
    say(`${voter.name ?? voter.studentId} ${active ? "is active again" : "was deactivated"}.`);
  }

  /* ---------------------------------- states -------------------------------- */

  if (rows === null) {
    if (error) return <PageError title="Couldn't load the voters" message={error} onRetry={() => void refresh()} />;
    return (
      <p className="flex items-center justify-center gap-2 py-16 text-[0.875rem] text-muted-foreground">
        <LoaderCircle aria-hidden className="size-4 animate-spin" /> Loading voters…
      </p>
    );
  }

  const open = rows.find((r) => r.id === openId) ?? null;
  const shared = { election, rows, eligible: eligible?.size ?? null, missing, addOpen, emailsOpen, adding, onAdd: addVoters, onSend: send, onOpen: setOpenId, byStudent, loading, refresh };

  return (
    <div className="space-y-6">
      {testMode ? <TestModeBanner /> : null}
      {mode === "voters" ? <VotersView {...shared} /> : <LoginsView {...shared} />}
      <VoterDrawer
        voter={open}
        enrollment={open ? byStudent.get(open.studentId) : undefined}
        election={election}
        emailsOpen={emailsOpen}
        togglesOpen={togglesOpen}
        onClose={() => setOpenId(null)}
        onSend={(voter, resend) => send([voter.id], resend)}
        onSetActive={setActive}
      />
    </div>
  );
}

interface ViewProps {
  election: Election;
  rows: VoterRow[];
  /** Eligible students; `null` when unknown. */
  eligible: number | null;
  /** Eligible students who aren't voters yet. */
  missing: string[];
  addOpen: boolean;
  emailsOpen: boolean;
  adding: { done: number; total: number } | null;
  onAdd: (studentIds: readonly string[]) => Promise<void>;
  onSend: (voterIds: readonly string[] | undefined, resend: boolean) => Promise<void>;
  onOpen: (id: string) => void;
  byStudent: ReadonlyMap<string, VoterEnrollment>;
  loading: boolean;
  refresh: () => Promise<void>;
}

/* -------------------------------------------------------------------------- */
/*                                 Stat cards                                 */
/* -------------------------------------------------------------------------- */

interface Stat {
  label: string;
  value: number;
  /** "of 1,296": shown as "1,284 / 1,296". */
  of?: number;
  detail: string;
  tone?: "blue" | "gold" | "red";
}

function StatCards({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-2 border-y border-[#e2e8f0] lg:grid-cols-4 dark:border-border">
      {stats.map((stat, index) => (
        <div
          key={stat.label}
          style={{ animationDelay: `${index * 70}ms` }}
          className={cn("px-5 py-4.5", index % 2 === 1 && "border-l border-[#e2e8f0] dark:border-border", index > 1 && "border-t lg:border-t-0", index === 2 && "lg:border-l", motion.riseIn)}
        >
          <p className="text-[0.8125rem] text-muted-foreground">{stat.label}</p>
          <p className="mt-1 text-[1.75rem] leading-9 font-medium tracking-tight text-foreground tabular-nums">
            <AnimatedNumber value={stat.value} from={0} duration={900} delay={index * 70} />
            {stat.of !== undefined ? <span className="text-muted-foreground/80"> / {count(stat.of)}</span> : null}
          </p>
          <p className={cn("mt-0.5 truncate text-[0.75rem]", stat.tone === "gold" ? "text-[#b45309] dark:text-brand-gold" : stat.tone === "red" ? "text-destructive" : "text-brand-blue dark:text-[#7aa7e6]")}>{stat.detail}</p>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Add voters                                  */
/* -------------------------------------------------------------------------- */

function AddingProgress({ adding }: { adding: { done: number; total: number } }) {
  return (
    <div aria-live="polite" className="space-y-1.5">
      <p className="flex items-center gap-2 text-[0.8125rem] text-foreground">
        <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
        Adding voters… <span className="tabular-nums">{count(adding.done)} of {count(adding.total)}</span>
      </p>
      <Progress value={percent(adding.done, adding.total)} />
    </div>
  );
}

function AddVotersAction({ missing, onAdd, label }: { missing: string[]; onAdd: ViewProps["onAdd"]; label: string }) {
  return (
    <StatusAction
      label={label}
      icon={<UserPlus aria-hidden className="size-4" />}
      confirmTitle={`Add ${plural(missing.length, "voter")}?`}
      confirmBody="One voter for each eligible student who isn't one yet. Passcodes are made later, when the login emails go out."
      confirmLabel="Add voters"
      onConfirm={() => onAdd(missing)}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Voters                                    */
/* -------------------------------------------------------------------------- */

type VoterFilter = "all" | "empty" | "draft" | "completed" | "inactive";

function VotersView({ rows, eligible, missing, addOpen, adding, onAdd, onOpen, byStudent, loading, refresh }: ViewProps) {
  const [filter, setFilter] = useState<VoterFilter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const deferred = useDeferredValue(query);

  const tally = useMemo(() => {
    const t = { empty: 0, draft: 0, completed: 0, inactive: 0 };
    for (const r of rows) {
      t[r.voteStatus]++;
      if (!r.isActive) t.inactive++;
    }
    return t;
  }, [rows]);

  const shown = useMemo(() => filterRows(rows, deferred, (r) => (filter === "all" ? true : filter === "inactive" ? !r.isActive : r.voteStatus === filter)), [rows, deferred, filter]);

  const tabs: FilterTab<VoterFilter>[] = [
    { value: "all", label: "All", count: rows.length },
    { value: "empty", label: "Not started", count: tally.empty },
    { value: "draft", label: "Draft", count: tally.draft },
    { value: "completed", label: "Voted", count: tally.completed },
    { value: "inactive", label: "Inactive", count: tally.inactive },
  ];

  if (rows.length === 0) return <NoVoters eligible={eligible} missing={missing} addOpen={addOpen} adding={adding} onAdd={onAdd} />;

  return (
    <>
      <section>
        <SectionLabel>Voters</SectionLabel>
        <StatCards
          stats={[
            {
              label: "Voters / eligible students",
              value: rows.length,
              of: eligible ?? undefined,
              detail: eligible === null ? "eligible count unavailable" : missing.length ? `${percent(rows.length, eligible)}% · ${count(missing.length)} not added` : "everyone eligible is a voter",
              tone: missing.length ? "gold" : "blue",
            },
            { label: "Not started", value: tally.empty, detail: `${percent(tally.empty, rows.length)}% · ballot not opened` },
            { label: "Draft", value: tally.draft, detail: `${percent(tally.draft, rows.length)}% · saved, not submitted`, tone: "gold" },
            { label: "Voted", value: tally.completed, detail: `${percent(tally.completed, rows.length)}% turnout` },
          ]}
        />
      </section>

      {missing.length && addOpen ? (
        <div className={cn("flex flex-wrap items-center gap-4 rounded-[0.375rem] border border-[#fcd34d] bg-[#fffbeb] px-4 py-3 dark:border-brand-gold/30 dark:bg-brand-gold/8", motion.riseIn)}>
          <p className="min-w-0 flex-1 text-[0.8125rem] text-[#92400e] dark:text-brand-gold">
            <strong className="font-semibold">{plural(missing.length, "eligible student")} {missing.length === 1 ? "isn't a voter" : "aren't voters"} yet</strong>, e.g. students enrolled after the list
            was made.
          </p>
          <div className="w-full sm:w-56">{adding ? <AddingProgress adding={adding} /> : <AddVotersAction missing={missing} onAdd={onAdd} label={`Add ${plural(missing.length, "voter")}`} />}</div>
        </div>
      ) : null}

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <FilterTabs
            label="Show voters"
            tabs={tabs}
            value={filter}
            onChange={(next) => {
              setFilter(next);
              setPage(0);
            }}
          />
          <Toolbar query={query} onQuery={(q) => {
              setQuery(q);
              setPage(0);
            }} loading={loading} onRefresh={refresh} />
        </div>
        <TableFrame>
          <div className="overflow-x-auto [scrollbar-width:thin]">
          <table className="w-full min-w-180 border-separate border-spacing-0 text-left text-[0.875rem]">
            <TableHead columns={["Voter", "Voter ID", "Program", "Year", "Vote", ""]} />
            <tbody key={`${filter}|${deferred}|${page}`}>
              {shown.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((voter, index) => {
                const e = byStudent.get(voter.studentId);
                return (
                  <ClickRow key={voter.id} index={index} onOpen={() => onOpen(voter.id)} muted={!voter.isActive} label={voter.name ?? voter.studentId}>
                    <VoterCell voter={voter} />
                    <td className={cellClassName}>
                      <span className="font-mono text-[0.8125rem]">{voter.id}</span>
                    </td>
                    <td className={cellClassName}>{e?.programCode ?? "—"}</td>
                    <td className={cellClassName}>{e ? formatYear(e.level) : "—"}</td>
                    <td className={cellClassName}>{voter.isActive ? <VoteChip status={voter.voteStatus} /> : <span className="text-[0.75rem] text-muted-foreground">Inactive</span>}</td>
                    <ChevronCell />
                  </ClickRow>
                );
              })}
            </tbody>
          </table>
          </div>
          {shown.length === 0 ? <EmptyRows /> : null}
          <Pager page={page} total={shown.length} onPage={setPage} noun="voters · click a row to see the full record" />
        </TableFrame>
      </section>
    </>
  );
}

function NoVoters({ eligible, missing, addOpen, adding, onAdd }: Pick<ViewProps, "eligible" | "missing" | "addOpen" | "adding" | "onAdd">) {
  return (
    <div className="flex flex-col items-center rounded-[0.375rem] border border-dashed border-[#d5dbe3] px-6 py-14 text-center dark:border-white/15">
      <span className="flex size-12 items-center justify-center rounded-full bg-brand-blue/8 text-brand-blue animate-in zoom-in-75 duration-500 dark:bg-white/8 dark:text-[#7aa7e6] motion-reduce:animate-none">
        <Users className="size-5" strokeWidth={1.75} />
      </span>
      <p className="mt-4 text-[1rem] font-semibold text-foreground">No voters yet</p>
      <p className="mt-1.5 max-w-md text-[0.875rem] leading-5.5 text-muted-foreground">
        {eligible === null
          ? "The students couldn't be loaded, so the voter list can't be made right now."
          : eligible === 0
            ? "No students match this election's scope in its term. Check the enrollments, or who can vote."
            : `${plural(eligible, "student")} ${eligible === 1 ? "matches" : "match"} this election's scope. Make one voter for each of them; passcodes come later, with the login emails.`}
      </p>
      <div className="mt-5 w-full max-w-xs">
        {adding ? (
          <AddingProgress adding={adding} />
        ) : addOpen && missing.length ? (
          <AddVotersAction missing={missing} onAdd={onAdd} label={`Generate ${plural(missing.length, "voter")}`} />
        ) : !addOpen ? (
          <p className="text-[0.8125rem] text-muted-foreground">Voters can only be added before voting opens.</p>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Voter logins                                */
/* -------------------------------------------------------------------------- */

type LoginFilter = "all" | "sent" | "queued" | "failed" | "not_sent" | "inactive";

function LoginsView({ election, rows, eligible, missing, addOpen, emailsOpen, adding, onAdd, onSend, onOpen, loading, refresh }: ViewProps) {
  const [filter, setFilter] = useState<LoginFilter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const deferred = useDeferredValue(query);

  const groups = useMemo(() => {
    const g = { sent: 0, queued: 0, failed: 0, not_sent: 0, inactive: 0, passcodes: 0 };
    for (const r of rows) {
      g[emailGroup(r.emailStatus)]++;
      if (!r.isActive) g.inactive++;
      if (r.hasPasscode) g.passcodes++;
    }
    return g;
  }, [rows]);

  // Who still needs a first email, and whose email failed (active voters who haven't voted).
  const reachable = rows.filter((r) => r.isActive && r.voteStatus !== "completed");
  const notSent = reachable.filter((r) => emailGroup(r.emailStatus) === "not_sent").map((r) => r.id);
  const failed = reachable.filter((r) => emailGroup(r.emailStatus) === "failed").map((r) => r.id);
  const emailsDone = reachable.length > 0 && notSent.length === 0 && failed.length === 0 && groups.queued === 0;
  const votersDone = rows.length > 0 && missing.length === 0;

  const shown = useMemo(
    () =>
      filterRows(rows, deferred, (r) => {
        if (filter === "all") return true;
        if (filter === "inactive") return !r.isActive;
        return emailGroup(r.emailStatus) === filter;
      }),
    [rows, deferred, filter],
  );

  const tabs: FilterTab<LoginFilter>[] = [
    { value: "all", label: "All", count: rows.length },
    { value: "sent", label: "Sent", count: groups.sent },
    { value: "queued", label: "Queued", count: groups.queued },
    { value: "failed", label: "Failed", count: groups.failed },
    { value: "not_sent", label: "Not sent", count: groups.not_sent },
    { value: "inactive", label: "Inactive", count: groups.inactive },
  ];

  return (
    <>
      <section>
        <SectionLabel>Voter pipeline</SectionLabel>
        <div className="grid grid-cols-1 overflow-hidden rounded-[0.375rem] border border-[#e2e8f0] md:grid-cols-2 dark:border-border">
          <PipelineStep
            index={1}
            state={adding ? "progress" : votersDone ? "done" : "todo"}
            title="Generate voters"
            body="One voter per eligible student. Passcodes are made when the login emails go out."
            progress={{ done: rows.length, total: eligible ?? rows.length, tone: "blue" }}
          >
            {adding ? (
              <AddingProgress adding={adding} />
            ) : missing.length && addOpen ? (
              <AddVotersAction missing={missing} onAdd={onAdd} label={rows.length ? `Add ${plural(missing.length, "missing voter")}` : `Generate ${plural(missing.length, "voter")}`} />
            ) : (
              <Note>{missing.length ? "Voters can only be added before voting opens." : rows.length ? "Every eligible student is a voter." : "No students match this election's scope."}</Note>
            )}
          </PipelineStep>
          <PipelineStep
            index={2}
            state={groups.queued ? "progress" : emailsDone ? "done" : "todo"}
            title="Send voter login emails"
            body="Each voter gets a passcode and a sign-in link at their STI email."
            progress={{ done: groups.sent, total: rows.length, tone: "gold" }}
            className="border-t md:border-t-0 md:border-l"
          >
            {!emailsOpen ? (
              <Note>{election.status === "Draft" ? "Schedule the election first (Manage → Schedule election)." : "Voting has ended, so no more login emails go out."}</Note>
            ) : rows.length === 0 ? (
              <Note>Generate the voters first.</Note>
            ) : (
              <div className="space-y-2">
                {notSent.length ? (
                  <StatusAction
                    label={`Send to ${plural(notSent.length, "voter")}`}
                    confirmTitle={`Send ${plural(notSent.length, "login email")}?`}
                    confirmBody="Each one carries a new passcode. They go out in batches; this page updates as they're sent."
                    confirmLabel="Send emails"
                    onConfirm={() => onSend(notSent, false)}
                  />
                ) : null}
                {failed.length ? (
                  <StatusAction
                    label={`Retry ${plural(failed.length, "failed email")}`}
                    variant="outline"
                    icon={<RotateCw aria-hidden className="size-3.5" />}
                    confirmTitle={`Retry ${plural(failed.length, "email")}?`}
                    confirmBody="Check the students' emails first if they bounced. Each retry carries a new passcode."
                    confirmLabel="Retry"
                    onConfirm={() => onSend(failed, false)}
                  />
                ) : null}
                {!notSent.length && !failed.length ? <Note>{groups.queued ? `${plural(groups.queued, "email")} on the way…` : "Every voter has their login email."}</Note> : null}
              </div>
            )}
          </PipelineStep>
        </div>
      </section>

      <section>
        <SectionLabel>Voter logins</SectionLabel>
        <StatCards
          stats={[
            { label: "Passcodes sent", value: groups.passcodes, of: rows.length, detail: `${percent(groups.passcodes, rows.length)}% of voters · stored hashed` },
            { label: "Emails sent", value: groups.sent, of: rows.length, detail: `${percent(groups.sent, rows.length)}% of voters` },
            { label: "Queued", value: groups.queued, of: rows.length, detail: groups.queued ? "sending in batches" : "nothing waiting", tone: "gold" },
            { label: "Failed", value: groups.failed, of: rows.length, detail: groups.failed ? "bounced or failed · needs a retry" : "none", tone: groups.failed ? "red" : "blue" },
          ]}
        />
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <FilterTabs
            label="Show voter logins"
            tabs={tabs}
            value={filter}
            onChange={(next) => {
              setFilter(next);
              setPage(0);
            }}
          />
          <Toolbar query={query} onQuery={(q) => {
              setQuery(q);
              setPage(0);
            }} loading={loading} onRefresh={refresh} />
        </div>
        <TableFrame>
          <div className="overflow-x-auto [scrollbar-width:thin]">
          <table className="w-full min-w-220 border-separate border-spacing-0 text-left text-[0.875rem]">
            <TableHead columns={["Voter", "Voter ID", "Email", "Passcode", "Login email", "Sent at", "", ""]} />
            <tbody key={`${filter}|${deferred}|${page}`}>
              {shown.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((voter, index) => {
                const action = rowAction(voter, emailsOpen);
                return (
                  <ClickRow key={voter.id} index={index} onOpen={() => onOpen(voter.id)} muted={!voter.isActive} label={voter.name ?? voter.studentId}>
                    <VoterCell voter={voter} />
                    <td className={cellClassName}>
                      <span className="font-mono text-[0.8125rem]">{voter.id}</span>
                    </td>
                    <td className={cn(cellClassName, "max-w-56 truncate text-muted-foreground")}>{voter.email ?? "—"}</td>
                    <td className={cellClassName}>
                      {voter.hasPasscode ? (
                        <>
                          <span className="inline-flex items-center gap-1 text-[0.8125rem] text-foreground">
                            <Check aria-hidden className="size-3.5 text-[#16a34a] dark:text-[#4ade80]" strokeWidth={2.5} /> Sent
                          </span>
                          <span className="block text-[0.6875rem] text-muted-foreground">stored hashed</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className={cellClassName}>{voter.isActive ? <EmailChip status={voter.emailStatus} /> : <span className="text-[0.75rem] text-muted-foreground">Inactive voter</span>}</td>
                    <td className={cn(cellClassName, "text-[0.8125rem] whitespace-nowrap")}>
                      {emailGroup(voter.emailStatus) === "failed" ? <span className="text-destructive">Failed · {formatStamp(voter.failedAt)}</span> : formatStamp(voter.deliveredAt ?? voter.sentAt)}
                    </td>
                    <td className={cellClassName} onClick={(e) => e.stopPropagation()}>
                      {action ? <RowAction action={action} voter={voter} onSend={onSend} onOpen={onOpen} /> : null}
                    </td>
                    <ChevronCell />
                  </ClickRow>
                );
              })}
            </tbody>
          </table>
          </div>
          {shown.length === 0 ? <EmptyRows /> : null}
          <Pager page={page} total={shown.length} onPage={setPage} noun="voter logins" />
        </TableFrame>
      </section>
    </>
  );
}

/** "Send now" / "Retry" act at once; "Resend" (a new passcode) opens the voter to confirm. */
function RowAction({ action, voter, onSend, onOpen }: { action: "send" | "retry" | "resend"; voter: VoterRow; onSend: ViewProps["onSend"]; onOpen: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const label = action === "send" ? "Send now" : action === "retry" ? "Retry" : "Resend";
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        if (action === "resend") return onOpen(voter.id);
        setBusy(true);
        try {
          await onSend([voter.id], false);
        } catch {
          onOpen(voter.id); // the drawer shows why
        } finally {
          setBusy(false);
        }
      }}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm text-[0.8125rem] font-medium whitespace-nowrap text-brand-blue outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand-blue/30 disabled:cursor-wait disabled:opacity-60 dark:text-[#7aa7e6]"
    >
      {busy ? <LoaderCircle aria-hidden className="size-3.5 animate-spin" /> : null}
      {label}
    </button>
  );
}

function PipelineStep({
  index,
  state,
  title,
  body,
  progress,
  children,
  className,
}: {
  index: number;
  state: "done" | "progress" | "todo";
  title: string;
  body: string;
  progress: { done: number; total: number; tone: "blue" | "gold" };
  children: ReactNode;
  className?: string;
}) {
  const pct = percent(progress.done, progress.total);
  return (
    <div className={cn("flex flex-col border-[#e2e8f0] px-5 pt-4.5 pb-5 dark:border-border", className, motion.riseIn)} style={{ animationDelay: `${index * 80}ms` }}>
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={cn(
            "flex size-5.5 items-center justify-center rounded-full font-mono text-[0.6875rem] transition-colors duration-300",
            state === "done" ? "bg-brand-navy text-white dark:bg-white dark:text-brand-navy" : "border border-[#d5dbe3] text-muted-foreground dark:border-border",
          )}
        >
          {state === "done" ? <Check className="size-3.5" strokeWidth={3} /> : index}
        </span>
        <span
          key={state}
          className={cn(
            "inline-flex h-5 items-center gap-1.5 rounded-full px-2 font-mono text-[0.625rem] font-semibold tracking-[0.06em] uppercase animate-in fade-in zoom-in-95 duration-300 motion-reduce:animate-none",
            state === "done" ? "bg-[#22c55e] text-white" : state === "progress" ? "bg-brand-gold text-brand-navy" : "bg-muted text-muted-foreground",
          )}
        >
          {state === "progress" ? <LoaderCircle aria-hidden className="size-3 animate-spin" /> : null}
          {state === "done" ? "Done" : state === "progress" ? "In progress" : "To do"}
        </span>
      </div>
      <p className="mt-2.5 text-[0.9375rem] font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-[0.8125rem] leading-5 text-muted-foreground">{body}</p>
      <div className="mt-3.5 flex items-baseline justify-between text-[0.75rem] text-muted-foreground tabular-nums">
        <span>{pct}%</span>
        <span>
          {count(progress.done)} / {count(progress.total)}
        </span>
      </div>
      <div className="mt-1.5">
        <Progress value={pct} tone={progress.tone} />
      </div>
      <div className="mt-4 max-w-72">{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Table                                    */
/* -------------------------------------------------------------------------- */

const cellClassName = "border-b border-[#e2e8f0] px-3.5 py-3 align-middle text-foreground group-last/row:border-b-0 dark:border-border";

function filterRows(rows: readonly VoterRow[], query: string, keep: (row: VoterRow) => boolean): VoterRow[] {
  const needle = query.trim().toLowerCase();
  return rows.filter(
    (r) => keep(r) && (!needle || [r.name, r.studentId, r.id, r.email].some((field) => field?.toLowerCase().includes(needle))),
  );
}

function Toolbar({ query, onQuery, loading, onRefresh }: { query: string; onQuery: (q: string) => void; loading: boolean; onRefresh: () => Promise<void> }) {
  return (
    <div className="flex items-center gap-2 pb-2.5">
      <SearchInput value={query} onChange={onQuery} placeholder="Search voters" />
      <button
        type="button"
        aria-label="Refresh voters"
        title="Refresh"
        disabled={loading}
        onClick={() => void onRefresh()}
        className={cn(toolbarButtonClassName, "w-8.5 justify-center px-0 disabled:cursor-wait")}
      >
        <RotateCw aria-hidden className={cn("size-4", loading && "animate-spin motion-reduce:animate-none")} strokeWidth={1.75} />
      </button>
    </div>
  );
}

function TableFrame({ children }: { children: ReactNode }) {
  return <div className="mt-1 overflow-hidden rounded-[0.375rem] border border-[#e2e8f0] dark:border-border">{children}</div>;
}

function TableHead({ columns }: { columns: string[] }) {
  return (
    <thead className="font-mono text-[0.6875rem] tracking-[0.06em] text-muted-foreground uppercase">
      <tr>
        {columns.map((column, index) => (
          <th key={`${column}-${index}`} scope="col" className="border-b border-[#e2e8f0] bg-[#f8fafc] px-3.5 py-2.5 font-normal whitespace-nowrap dark:border-border dark:bg-white/3">
            {column}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function ClickRow({ index, onOpen, muted, label, children }: { index: number; onOpen: () => void; muted: boolean; label: string; children: ReactNode }) {
  return (
    <tr
      tabIndex={0}
      aria-label={`Open ${label}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      style={{ animationDelay: `${Math.min(index, 12) * 25}ms` }}
      className={cn(
        "group/row cursor-pointer outline-none transition-colors duration-150 hover:bg-[#f8fafc] focus-visible:bg-brand-blue/5 dark:hover:bg-white/3",
        "animate-in fade-in slide-in-from-bottom-1 duration-300 fill-mode-both motion-reduce:animate-none",
        muted && "opacity-60",
      )}
    >
      {children}
    </tr>
  );
}

function VoterCell({ voter }: { voter: VoterRow }) {
  return (
    <td className={cellClassName}>
      <div className="flex items-center gap-3">
        <Avatar name={voter.name} />
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{voter.name ?? "Unknown student"}</p>
          <p className="font-mono text-[0.6875rem] text-muted-foreground">{voter.studentId}</p>
        </div>
      </div>
    </td>
  );
}

function ChevronCell() {
  return (
    <td className={cn(cellClassName, "w-8 pr-3")}>
      <ChevronRight aria-hidden className="size-4 text-muted-foreground transition-transform duration-200 group-hover/row:translate-x-0.5 group-hover/row:text-foreground" />
    </td>
  );
}

function EmptyRows() {
  return <p className="px-4 py-10 text-center text-[0.875rem] text-muted-foreground">No voters here.</p>;
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-[0.8125rem] leading-5 text-muted-foreground">{children}</p>;
}
