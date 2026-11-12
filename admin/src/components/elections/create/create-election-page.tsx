"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { PageError, PageLoading, Toast, useNotice } from "@/components/shared/page-feedback";
import { todayIso } from "@/lib/dates";
import {
  careerLevels,
  countEligibleVoters,
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
import { getApiErrorMessage } from "@/services/api/error-message";
import { createElection, fetchVoterEnrollments, updateElection } from "@/services/elections/elections.service";
import { fetchCareers, fetchPrograms } from "@/services/programs/programs.service";
import { fetchTerms } from "@/services/terms/terms.service";
import type { ElectionInput, VoterEnrollment } from "@/types/election.types";
import type { Career, Program } from "@/types/program.types";
import type { Term } from "@/types/term.types";

import { Stepper } from "./create-election-ui";
import { AdminsStep, DetailsStep, PositionsStep, ReviewStep, VotersStep } from "./create-election-steps";
import { SummaryPanel } from "./summary-panel";

const STEPS = ["Details", "Who can vote", "Positions", "Admins", "Review"] as const;
const LAST_STEP = STEPS.length - 1;

interface Catalog {
  terms: Term[];
  careers: Career[];
  programs: Program[];
  enrollments: VoterEnrollment[];
}

type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; catalog: Catalog };

/** Loads what the form needs (terms, careers, programs, enrollments), then shows the wizard. */
export function CreateElectionPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  /**
   * Next.js keeps this page alive (hidden) after navigating away, form and all.
   * Bumped after an election is created so the next "New election" starts fresh at step 1;
   * an unfinished form is still kept if the admin leaves and comes back.
   */
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([fetchTerms({ signal }), fetchCareers({ signal }), fetchPrograms({ signal }), fetchVoterEnrollments({ signal })])
      .then(([terms, careers, programs, enrollments]) =>
        setState({
          status: "ready",
          catalog: { terms: sortTerms(terms), careers: sortCareers(careers), programs: sortProgramsByCode(programs), enrollments },
        }),
      )
      .catch((error: unknown) => {
        if (!signal.aborted) setState({ status: "error", message: getApiErrorMessage(error) });
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
  return <CreateElectionWizard key={formKey} catalog={state.catalog} onCreated={() => setFormKey((k) => k + 1)} />;
}

/** Starts on the current term (else the newest), every career and all their levels, all programs. */
function initialForm(catalog: Catalog, today: string): ElectionForm {
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

function toInput(form: ElectionForm): ElectionInput {
  return {
    title: form.title,
    description: form.description,
    rules: form.rules,
    // The API has no banner upload yet.
    photoPath: null,
    category: form.category,
    careerScope: form.careerScope,
    programScope: form.programScope,
    levelScope: form.levelScope,
    termId: form.termId!,
    startsAt: localToInstant(form.opensAt!),
    endsAt: localToInstant(form.closesAt!),
  };
}

function CreateElectionWizard({ catalog, onCreated }: { catalog: Catalog; onCreated: () => void }) {
  const router = useRouter();
  const [today] = useState(todayIso);
  const [form, setForm] = useState<ElectionForm>(() => initialForm(catalog, today));
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [detailsErrors, setDetailsErrors] = useState<DetailsErrors>({});
  const [votersErrors, setVotersErrors] = useState<VotersErrors>({});
  const [savedId, setSavedId] = useState<string | null>(null);
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

  /** Creates the election the first time, then updates the same one. */
  async function save(kind: "secondary" | "primary") {
    setBusy(kind);
    setError(null);
    try {
      const input = toInput(form);
      const saved = savedId ? await updateElection(savedId, input) : await createElection(input);
      setSavedId(saved.id);
      return saved;
    } catch (cause) {
      const message = getApiErrorMessage(cause);
      setError(message);
      say(message, "error");
      return null;
    } finally {
      setBusy(null);
    }
  }

  /** After saving (draft or final): clear the form and draft id, then show the election cards. */
  function backToList() {
    onCreated();
    router.push("/elections");
  }

  async function saveDraft() {
    if (!checkSteps(0)) return;
    const saved = await save("secondary");
    if (saved) backToList();
  }

  async function finish() {
    if (!checkSteps(1)) return;
    const saved = await save("primary");
    if (saved) backToList();
  }

  function next() {
    if (step === 0 && !checkSteps(0)) return;
    if (step === 1 && !checkSteps(1)) return;
    goTo(step + 1);
  }

  const primaryLabel = step === LAST_STEP ? "Create election" : `Next: ${STEPS[step + 1]}`;

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
            bannerUrl={bannerUrl}
            eligible={eligible}
            savedId={savedId}
            secondaryLabel={step === 0 ? "Save draft" : "Back"}
            onSecondary={step === 0 ? saveDraft : () => goTo(step - 1)}
            primaryLabel={primaryLabel}
            onPrimary={step === LAST_STEP ? finish : next}
            busy={busy}
            error={error}
          />
        </aside>
      </div>

      <Toast notice={notice} />
    </div>
  );
}
