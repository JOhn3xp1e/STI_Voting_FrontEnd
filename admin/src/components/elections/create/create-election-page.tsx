"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, SearchX } from "lucide-react";

import { PageError, PageLoading, Toast, useNotice } from "@/components/shared/page-feedback";
import { toolbarButtonClassName } from "@/components/students/student-toolbar-styles";
import { todayIso } from "@/lib/dates";
import {
  canEditElection,
  careerLevels,
  countEligibleVoters,
  editBlockedReason,
  electionToForm,
  localToInstant,
  sortProgramsByCode,
  validateDetails,
  validateVoters,
  type DetailsErrors,
  type ElectionForm,
  type VotersErrors,
} from "@/lib/elections";
import { sortCareers } from "@/lib/programs";
import { getTermStatus, sortTerms } from "@/lib/terms";
import { cn } from "@/lib/utils";
import { isApiError } from "@/services/api/client";
import { getApiErrorMessage } from "@/services/api/error-message";
import { createElection, fetchElection, fetchVoterEnrollments, updateElection } from "@/services/elections/elections.service";
import { fetchCareers, fetchPrograms } from "@/services/programs/programs.service";
import { fetchTerms } from "@/services/terms/terms.service";
import type { Election, ElectionInput, VoterEnrollment } from "@/types/election.types";
import type { Career, Program } from "@/types/program.types";
import type { Term } from "@/types/term.types";

import { Stepper } from "./create-election-ui";
import { AdminsStep, DetailsStep, PositionsStep, ReviewStep, VotersStep } from "./create-election-steps";
import { SummaryPanel } from "./summary-panel";

const STEPS = ["Details", "Who can vote", "Positions", "Admins", "Review"] as const;
const LAST_STEP = STEPS.length - 1;
const ELECTIONS_HREF = "/elections";

interface Catalog {
  terms: Term[];
  careers: Career[];
  programs: Program[];
  enrollments: VoterEnrollment[];
}

function fetchCatalog(signal: AbortSignal): Promise<Catalog> {
  return Promise.all([fetchTerms({ signal }), fetchCareers({ signal }), fetchPrograms({ signal }), fetchVoterEnrollments({ signal })]).then(
    ([terms, careers, programs, enrollments]) => ({
      terms: sortTerms(terms),
      careers: sortCareers(careers),
      programs: sortProgramsByCode(programs),
      enrollments,
    }),
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Create                                   */
/* -------------------------------------------------------------------------- */

type CreateLoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; catalog: Catalog };

/** `/elections/new`: loads what the form needs (terms, careers, programs, enrollments), then shows the wizard. */
export function CreateElectionPage() {
  const [state, setState] = useState<CreateLoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  /**
   * Next.js keeps this page alive (hidden) after navigating away, form and all.
   * Bumped after an election is saved so the next "New election" starts fresh at step 1;
   * an unfinished form is still kept if the admin leaves and comes back.
   */
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchCatalog(controller.signal)
      .then((catalog) => setState({ status: "ready", catalog }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ status: "error", message: getApiErrorMessage(error) });
      });
    return () => controller.abort();
  }, [attempt]);

  if (state.status === "loading") return <PageLoading label="Loading terms, careers and programs…" />;
  if (state.status === "error") {
    return (
      <PageError
        title="Couldn't load the election form"
        message={state.message}
        onRetry={() => {
          setState({ status: "loading" });
          setAttempt((n) => n + 1);
        }}
      />
    );
  }
  return <ElectionWizard key={formKey} catalog={state.catalog} election={null} onSaved={() => setFormKey((k) => k + 1)} />;
}

/* -------------------------------------------------------------------------- */
/*                                    Edit                                    */
/* -------------------------------------------------------------------------- */

type EditLoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "not-found" }
  | { status: "ready"; catalog: Catalog; election: Election };

/** Centered notice with a way back to the list (missing or locked election). */
function Notice({ icon, title, message }: { icon: ReactNode; title: string; message: string }) {
  return (
    <div className="flex min-h-80 flex-col items-center justify-center gap-3 px-4 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">{icon}</span>
      <div>
        <p className="text-[0.9375rem] font-semibold text-foreground">{title}</p>
        <p className="mt-1 max-w-md text-[0.8125rem] leading-5 text-muted-foreground">{message}</p>
      </div>
      <Link href={ELECTIONS_HREF} className={cn(toolbarButtonClassName, "h-8 px-3.5 text-[0.8125rem]")}>
        Back to elections
      </Link>
    </div>
  );
}

