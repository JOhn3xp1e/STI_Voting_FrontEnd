"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import { LoaderCircle, Lock } from "lucide-react";

import { LoginStage } from "@/components/auth/login-stage";
import { CareerBadge, careerStyle } from "@/components/elections/create/create-election-ui";
import { enrollmentsByStudent, percent, timeLeft } from "@/lib/election-live";
import { count } from "@/lib/election-manage";
import { formatDay, formatDayTime, formatTime, instantToLocal, levelLabel } from "@/lib/elections";
import { careerColor } from "@/lib/programs";
import { cn } from "@/lib/utils";
import { isApiError } from "@/services/api/client";
import { getApiErrorMessage } from "@/services/api/error-message";
import { createVoterQr } from "@/services/elections/live.service";
import { fetchElection, fetchVoterEnrollments } from "@/services/elections/elections.service";
import { fetchCareers } from "@/services/programs/programs.service";
import { fetchVoterRows, type VoterRow } from "@/services/voters/voters.service";
import type { Election, VoterEnrollment } from "@/types/election.types";
import type { Career } from "@/types/program.types";

import { QrBackdrop } from "./qr-backdrop";
import { QrCode } from "./qr-code";

/** Turnout refresh while the page is visible. */
const REFRESH_MS = 30_000;
/** A shown QR signs that voter in, so it doesn't stay on a shared screen. */
const QR_VISIBLE_MS = 2 * 60_000;

interface Data {
  election: Election;
  careers: Career[];
  voters: VoterRow[];
  /** Student ID → enrollment (program, level); empty when enrollments couldn't be loaded. */
  enrollment: Map<string, VoterEnrollment>;
}

type LoadState = { status: "loading" } | { status: "error"; message: string; notFound: boolean } | { status: "ready"; data: Data };

type Result =
  | { kind: "idle" }
  | { kind: "not-found"; studentId: string }
  | { kind: "loading"; voter: VoterRow }
  | { kind: "qr"; voter: VoterRow; url: string }
  | { kind: "blocked"; voter: VoterRow; message: string }
  | { kind: "error"; voter: VoterRow; message: string };

/** The current time, ticking every 30 s (for "7h 42m left"). */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * `/elections/[id]/qr`: full-screen QR viewer for one election (set by the link). An admin
 * searches a voter's student ID and the voter scans the QR to sign in without typing.
 */
