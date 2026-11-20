"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, KeyRound, LoaderCircle, Lock, Mail, SearchX, Users } from "lucide-react";

import { usePageCrumb } from "@/components/dashboard/page-description";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { labelClassName } from "@/components/shared/form-styles";
import motion from "@/components/shared/motion.module.css";
import { PageError, Toast, useNotice } from "@/components/shared/page-feedback";
import { PageSkeleton } from "@/components/shared/skeleton";
import { UnderlineTabs } from "@/components/shared/underline-tabs";
import { AnimatedNumber } from "@/components/students/animated-number";
import { toolbarButtonClassName } from "@/components/students/student-toolbar-styles";
import { termOptionLabel } from "@/components/elections/create/create-election-steps";
import { CareerBadge, DateTimePicker, SectionCard, careerStyle, ctaButtonClassName, outlineButtonClassName } from "@/components/elections/create/create-election-ui";
import { useElectionsNav } from "@/components/elections/elections-nav";
import { StatusAction } from "@/components/elections/status-action";
import { todayIso } from "@/lib/dates";
import {
  electionEditHref,
  electionToForm,
  formatDay,
  formatDayTime,
  formatLevelScope,
  instantToLocal,
  levelPicks,
  localToInstant,
  programPicks,
  programsByCareer,
  voterPool,
  careerLevels,
  type LocalDateTime,
} from "@/lib/elections";
import { careerColor, sortCareers } from "@/lib/programs";
import { cn } from "@/lib/utils";
import { isApiError } from "@/services/api/client";
import { getApiErrorMessage } from "@/services/api/error-message";
import { deleteElection, fetchElection, fetchVoterEnrollments, setElectionStatus, updateElection } from "@/services/elections/elections.service";
import { fetchCareers } from "@/services/programs/programs.service";
import { fetchTerms } from "@/services/terms/terms.service";
import type { Election, ElectionInput, ElectionStatus, VoterEnrollment } from "@/types/election.types";
import type { Career } from "@/types/program.types";
import type { Term } from "@/types/term.types";

/* -------------------------------------------------------------------------- */
/*                                   Loading                                  */
/* -------------------------------------------------------------------------- */

interface Loaded {
  election: Election;
  terms: Term[];
  careers: Career[];
  /** For the eligible-voter count; `null` when they couldn't be loaded. */
  enrollments: VoterEnrollment[] | null;
}

type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "not-found" } | ({ status: "ready" } & Loaded);