/** `/elections/[id]/edit`: loads the election plus the form's lists, then shows the wizard filled in. */
export function EditElectionPage({ electionId }: { electionId: string }) {
  const [state, setState] = useState<EditLoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([fetchCatalog(signal), fetchElection(electionId, { signal })])
      .then(([catalog, election]) =>
        // Keep the open form when this hidden page is shown again; only the lists refresh.
        setState((current) =>
          current.status === "ready" && current.election.id === election.id
            ? { ...current, catalog }
            : { status: "ready", catalog, election },
        ),
      )
      .catch((error: unknown) => {
        if (signal.aborted) return;
        if (isApiError(error) && error.isNotFound) setState({ status: "not-found" });
        else setState({ status: "error", message: getApiErrorMessage(error) });
      });
    return () => controller.abort();
  }, [electionId, attempt]);

  if (state.status === "loading") return <PageLoading label="Loading the election…" />;
  if (state.status === "not-found") {
    return (
      <Notice
        icon={<SearchX aria-hidden className="size-4.5" strokeWidth={1.75} />}
        title={`${electionId} wasn't found`}
        message="It may have been deleted. Pick another election from the list."
      />
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
  if (!canEditElection(state.election.status)) {
    return (
      <Notice
        icon={<Lock aria-hidden className="size-4.5" strokeWidth={1.75} />}
        title={`${state.election.id} can't be edited`}
        message={editBlockedReason(state.election.status)}
      />
    );
  }
  return (
    <ElectionWizard
      key={formKey}
      catalog={state.catalog}
      election={state.election}
      onSaved={(saved) => {
        // Next visit to this page starts from the saved values, not the old ones.
        setState((current) => (current.status === "ready" ? { ...current, election: saved } : current));
        setFormKey((k) => k + 1);
      }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Wizard                                   */
/* -------------------------------------------------------------------------- */

/** A new election: the current term (else the newest), every career and all their levels, all programs. */
function newElectionForm(catalog: Catalog, today: string): ElectionForm {
  const currentTerm = catalog.terms.find((t) => getTermStatus(t, today) === "current") ?? catalog.terms[0];
  return {
    title: "",
    category: "Council",
    description: "",
    termId: currentTerm?.id ?? null,
    rules: "",
    opensAt: null,
    closesAt: null,
    careerScope: catalog.careers.map((c) => c.code),
    programScope: [],
    levelScope: [...new Set(catalog.careers.flatMap(careerLevels))].sort((a, b) => a - b),
  };
}

function toInput(form: ElectionForm, photoPath: string | null): ElectionInput {
  return {
    title: form.title,
    description: form.description,
    rules: form.rules,
    // The API has no banner upload yet; an existing banner path is kept as is.
    photoPath,
    category: form.category,
    careerScope: form.careerScope,
    programScope: form.programScope,
    levelScope: form.levelScope,
    termId: form.termId!,
    startsAt: localToInstant(form.opensAt!),
    endsAt: localToInstant(form.closesAt!),
  };
}

interface ElectionWizardProps {
  catalog: Catalog;
  /** The election being edited, or `null` for a new one. */
  election: Election | null;
  /** Called after a successful save, just before going back to the list. */
  onSaved: (saved: Election) => void;
}

function ElectionWizard({ catalog, election, onSaved }: ElectionWizardProps) {
  const router = useRouter();
  const editing = election !== null;
  const [today] = useState(todayIso);
  const [form, setForm] = useState<ElectionForm>(() => (election ? electionToForm(election, catalog.careers) : newElectionForm(catalog, today)));
  const [step, setStep] = useState(0);
  // An existing election is already complete, so every step can be opened.
  const [reached, setReached] = useState(editing ? LAST_STEP : 0);
  const [detailsErrors, setDetailsErrors] = useState<DetailsErrors>({});
  const [votersErrors, setVotersErrors] = useState<VotersErrors>({});
  const [busy, setBusy] = useState<"secondary" | "primary" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const { notice, say } = useNotice();
  const topRef = useRef<HTMLDivElement>(null);

  // Free the banner preview's object URL when it changes or the page closes.
  useEffect(() => (bannerUrl ? () => URL.revokeObjectURL(bannerUrl) : undefined), [bannerUrl]);

  const eligible = useMemo(() => countEligibleVoters(catalog.enrollments, form), [catalog.enrollments, form]);

  function update(patch: Partial<ElectionForm>) {
    const next = { ...form, ...patch };
    setForm(next);
    // Re-check fields as they're fixed (only once errors are showing).
    if (Object.keys(detailsErrors).length) setDetailsErrors(validateDetails(next));
    if (Object.keys(votersErrors).length) setVotersErrors(validateVoters(next));
    setError(null);
  }

  function goTo(index: number) {
    setStep(index);
    setReached((r) => Math.max(r, index));
    setError(null);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /** Validates the steps up to `upTo`; jumps to the first one with errors. */
  function checkSteps(upTo: number): boolean {
    const details = validateDetails(form);
    setDetailsErrors(details);
    if (Object.keys(details).length) {
      goTo(0);
      return false;
    }
    if (upTo >= 1) {
      const voters = validateVoters(form);
      setVotersErrors(voters);
      if (Object.keys(voters).length) {
        goTo(1);
        return false;
      }
    }
    return true;
  }

  /** Creates a new election or updates the one being edited, then goes back to the cards. */
  async function save(kind: "secondary" | "primary", upTo: number) {
    if (!checkSteps(upTo)) return;
    setBusy(kind);
    setError(null);
    try {
      const input = toInput(form, election?.photoPath ?? null);
      const saved = election ? await updateElection(election.id, input) : await createElection(input);
      onSaved(saved);
      router.push(ELECTIONS_HREF);
    } catch (cause) {
      const message = getApiErrorMessage(cause);
      setError(message);
      say(message, "error");
    } finally {
      setBusy(null);
    }
  }

  /** Edit mode: leave without saving (the form resets to the saved values). */
  function cancel() {
    if (election) onSaved(election);
    router.push(ELECTIONS_HREF);
  }

  function next() {
    if (step === 0 && !checkSteps(0)) return;
    if (step === 1 && !checkSteps(1)) return;
    goTo(step + 1);
  }

  const atEnd = step === LAST_STEP;
  const primaryLabel = atEnd ? (editing ? "Save changes" : "Create election") : `Next: ${STEPS[step + 1]}`;
  const secondaryLabel = step > 0 ? "Back" : editing ? "Cancel" : "Save draft";
  const onSecondary = step > 0 ? () => goTo(step - 1) : editing ? cancel : () => void save("secondary", 0);

  return (
    <div ref={topRef} className="scroll-mt-4 px-4 pb-16 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_23.75rem]">
        <div className="min-w-0">
          <Stepper steps={STEPS} current={step} reached={reached} onSelect={goTo} />

          <div key={step} className="mt-5 space-y-5 animate-in duration-300 fade-in slide-in-from-bottom-1 motion-reduce:animate-none">
            {step === 0 ? (
              <DetailsStep
                form={form}
                update={update}
                errors={detailsErrors}
                terms={catalog.terms}
                today={today}
                bannerUrl={bannerUrl}
                onBannerPick={(file) => setBannerUrl(file ? URL.createObjectURL(file) : null)}
                onBannerError={(message) => say(message, "error")}
              />
            ) : step === 1 ? (
              <VotersStep form={form} update={update} errors={votersErrors} careers={catalog.careers} programs={catalog.programs} eligible={eligible} />
            ) : step === 2 ? (
              <PositionsStep />
            ) : step === 3 ? (
              <AdminsStep />
            ) : (
              <ReviewStep form={form} terms={catalog.terms} careers={catalog.careers} eligible={eligible} onEdit={goTo} />
            )}
          </div>
        </div>

        <aside className="xl:sticky xl:top-6">
          <SummaryPanel
            form={form}
            bannerUrl={bannerUrl ?? election?.photoPath ?? null}
            eligible={eligible}
            badge={election ? `${election.status} · ${election.id}` : "Draft"}
            secondaryLabel={secondaryLabel}
            onSecondary={onSecondary}
            primaryLabel={primaryLabel}
            onPrimary={atEnd ? () => void save("primary", 1) : next}
            busy={busy}
            error={error}
          />
        </aside>
      </div>

      <Toast notice={notice} />
    </div>
  );
}