export function QrViewer({ electionId }: { electionId: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const now = useMinuteClock();

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([
      fetchElection(electionId, { signal }),
      fetchCareers({ signal }),
      fetchVoterRows(electionId, { signal }),
      fetchVoterEnrollments({ signal }).catch(() => [] as VoterEnrollment[]),
    ])
      .then(([election, careers, voters, enrollments]) =>
        setState({ status: "ready", data: { election, careers, voters, enrollment: enrollmentsByStudent(enrollments, election.termId) } }),
      )
      .catch((error: unknown) => {
        if (signal.aborted) return;
        setState({ status: "error", message: getApiErrorMessage(error), notFound: isApiError(error) && error.isNotFound });
      });
    return () => controller.abort();
  }, [electionId, attempt]);

  // Turnout and vote statuses stay current while the screen is up.
  const ready = state.status === "ready";
  useEffect(() => {
    if (!ready) return;
    let controller: AbortController | null = null;
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      controller?.abort();
      const current = new AbortController();
      controller = current;
      fetchVoterRows(electionId, { signal: current.signal })
        .then((voters) => setState((s) => (s.status === "ready" ? { status: "ready", data: { ...s.data, voters } } : s)))
        .catch(() => {});
    }, REFRESH_MS);
    return () => {
      clearInterval(timer);
      controller?.abort();
    };
  }, [ready, electionId]);

  return (
    // The sign-in screen's composition with the 3D building (LoginStage provides it), on a calmer, still background.
    <LoginStage initialVariant={1} className="relative isolate flex min-h-dvh flex-1 flex-col overflow-hidden bg-login-background">
      <QrBackdrop />
      <div className="relative mx-auto grid w-full max-w-360 flex-1 content-center items-center gap-10 px-4 py-8 sm:px-8 sm:py-12 lg:grid-cols-[minmax(0,1fr)_30rem] lg:gap-14 lg:px-14 lg:py-10 xl:px-18">
        <BrandPanel election={state.status === "ready" ? state.data.election : null} voters={state.status === "ready" ? state.data.voters : null} now={now} />
        <section
          aria-labelledby="qr-title"
          data-login-variant="1"
          className="w-full max-w-120 justify-self-center rounded-[1.25rem] bg-brand-white px-6 pt-7 pb-6 text-brand-navy shadow-2xl shadow-black/40 sm:px-9 lg:justify-self-end"
        >
          <h1 id="qr-title" className="text-2xl font-semibold">
            Voter QR
          </h1>
          <p className="mt-1.5 text-[0.8125rem] text-brand-muted">Search a student ID to show their sign-in QR.</p>
          {state.status === "loading" ? (
            <div className="flex h-80 items-center justify-center gap-2 text-[0.8125rem] text-brand-muted">
              <LoaderCircle aria-hidden className="size-4 animate-spin" />
              Loading the election…
            </div>
          ) : state.status === "error" ? (
            <div role="alert" className="mt-5 rounded-xl border border-dashed border-[#e4e8f0] px-6 py-10 text-center">
              <p className="text-[0.8125rem] font-medium text-brand-navy">{state.notFound ? `${electionId} wasn't found` : "Couldn't load the election"}</p>
              {state.notFound ? null : <p className="mt-1 text-[0.6875rem] text-brand-muted">{state.message}</p>}
              <button
                type="button"
                onClick={() => {
                  setState({ status: "loading" });
                  setAttempt((n) => n + 1);
                }}
                className="mt-4 h-9 rounded-md bg-brand-navy px-4 text-[0.8125rem] font-semibold text-white outline-none hover:bg-brand-navy/85 focus-visible:ring-3 focus-visible:ring-brand-blue/30"
              >
                Try again
              </button>
            </div>
          ) : (
            <Lookup data={state.data} />
          )}
          <p className="mt-3.5 text-[0.6875rem] text-brand-muted">The QR link carries the voter ID and passcode. Neither is shown on screen.</p>
        </section>
      </div>
    </LoginStage>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 Brand panel                                */
/* -------------------------------------------------------------------------- */

function BrandPanel({ election, voters, now }: { election: Election | null; voters: VoterRow[] | null; now: number }) {
  const voted = voters?.filter((v) => v.voteStatus === "completed").length ?? 0;
  const total = voters?.length ?? 0;
  const share = total ? voted / total : 0;
  const closes = election ? instantToLocal(election.endsAt) : null;
  return (
    /* The shadow keeps the text readable over the 3D building. */
    <div className="w-full max-w-120 justify-self-center [text-shadow:0_1px_10px_rgb(11_18_32/0.85)] lg:max-w-[47rem] lg:justify-self-stretch">
      <div className="flex items-center gap-3">
        <Image src="/images/slvp logo.png" alt="STI" width={36} height={35} className="h-8.75 w-9 object-contain" />
        <p className="font-display text-[1.75rem] leading-tight font-semibold text-brand-white sm:text-[2.375rem]">SLVP · QR Viewer</p>
      </div>
      <p className="mt-1 font-display text-[1.625rem] leading-tight font-bold text-brand-gold [text-shadow:0_4px_4px_rgb(0_0_0/0.25)] sm:text-4xl sm:leading-14">
        {election?.title ?? " "}
      </p>
      <p className="mt-1 max-w-[28.75rem] text-[0.9375rem] leading-6 text-brand-white/60">
        Find a voter by student ID and show their sign-in QR. Scanning it signs them in, no typing needed.
      </p>
      {election && voters && closes ? (
        <div className="mt-8 w-full max-w-130 sm:mt-10">
          <div className="flex flex-wrap gap-x-12 gap-y-4">
            <div>
              <p className="text-4xl font-semibold text-brand-white tabular-nums">{percent(share)}</p>
              <p className="mt-1 text-[0.8125rem] text-brand-white/60">
                turnout · {count(voted)} of {count(total)} voted
              </p>
            </div>
            <div>
              <p className="text-4xl font-semibold text-brand-white tabular-nums">{formatTime(closes.slice(11))}</p>
              <p className="mt-1 text-[0.8125rem] text-brand-white/60">
                {election.status === "Ongoing" ? `voting ends ${formatDay(closes)} · ${timeLeft(election.endsAt, now)}` : `closing time · ${formatDay(closes)}`}
              </p>
            </div>
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-[3px] bg-white/15">
            <div className="h-full rounded-[3px] bg-brand-gold transition-[width] duration-700" style={{ width: `${share * 100}%` }} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Lookup                                   */
/* -------------------------------------------------------------------------- */

const STATUS_LINE: Partial<Record<Election["status"], string>> = {
  Draft: "Draft",
  Upcoming: "Upcoming · opens",
  Completed: "Voting closed",
  Cancelled: "Cancelled",
};

function Lookup({ data }: { data: Data }) {
  const { election, voters } = data;
  const live = election.status === "Ongoing";
  const [input, setInput] = useState("");
  const [result, setResult] = useState<Result>({ kind: "idle" });
  const request = useRef(0);
  const byStudent = useMemo(() => new Map(voters.map((v) => [v.studentId, v])), [voters]);

  // Hide the QR after a while: it signs that voter in.
  useEffect(() => {
    if (result.kind !== "qr") return;
    const timer = setTimeout(() => setResult({ kind: "idle" }), QR_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [result]);

  async function search(event: FormEvent) {
    event.preventDefault();
    const studentId = input.replace(/\D/g, "");
    if (!studentId) return;
    const id = ++request.current;
    const voter = byStudent.get(studentId);
    if (!voter) return setResult({ kind: "not-found", studentId });
    if (voter.voteStatus === "completed") return setResult({ kind: "blocked", voter, message: "Already voted. There's nothing left to sign in for." });
    if (!voter.isActive) return setResult({ kind: "blocked", voter, message: "This voter is deactivated, so they can't sign in." });
    setResult({ kind: "loading", voter });
    try {
      const qr = await createVoterQr(election.id, studentId);
      if (id === request.current) setResult({ kind: "qr", voter, url: qr.loginUrl });
    } catch (error) {
      if (id !== request.current) return;
      // A 404 without an `{ error }` body means the endpoint itself isn't there yet.
      const message =
        isApiError(error) && error.isNotFound && typeof error.problem?.error !== "string"
          ? "QR sign-in isn't available yet: the server can't make sign-in links for the QR viewer."
          : getApiErrorMessage(error);
      setResult({ kind: "error", voter, message });
    }
  }

  const closes = formatDayTime(instantToLocal(election.endsAt));
  const detail = live ? `Live · closes ${closes}` : election.status === "Upcoming" ? `${STATUS_LINE.Upcoming} ${formatDayTime(instantToLocal(election.startsAt))}` : STATUS_LINE[election.status];

  return (
    <>
      <div className="mt-3.5 space-y-1.5">
        <p className="text-xs font-medium">Election</p>
        <div className="flex items-center gap-2.5 rounded-lg border border-[#e4e8f0] px-3.5 py-2.75">
          <span aria-hidden className={cn("size-2 shrink-0 rounded-full", live ? "bg-[#34c759]" : "bg-[#cbd5e1]")} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.84375rem] font-medium">{election.title}</p>
            <p className="truncate text-[0.6875rem] text-brand-muted">
              {election.id} · {detail}
            </p>
          </div>
          <Lock aria-label="Can't be changed" className="size-4.5 shrink-0 text-brand-muted" strokeWidth={2} />
        </div>
        {result.kind === "idle" ? <p className="text-[0.6875rem] text-brand-muted">Set by this admin link and can&apos;t be changed here.</p> : null}
      </div>

      <form onSubmit={(e) => void search(e)} className="mt-3.5 flex items-end gap-2">
        <label className="min-w-0 flex-1 space-y-1.5">
          <span className="block text-[0.6875rem] font-semibold">Student ID</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value.replace(/\D/g, "").slice(0, 11))}
            inputMode="numeric"
            autoComplete="off"
            placeholder="e.g. 02000224906"
            disabled={!live}
            className="h-10 w-full rounded-md border border-[#e4e8f0] bg-white px-3 text-[0.8125rem] text-brand-navy outline-none placeholder:text-brand-muted focus:border-brand-blue focus:ring-3 focus:ring-brand-blue/20 disabled:cursor-not-allowed disabled:bg-[#f8fafc]"
          />
        </label>
        <button
          type="submit"
          disabled={!live || !input || result.kind === "loading"}
          className="h-10 shrink-0 rounded-md bg-brand-navy px-4 text-[0.8125rem] font-semibold text-white outline-none hover:bg-brand-navy/85 focus-visible:ring-3 focus-visible:ring-brand-blue/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Search
        </button>
      </form>

      <div className="mt-3.5">
        {!live ? (
          <Placeholder title="Voting isn't open" detail="Sign-in QRs work only while the election is live." />
        ) : result.kind === "idle" ? (
          <Placeholder title="The voter’s QR appears here" detail="Only voters in this election can be found." />
        ) : result.kind === "not-found" ? (
          <Placeholder title={`No voter with student ID ${result.studentId}`} detail="Check the number. Only voters in this election can be found." />
        ) : (
          <VoterCard voter={result.voter} data={data}>
            {result.kind === "loading" ? (
              <div className="flex h-75 items-center justify-center gap-2 text-[0.8125rem] text-brand-muted">
                <LoaderCircle aria-hidden className="size-4 animate-spin" />
                Making their sign-in QR…
              </div>
            ) : result.kind === "qr" ? (
              <>
                <QrCode value={result.url} size={300} label={`Sign-in QR for ${result.voter.name ?? result.voter.studentId}`} className="max-w-full animate-in fade-in zoom-in-95 duration-300 motion-reduce:animate-none" />
                <p className="text-[0.78125rem] font-medium">Scan with your phone camera to sign in</p>
                <button type="button" onClick={() => setResult({ kind: "idle" })} className="text-[0.6875rem] text-brand-muted underline-offset-2 hover:text-brand-navy hover:underline">
                  Hide QR · hides on its own after 2 minutes
                </button>
              </>
            ) : (
              <p role={result.kind === "error" ? "alert" : undefined} className="px-4 py-10 text-center text-[0.8125rem] leading-5 text-brand-muted">
                {result.message}
              </p>
            )}
          </VoterCard>
        )}
      </div>
    </>
  );
}

function Placeholder({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex h-75 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#e4e8f0] px-6 text-center text-brand-muted">
      <p className="text-[0.8125rem] font-medium">{title}</p>
      <p className="text-[0.6875rem]">{detail}</p>
    </div>
  );
}

const VOTE_TAG: Record<VoterRow["voteStatus"], { label: string; className: string }> = {
  empty: { label: "Not started", className: "border-[#e4e8f0] text-[#64748b]" },
  draft: { label: "Draft", className: "border-[#fcd34d] bg-[#fffbeb] text-[#b27305]" },
  completed: { label: "Voted", className: "border-[#86efac] bg-[#f0fdf4] text-[#15803d]" },
};

function VoterCard({ voter, data, children }: { voter: VoterRow; data: Data; children: ReactNode }) {
  const enrollment = data.enrollment.get(voter.studentId);
  const career = enrollment ? data.careers.find((c) => c.code === enrollment.careerCode) : undefined;
  const name = voter.name ?? voter.studentId;
  const [last = "", first = ""] = name.split(",").map((part) => part.trim());
  const initials = `${last[0] ?? ""}${first[0] ?? ""}`.toUpperCase() || "?";
  const tag = VOTE_TAG[voter.voteStatus];
  const detail = [voter.studentId, enrollment?.programCode, enrollment ? levelLabel(enrollment.level, career) : null].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col items-center gap-3.5 rounded-xl border border-[#e4e8f0] p-4.5">
      <div className="flex w-full items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#f4f6fa] text-xs font-semibold text-brand-blue">{initials}</span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{name}</span>
            {career ? (
              <span style={careerStyle(careerColor(career, data.careers))}>
                <CareerBadge code={career.code} className="h-5 px-2 text-[0.625rem]" />
              </span>
            ) : null}
          </p>
          <p className="truncate text-[0.71875rem] text-brand-muted">{detail}</p>
        </div>
        <span className={cn("inline-flex shrink-0 items-center gap-1.25 rounded-[3px] border px-1.75 py-0.75 text-[0.625rem] font-medium uppercase", tag.className)}>
          <span aria-hidden className="size-1.5 rounded-full bg-current" />
          {tag.label}
        </span>
      </div>
      {children}
    </div>
  );
}