/** `/elections/[id]/settings`: Voters, Voter logins and Election details tabs. */
export function ElectionSettingsPage({ electionId }: { electionId: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([
      fetchElection(electionId, { signal }),
      fetchTerms({ signal }),
      fetchCareers({ signal }),
      fetchVoterEnrollments({ signal }).catch(() => null),
    ])
      .then(([election, terms, careers, enrollments]) => setState({ status: "ready", election, terms, careers: sortCareers(careers), enrollments }))
      .catch((error: unknown) => {
        if (signal.aborted) return;
        if (isApiError(error) && error.isNotFound) setState({ status: "not-found" });
        else setState({ status: "error", message: getApiErrorMessage(error) });
      });
    return () => controller.abort();
  }, [electionId, attempt]);

  if (state.status === "loading") return <PageSkeleton label="Loading the election…" />;
  if (state.status === "not-found") {
    return (
      <div className="flex min-h-80 flex-col items-center justify-center gap-3 px-4 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <SearchX aria-hidden className="size-4.5" strokeWidth={1.75} />
        </span>
        <p className="text-[0.9375rem] font-semibold text-foreground">{electionId} wasn&apos;t found</p>
        <Link href="/elections" className={cn(toolbarButtonClassName, "h-8 px-3.5 text-[0.8125rem]")}>
          Back to elections
        </Link>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <PageError
        title="Couldn't load the election"
        message={state.message}
        onRetry={() => {
          setState({ status: "loading" });
          setAttempt((n) => n + 1);
        }}
      />
    );
  }
  return (
    <SettingsWorkspace
      key={state.election.id}
      loaded={state}
      onElection={(election) => setState((current) => (current.status === "ready" ? { ...current, election } : current))}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Workspace                                 */
/* -------------------------------------------------------------------------- */

type Tab = "voters" | "logins" | "details";

const TABS: { value: Tab; label: string }[] = [
  { value: "voters", label: "Voters" },
  { value: "logins", label: "Voter logins" },
  { value: "details", label: "Election details" },
];

function SettingsWorkspace({ loaded, onElection }: { loaded: Loaded; onElection: (election: Election) => void }) {
  const { election, terms, careers, enrollments } = loaded;
  // Voters and Voter logins wait on the voters service, so the page opens on the details.
  const [tab, setTab] = useState<Tab>("details");
  const { notice, say } = useNotice();
  usePageCrumb({ label: TABS.find((t) => t.value === tab)!.label });

  // Who can vote, the same way the election wizard counts it.
  const scope = useMemo(() => {
    const programs = programsByCareer(careers, enrollments ?? []);
    const form = electionToForm(election, careers, programs);
    const pool = enrollments ? voterPool(enrollments, form, careers, programs) : null;
    const colors = new Map(careers.map((c) => [c.code, careerColor(c, careers)]));
    const rows = careers
      .filter((c) => form.careerScope.includes(c.code))
      .map((career) => ({
        career,
        color: colors.get(career.code)!,
        programs: programPicks(form, career, programs),
        hasPrograms: (programs.get(career.code)?.length ?? 0) > 0,
        levels: levelPicks(form, career),
      }));
    return { rows, eligible: pool?.total ?? null };
  }, [election, careers, enrollments]);

  return (
    <div className="px-4 pb-16 sm:px-6 lg:px-8">
      <UnderlineTabs label="Election settings" tabs={TABS} value={tab} onChange={setTab} listClassName="gap-8" />

      <div key={tab} className="mt-5 animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none">
        {tab === "details" ? (
          <DetailsTab election={election} terms={terms} scope={scope} onElection={onElection} say={say} />
        ) : (
          <ComingSoon tab={tab} eligible={scope.eligible} />
        )}
      </div>

      <Toast notice={notice} />
    </div>
  );
}

const rise = (index: number): CSSProperties => ({ animationDelay: `${index * 70}ms` });

/* -------------------------------------------------------------------------- */
/*                            Voters / Voter logins                           */
/* -------------------------------------------------------------------------- */

const COMING: Record<Exclude<Tab, "details">, { icon: ReactNode; title: string; body: string; items: string[] }> = {
  voters: {
    icon: <Users className="size-5" strokeWidth={1.75} />,
    title: "Voters aren't generated yet",
    body: "This tab will list one voter per eligible student, with their vote status. It turns on once the voters service is connected to the server.",
    items: ["One voter per student who matches the scope", "Not started, voted and inactive at a glance", "Add students who joined after the list was made"],
  },
  logins: {
    icon: <KeyRound className="size-5" strokeWidth={1.75} />,
    title: "Voter logins come after voters",
    body: "Passcodes and login emails are made for each voter, so this tab turns on with the voters service.",
    items: ["A passcode per voter, stored only as a hash", "Login emails sent in batches, with bounces to retry", "Resend or regenerate one voter's login"],
  },
};

function ComingSoon({ tab, eligible }: { tab: Exclude<Tab, "details">; eligible: number | null }) {
  const content = COMING[tab];
  return (
    <div className="flex flex-col items-center rounded-[0.375rem] border border-dashed border-[#d5dbe3] px-6 py-14 text-center dark:border-white/15">
      <span className="flex size-12 items-center justify-center rounded-full bg-brand-blue/8 text-brand-blue animate-in zoom-in-75 duration-500 dark:bg-white/8 dark:text-[#7aa7e6] motion-reduce:animate-none">
        {content.icon}
      </span>
      <p className="mt-4 text-[1rem] font-semibold text-foreground">{content.title}</p>
      <p className="mt-1.5 max-w-lg text-[0.875rem] leading-5.5 text-muted-foreground">{content.body}</p>
      {eligible !== null ? (
        <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-muted px-3.5 py-1.5 text-[0.8125rem] text-foreground">
          <Users aria-hidden className="size-3.5 text-muted-foreground" />
          <AnimatedNumber value={eligible} from={0} duration={900} className="font-semibold tabular-nums" /> students match this election&apos;s scope
        </p>
      ) : null}
      <ul className="mt-6 grid w-full max-w-2xl gap-3 text-left sm:grid-cols-3">
        {content.items.map((item, index) => (
          <li key={item} style={rise(index + 1)} className={cn("rounded-[0.375rem] border border-[#e2e8f0] px-3.5 py-3 text-[0.8125rem] leading-5 text-muted-foreground dark:border-border", motion.riseIn)}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                               Election details                             */
/* -------------------------------------------------------------------------- */

/** Status pills (filled), as on the election cards. */
const STATUS_PILL: Record<ElectionStatus, string> = {
  Draft: "bg-muted text-muted-foreground",
  Upcoming: "bg-brand-gold text-brand-navy",
  Ongoing: "bg-brand-blue text-white",
  Completed: "bg-[#22c55e] text-white",
  Cancelled: "bg-[#f87171] text-white",
};

function StatusPill({ status }: { status: ElectionStatus }) {
  return (
    <span key={status} className={cn("inline-flex h-5 items-center rounded-[0.1875rem] px-2 font-mono text-[0.625rem] font-semibold tracking-[0.08em] uppercase", STATUS_PILL[status], motion.pillPop)}>
      {status}
    </span>
  );
}

interface Scope {
  rows: { career: Career; color: string; programs: string[]; hasPrograms: boolean; levels: number[] }[];
  eligible: number | null;
}

interface DetailsTabProps {
  election: Election;
  terms: readonly Term[];
  scope: Scope;
  onElection: (election: Election) => void;
  say: (text: string, tone?: "success" | "error" | "info") => void;
}

function DetailsTab({ election, terms, scope, onElection, say }: DetailsTabProps) {
  return (
    <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_23.75rem]">
      <div className="min-w-0 space-y-5">
        <div className={motion.riseIn} style={rise(0)}>
          <InfoCard election={election} terms={terms} scope={scope} />
        </div>
        <div className={motion.riseIn} style={rise(1)}>
          <ScheduleCard election={election} onElection={onElection} say={say} />
        </div>
      </div>
      <aside className="space-y-5 xl:sticky xl:top-6">
        <div className={motion.riseIn} style={rise(1)}>
          <StatusCard election={election} />
        </div>
        <div className={motion.riseIn} style={rise(2)}>
          <DangerZone election={election} onElection={onElection} say={say} />
        </div>
      </aside>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[0.75rem] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-[0.875rem] leading-5.5 break-words text-foreground">{children}</dd>
    </div>
  );
}

const neutralPill = "inline-flex h-6.5 items-center rounded-full bg-[#f1f4f8] px-3 text-[0.8125rem] text-foreground dark:bg-white/8";

function InfoCard({ election, terms, scope }: { election: Election; terms: readonly Term[]; scope: Scope }) {
  const term = terms.find((t) => t.id === election.termId);
  const draft = election.status === "Draft";

  return (
    <SectionCard
      title="Election details"
      aside={
        <span className="flex items-center gap-2">
          <span className="font-mono text-[0.6875rem] text-muted-foreground">{election.id}</span>
          <StatusPill status={election.status} />
        </span>
      }
    >
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2">
        <Field label="Title">{election.title}</Field>
        <Field label="Category">{election.category}</Field>
        <Field label="Description" className="sm:col-span-2">
          {election.description || "—"}
        </Field>
        <Field label="Term">{term ? termOptionLabel(term) : election.termId}</Field>
        <Field label="Rules">{election.rules?.trim() || "—"}</Field>
      </dl>

      <p className="mt-4 font-mono text-[0.625rem] tracking-[0.1em] text-muted-foreground uppercase">Who can vote</p>
      <div className="mt-2 space-y-2">
        {scope.rows.length ? (
          scope.rows.map((row, index) => (
            <div key={row.career.code} style={{ ...careerStyle(row.color), ...rise(index) }} className={cn("flex flex-wrap items-center gap-2", motion.riseIn)}>
              <CareerBadge code={row.career.code} />
              {row.hasPrograms ? <span className={neutralPill}>{row.programs.length ? row.programs.join(", ") : "All programs"}</span> : null}
              <span className={neutralPill}>{formatLevelScope(row.levels.length ? row.levels : careerLevels(row.career), [row.career])}</span>
            </div>
          ))
        ) : (
          <p className="text-[0.8125rem] text-muted-foreground">Every career.</p>
        )}
      </div>

      <p className="mt-3 flex items-start gap-1.5 text-[0.75rem] leading-4.5 text-muted-foreground">
        {draft ? (
          <>
            While it&apos;s a draft, details and who can vote can still change.{" "}
            <Link href={electionEditHref(election.id)} className="group/edit inline-flex items-center gap-1 font-medium text-brand-blue hover:underline dark:text-[#7aa7e6]">
              Edit draft
              <ArrowRight aria-hidden className="size-3 transition-transform duration-200 group-hover/edit:translate-x-0.5" />
            </Link>
          </>
        ) : (
          <>
            <Lock aria-hidden className="mt-0.5 size-3 shrink-0" />
            The details and who can vote are locked while it&apos;s scheduled. To change them, move it back to draft on its Manage page.
          </>
        )}
      </p>

      <div className="mt-3 flex min-h-11 items-center justify-between gap-4 rounded-[0.375rem] border border-[#e2e8f0] px-4 py-2 dark:border-border">
        <p className="text-[0.875rem] font-medium text-foreground">
          {scope.eligible !== null ? (
            <>
              <AnimatedNumber value={scope.eligible} from={0} duration={900} className="tabular-nums" /> {scope.eligible === 1 ? "student matches" : "students match"} this scope
            </>
          ) : (
            "Couldn't count the students in this scope"
          )}
        </p>
        <span className="shrink-0 font-mono text-[0.6875rem] text-muted-foreground">eligible voters</span>
      </div>
    </SectionCard>
  );
}

/* --------------------------------- Schedule -------------------------------- */

/** The update body: everything as saved, with the new voting window. */
function rescheduled(election: Election, opensAt: LocalDateTime, closesAt: LocalDateTime): ElectionInput {
  return {
    title: election.title,
    description: election.description,
    rules: election.rules,
    category: election.category,
    careerScope: election.careerScope,
    programScope: election.programScope,
    levelScope: election.levelScope,
    termId: election.termId,
    startsAt: localToInstant(opensAt),
    endsAt: localToInstant(closesAt),
  };
}

const nowLocal = () => instantToLocal(new Date().toISOString());

const LOCKED_SCHEDULE: Partial<Record<ElectionStatus, string>> = {
  Ongoing: "Voting is open, so the schedule is locked.",
  Completed: "Voting has ended.",
  Cancelled: "This election was cancelled.",
};

function ScheduleCard({ election, onElection, say }: { election: Election; onElection: (e: Election) => void; say: DetailsTabProps["say"] }) {
  const { refresh: refreshElectionsNav } = useElectionsNav();
  const saved = { opens: instantToLocal(election.startsAt), closes: instantToLocal(election.endsAt) };
  const [opens, setOpens] = useState(saved.opens);
  const [closes, setCloses] = useState(saved.closes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [today] = useState(todayIso);
  const editable = election.status === "Draft" || election.status === "Upcoming";

  const dirty = opens !== saved.opens || closes !== saved.closes;
  const opensError = opens !== saved.opens && opens < nowLocal() ? "Pick a time that hasn't passed." : null;
  const closesError = closes <= opens ? "Must be after it opens." : null;
  const canSave = editable && dirty && !opensError && !closesError && !busy;

  function discard() {
    setOpens(saved.opens);
    setCloses(saved.closes);
    setError(null);
  }

  async function reschedule() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      const next = await updateElection(election.id, rescheduled(election, opens, closes));
      onElection(next);
      refreshElectionsNav();
      say(`Rescheduled: ${formatDayTime(opens)} → ${formatDayTime(closes)}.`);
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  const changed = "ring-3 ring-brand-blue/15 rounded-[0.25rem] transition-shadow duration-300";

  return (
    <SectionCard title="Schedule" aside={editable ? undefined : <span className="inline-flex items-center gap-1.5 font-mono text-[0.65625rem] text-muted-foreground"><Lock aria-hidden className="size-3" />locked</span>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="schedule-opens" className={labelClassName}>
            Opens
          </label>
          {editable ? (
            <div className={cn(opens !== saved.opens && changed)}>
              <DateTimePicker id="schedule-opens" label="Voting opens" value={opens} onChange={setOpens} today={today} defaultTime="08:00" invalid={!!opensError} describedBy={opensError ? "schedule-opens-error" : undefined} />
            </div>
          ) : (
            <ReadOnlyField id="schedule-opens">{formatDayTime(saved.opens)}</ReadOnlyField>
          )}
          {opensError ? <p id="schedule-opens-error" className={cn("mt-1.5 text-[0.75rem] text-destructive", motion.fieldError)}>{opensError}</p> : null}
        </div>
        <div>
          <label htmlFor="schedule-closes" className={labelClassName}>
            Closes
          </label>
          {editable ? (
            <div className={cn(closes !== saved.closes && changed)}>
              <DateTimePicker
                id="schedule-closes"
                label="Voting closes"
                value={closes}
                onChange={setCloses}
                today={today}
                defaultTime="17:00"
                min={opens.slice(0, 10)}
                invalid={!!closesError}
                describedBy={closesError ? "schedule-closes-error" : undefined}
              />
            </div>
          ) : (
            <ReadOnlyField id="schedule-closes">{formatDayTime(saved.closes)}</ReadOnlyField>
          )}
          {closesError ? <p id="schedule-closes-error" className={cn("mt-1.5 text-[0.75rem] text-destructive", motion.fieldError)}>{closesError}</p> : null}
        </div>
      </div>

      <p className="mt-3 text-[0.75rem] leading-4.5 text-muted-foreground">
        {editable
          ? "You can move the opening and closing times until voting opens. Voting opens and closes on its own at these times; once it starts, the schedule locks and the election can only be cancelled."
          : LOCKED_SCHEDULE[election.status]}
      </p>

      {error ? (
        <p role="alert" className="mt-3 rounded-[0.25rem] border border-destructive/30 bg-destructive/5 px-3 py-2 text-[0.75rem] leading-4.5 text-destructive animate-in fade-in slide-in-from-top-1 duration-300 motion-reduce:animate-none">
          {error}
        </p>
      ) : null}

      {editable ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p key={String(dirty)} className="text-[0.75rem] text-muted-foreground animate-in fade-in duration-300 motion-reduce:animate-none">
            {dirty ? "Unsaved changes. Rescheduling saves them to the election right away." : "No changes."}
          </p>
          <div className="flex items-center gap-2.5">
            {dirty ? (
              <button type="button" onClick={discard} disabled={busy} className={cn(outlineButtonClassName, "animate-in fade-in slide-in-from-right-2 duration-300 motion-reduce:animate-none")}>
                Discard changes
              </button>
            ) : null}
            <button type="button" onClick={() => void reschedule()} disabled={!canSave} className={cn(ctaButtonClassName, "disabled:opacity-45")}>
              {busy ? <LoaderCircle aria-hidden className="mr-2 size-3.5 animate-spin" /> : null}
              {busy ? "Rescheduling…" : "Reschedule"}
            </button>
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}

function ReadOnlyField({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="flex h-10 items-center gap-2 rounded-[0.25rem] border border-[#e2e8f0] bg-muted/40 px-3 text-[0.875rem] text-foreground/80 dark:border-border">
      <Lock aria-hidden className="size-3.5 text-muted-foreground" />
      {children}
    </p>
  );
}

/* ---------------------------------- Status --------------------------------- */

const STATUS_ORDER: ElectionStatus[] = ["Draft", "Upcoming", "Ongoing", "Completed"];

/** Draft → Upcoming → Ongoing → Completed (or Draft → Cancelled), with the current stage pulsing. */
function StatusCard({ election }: { election: Election }) {
  const opens = instantToLocal(election.startsAt);
  const closes = instantToLocal(election.endsAt);
  const created = instantToLocal(new Date(election.createdAt).toISOString());
  const cancelled = election.status === "Cancelled";

  const stages: { status: ElectionStatus; detail: string }[] = cancelled
    ? [
        { status: "Draft", detail: `Created ${formatDay(created, { year: true })}` },
        { status: "Cancelled", detail: "Stopped without results" },
      ]
    : [
        { status: "Draft", detail: `Created ${formatDay(created, { year: true })}` },
        { status: "Upcoming", detail: `Opens ${formatDayTime(opens)}` },
        { status: "Ongoing", detail: `Voting window · ${formatDay(opens)} → ${formatDay(closes)}` },
        { status: "Completed", detail: `Closes ${formatDayTime(closes)}` },
      ];
  const current = cancelled ? 1 : STATUS_ORDER.indexOf(election.status);

  return (
    <SectionCard title="Status" aside={<StatusPill status={election.status} />} bodyClassName="px-5 py-4">
      <ol>
        {stages.map((stage, index) => {
          const state = index < current ? "done" : index === current ? "current" : "todo";
          const last = index === stages.length - 1;
          return (
            <li key={stage.status} style={rise(index)} className={cn("relative flex gap-3 pb-3.5 last:pb-0", motion.riseIn)}>
              {!last ? (
                // The line to the next stage fills in once this stage is behind.
                <span aria-hidden className="absolute top-4 bottom-0 left-[0.3125rem] w-px overflow-hidden bg-[#e2e8f0] dark:bg-border">
                  <span
                    className={cn(
                      "absolute inset-0 origin-top bg-brand-blue transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none dark:bg-[#7aa7e6]",
                      state === "done" ? "scale-y-100" : "scale-y-0",
                    )}
                  />
                </span>
              ) : null}
              <span aria-hidden className="relative mt-1 flex size-2.75 shrink-0">
                {state === "current" ? (
                  <span className={cn("absolute inset-0 animate-ping rounded-full opacity-60 motion-reduce:animate-none", cancelled ? "bg-[#f87171]" : "bg-brand-gold")} />
                ) : null}
                <span
                  className={cn(
                    "relative size-2.75 rounded-full transition-colors duration-300",
                    state === "done" ? "bg-brand-blue dark:bg-[#7aa7e6]" : state === "current" ? (cancelled ? "bg-[#f87171]" : "bg-brand-gold") : "bg-[#e2e8f0] dark:bg-white/15",
                  )}
                />
              </span>
              <div className="min-w-0">
                <p className={cn("text-[0.875rem] leading-5", state === "todo" ? "text-muted-foreground" : "font-medium text-foreground")}>
                  {stage.status}
                  {state === "current" ? <span className="sr-only"> (current)</span> : null}
                </p>
                <p className="text-[0.75rem] leading-4.5 text-muted-foreground">{stage.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </SectionCard>
  );
}

/* -------------------------------- Danger zone ------------------------------ */

function DangerZone({ election, onElection, say }: { election: Election; onElection: (e: Election) => void; say: DetailsTabProps["say"] }) {
  const router = useRouter();
  const { refresh: refreshElectionsNav } = useElectionsNav();
  const [deleting, setDeleting] = useState<Election | null>(null);
  if (election.status === "Completed" || election.status === "Cancelled") return null;
  const draft = election.status === "Draft";

  return (
    <SectionCard title="Danger zone" className="border-destructive/25 dark:border-destructive/30">
      {draft ? (
        <>
          <p className="text-[0.875rem] font-medium text-foreground">Delete draft</p>
          <p className="mt-1 text-[0.8125rem] leading-5 text-muted-foreground">Removes this draft for good. Nothing has been sent to voters yet.</p>
          <button
            type="button"
            onClick={() => setDeleting(election)}
            className={cn(outlineButtonClassName, "mt-3 text-destructive hover:border-destructive/40 hover:bg-destructive/6")}
          >
            Delete draft
          </button>
          <ConfirmDeleteDialog
            item={deleting}
            getKey={(e) => e.id}
            title={(e) => `Delete ${e.id}?`}
            description={(e) => (
              <>
                This permanently deletes the draft <span className="font-medium text-foreground">{e.title}</span>. It can&apos;t be undone.
              </>
            )}
            summary={(e) => `${e.id} · ${e.category} · ${e.termId} · ${e.status}`}
            confirmLabel="Delete election"
            onClose={() => setDeleting(null)}
            onConfirm={async (e) => {
              try {
                await deleteElection(e.id);
              } catch (cause) {
                throw new Error(getApiErrorMessage(cause));
              }
              refreshElectionsNav();
              router.push("/elections");
            }}
          />
        </>
      ) : (
        <>
          <p className="text-[0.875rem] font-medium text-foreground">Cancel election</p>
          <p className="mt-1 text-[0.8125rem] leading-5 text-muted-foreground">Stops this election without results. You can bring it back as a draft later.</p>
          <StatusAction
            className="mt-3"
            label="Cancel election"
            variant="danger"
            confirmTitle={`Cancel ${election.title}?`}
            confirmBody={
              election.status === "Ongoing"
                ? "Voting stops right away and no results are published. This can't be undone."
                : "It won't open and no results are published. You can bring it back as a draft later."
            }
            confirmLabel="Cancel election"
            onConfirm={async () => {
              const saved = await setElectionStatus(election.id, "Cancelled");
              onElection(saved);
              refreshElectionsNav();
              say(`${election.title} was cancelled.`);
            }}
          />
          <p className="mt-2 flex items-start gap-1.5 text-[0.75rem] leading-4.5 text-muted-foreground">
            <Mail aria-hidden className="mt-0.5 size-3 shrink-0" />
            Voters aren&apos;t emailed about it yet.
          </p>
        </>
      )}
    </SectionCard>
  );
}

