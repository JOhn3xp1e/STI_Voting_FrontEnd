"use client";

import { useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { LoaderCircle, Minus, Plus, X } from "lucide-react";

import { CareerBadge, Collapse, ScopeChip, careerStyle } from "@/components/elections/create/create-election-ui";
import { DialogFrame, dialogPrimaryClassName } from "@/components/shared/dialog-frame";
import { errorClassName, fieldClassName, labelClassName } from "@/components/shared/form-styles";
import { toolbarButtonClassName } from "@/components/students/student-toolbar-styles";
import {
  MAX_SEATS,
  everyoneScope,
  levelPicksOf,
  narrowSummary,
  positionScopeToApi,
  programPicksOf,
  resolveScope,
  scopeCareers,
  scopeSummary,
  togglePick,
  validatePosition,
  type PositionErrors,
  type PositionForm,
  type PositionScopeForm,
  type ScopeCareer,
} from "@/lib/ballot";
import { levelGroupLabel, levelLabel, programGroupLabel } from "@/lib/elections";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/services/api/error-message";
import { createPosition } from "@/services/ballot/ballot.service";
import type { Position } from "@/types/ballot.types";
import type { Election, VoterEnrollment } from "@/types/election.types";
import type { Career } from "@/types/program.types";

const EMPTY_FORM: PositionForm = { title: "", seats: "1" };

const inputClassName = cn(fieldClassName, "rounded-lg border-[#e4e8f0] dark:border-border");

/** The square − / + beside the seat number. */
const stepButtonClassName = cn(
  toolbarButtonClassName,
  "size-10 shrink-0 justify-center rounded-lg px-0 text-foreground active:scale-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100",
  "transition-[background-color,border-color,color,scale] motion-reduce:active:scale-100",
);

const sectionHintClassName = "ml-1.5 text-[0.71875rem] font-normal text-muted-foreground";

interface CreatePositionDialogProps {
  open: boolean;
  electionId: string;
  /** The election's positions, to catch a repeated title before the API does. */
  positions: readonly Position[];
  /**
   * For "Who can vote". Without the election or the careers the section is left out and
   * the position is open to everyone the election allows.
   */
  election: Election | null;
  careers: readonly Career[] | null;
  /** For the voter count on each career (left out when `null`). */
  enrollments: readonly VoterEnrollment[] | null;
  onClose: () => void;
  onCreated: (position: Position) => void;
}

/**
 * "1 · Create position": a name, how many seats it has, and who can vote for it
 * (careers, then programs and levels per career). Candidates are added to it afterwards.
 */
export function CreatePositionDialog({ open, electionId, positions, election, careers, enrollments, onClose, onCreated }: CreatePositionDialogProps) {
  const options = useMemo(() => (election && careers ? scopeCareers(election, careers, enrollments) : []), [election, careers, enrollments]);
  const scoped = options.length > 0;

  const [form, setForm] = useState<PositionForm>(EMPTY_FORM);
  const [scope, setScope] = useState<PositionScopeForm>(() => everyoneScope(options));
  const [errors, setErrors] = useState<PositionErrors>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** What `resolveScope` changed on the last click, e.g. "Level picks cleared: …". */
  const [scopeNote, setScopeNote] = useState<string | null>(null);
  const seatsRef = useRef<HTMLInputElement>(null);

  // Start fresh each time the dialog opens: no name, one seat, every career.
  const [openedFor, setOpenedFor] = useState(open);
  if (open !== openedFor) {
    setOpenedFor(open);
    if (open) {
      setForm(EMPTY_FORM);
      setScope(everyoneScope(options));
      setScopeNote(null);
      setErrors({});
      setError(null);
    }
  }

  const mapped = scoped ? positionScopeToApi(scope, options) : null;
  const scopeError = mapped && "error" in mapped ? mapped.error : null;
  const summary = scoped ? scopeSummary(scope, options, careers ?? []) : null;

  function update(patch: Partial<PositionForm>) {
    const next = { ...form, ...patch };
    setForm(next);
    if (Object.keys(errors).length) setErrors(validatePosition(next, positions));
    setError(null);
  }

  /** Applies a change, then settles any clash with careers that have no programs / levels (the latest click wins). */
  function updateScope(patch: Partial<PositionScopeForm>) {
    const resolved = resolveScope(scope, { ...scope, ...patch }, options);
    setScope(resolved.scope);
    setScopeNote(resolved.note);
    setError(null);
  }

  function toggleCareer(code: string) {
    const on = scope.careers.includes(code);
    // Keep career order; a career's program / level picks stay, so turning it back on restores them.
    updateScope({ careers: options.filter((o) => (o.career.code === code ? !on : scope.careers.includes(o.career.code))).map((o) => o.career.code) });
  }

  const seats = Number(form.seats);
  const seatsValid = Number.isInteger(seats);

  /** − / +: steps the seat number within 1…MAX_SEATS, with a small nudge on the number. */
  function step(delta: 1 | -1) {
    const next = Math.min(MAX_SEATS, Math.max(1, (seatsValid ? seats : 1) + delta));
    update({ seats: String(next) });
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      seatsRef.current?.animate(
        [{ transform: `translateY(${delta > 0 ? -3 : 3}px)`, opacity: 0.55 }, { transform: "translateY(0)", opacity: 1 }],
        { duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      );
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found = validatePosition(form, positions);
    setErrors(found);
    if (Object.keys(found).length || scopeError) return;
    setSaving(true);
    setError(null);
    try {
      const lists = mapped && "lists" in mapped ? mapped.lists : undefined;
      const created = await createPosition({ title: form.title, maxVotes: Number(form.seats), electionId, ...lists });
      onCreated(created);
      onClose();
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  const canNarrow = options.some((o) => o.programs.length > 1 || o.levels.length > 1);
  const anyPicked = options.some((o) => scope.careers.includes(o.career.code));

  return (
    <DialogFrame open={open} onOpenChange={(next) => !next && onClose()} locked={saving} widthClassName="w-[min(30rem,calc(100vw-2rem))]">
      <form onSubmit={(e) => void submit(e)} noValidate>
        <div className="flex h-12.5 items-center justify-between gap-3 border-b border-[#e4e8f0] pr-3 pl-5 dark:border-border">
          <Dialog.Title className="font-mono text-[0.75rem] font-medium tracking-[0.14em] text-foreground uppercase">1 · Create position</Dialog.Title>
          <Dialog.Close
            aria-label="Close"
            disabled={saving}
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-wait disabled:opacity-50"
          >
            <X aria-hidden className="size-4" />
          </Dialog.Close>
        </div>

        <div className="space-y-3 px-5 pt-4 pb-5">
          <Dialog.Description className="text-[0.8125rem] leading-5 text-foreground/85">Create a position before assigning candidates.</Dialog.Description>

          <div>
            <label htmlFor="position-title" className={labelClassName}>
              Position name
            </label>
            <input
              id="position-title"
              autoFocus
              value={form.title}
              onChange={(e) => update({ title: e.target.value })}
              placeholder="e.g. Vice President"
              maxLength={100}
              aria-invalid={!!errors.title || undefined}
              aria-describedby={errors.title ? "position-title-error" : undefined}
              className={inputClassName}
            />
            {errors.title ? (
              <p id="position-title-error" className={cn(errorClassName, "animate-in duration-200 fade-in slide-in-from-top-0.5 motion-reduce:animate-none")}>
                {errors.title}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="position-seats" className={labelClassName}>
              Seat number
            </label>
            <div className="flex items-center gap-2">
              <input
                ref={seatsRef}
                id="position-seats"
                type="text"
                inputMode="numeric"
                value={form.seats}
                onChange={(e) => update({ seats: e.target.value.replace(/\D/g, "").slice(0, 2) })}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                    e.preventDefault();
                    step(e.key === "ArrowUp" ? 1 : -1);
                  }
                }}
                aria-invalid={!!errors.seats || undefined}
                aria-describedby={errors.seats ? "position-seats-error" : "position-seats-hint"}
                className={cn(inputClassName, "min-w-0 flex-1 tabular-nums")}
              />
              <button type="button" onClick={() => step(-1)} disabled={seatsValid && seats <= 1} aria-label="One seat fewer" className={stepButtonClassName}>
                <Minus aria-hidden className="size-4" strokeWidth={2} />
              </button>
              <button type="button" onClick={() => step(1)} disabled={seatsValid && seats >= MAX_SEATS} aria-label="One seat more" className={stepButtonClassName}>
                <Plus aria-hidden className="size-4" strokeWidth={2} />
              </button>
            </div>
            <p
              id={errors.seats ? "position-seats-error" : "position-seats-hint"}
              className={errors.seats ? cn(errorClassName, "animate-in duration-200 fade-in motion-reduce:animate-none") : "mt-1.5 text-[0.6875rem] leading-4 text-muted-foreground"}
            >
              {errors.seats ?? "How many candidates each voter can pick for this position."}
            </p>
          </div>

          {scoped ? (
            <div className="space-y-2.5">
              <div aria-hidden className="h-px bg-[#e2e8f0] dark:bg-border" />

              <div role="group" aria-labelledby="position-scope-careers">
                <p id="position-scope-careers" className="mb-2.5 text-[0.8125rem] font-medium text-foreground">
                  Who can vote<span className={sectionHintClassName}>for this position</span>
                </p>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-2.5">
                  {options.map((option) => (
                    <CareerTile key={option.career.code} option={option} selected={scope.careers.includes(option.career.code)} onToggle={() => toggleCareer(option.career.code)} />
                  ))}
                </div>
                {options.length > 1 ? (
                  <p className="mt-2.5 text-[0.71875rem] text-muted-foreground">
                    Pick {options.length === 2 ? "both" : "every career"} for positions everyone votes on, like President.
                  </p>
                ) : null}
              </div>

              {canNarrow ? (
                <div>
                  <p className="text-[0.8125rem] font-medium text-foreground">
                    Narrow it down<span className={sectionHintClassName}>only for the careers you picked</span>
                  </p>
                  <Collapse open={!anyPicked}>
                    <p className="mt-2.5 rounded-lg border border-dashed border-[#d5dbe3] px-4 py-4 text-center text-[0.75rem] text-muted-foreground dark:border-border">
                      Pick a career above to narrow it down.
                    </p>
                  </Collapse>
                  {options.map((option) => (
                    <Collapse key={option.career.code} open={scope.careers.includes(option.career.code)}>
                      <div className="pt-2.5">
                        <CareerNarrow option={option} scope={scope} careers={careers ?? []} onChange={updateScope} />
                      </div>
                    </Collapse>
                  ))}
                </div>
              ) : null}

              {scopeNote ? (
                <p
                  key={scopeNote}
                  role="status"
                  className="animate-in rounded-lg bg-brand-gold/12 px-3.5 py-2.5 text-[0.75rem] leading-[1.125rem] text-foreground duration-200 fade-in motion-reduce:animate-none"
                >
                  {scopeNote}
                </p>
              ) : null}

              {scopeError ? (
                <p role="alert" className="animate-in rounded-lg bg-destructive/8 px-3.5 py-2.5 text-[0.75rem] leading-[1.125rem] text-destructive duration-200 fade-in motion-reduce:animate-none">
                  {scopeError}
                </p>
              ) : summary ? (
                <div className="flex min-h-10 flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border border-[#e4e8f0] px-3.5 py-2.5 dark:border-border" aria-live="polite">
                  <p className="text-[0.8125rem] font-medium text-foreground">{summary.title}</p>
                  <p className="ml-auto min-w-0 text-right text-[0.65625rem] text-muted-foreground">{summary.detail}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="animate-in rounded-md bg-destructive/8 px-3 py-2 text-[0.8125rem] text-destructive duration-200 fade-in motion-reduce:animate-none">
              {error}
            </p>
          ) : null}

          <button type="submit" disabled={saving} className={cn(dialogPrimaryClassName, "inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg")}>
            {saving ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}
            {saving ? "Creating…" : "Create position"}
          </button>
        </div>
      </form>
    </DialogFrame>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 Career tile                                */
/* -------------------------------------------------------------------------- */

function CareerTile({ option, selected, onToggle }: { option: ScopeCareer; selected: boolean; onToggle: () => void }) {
  const { career, voters } = option;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      style={careerStyle(option.color)}
      className={cn(
        "flex min-h-12 cursor-pointer items-center gap-2.5 rounded-lg border-[1.5px] px-3.5 py-3 text-left outline-none",
        "transition-[border-color,background-color,box-shadow,scale] duration-200 ease-out active:scale-[0.98] motion-reduce:active:scale-100",
        "focus-visible:ring-3 focus-visible:ring-brand-blue/25",
        selected
          ? "border-foreground bg-[#f8fafc] dark:bg-white/6"
          : "border-[#e4e8f0] bg-card hover:border-[#c8d1dc] dark:border-border dark:hover:border-white/25",
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <CareerBadge code={career.code} className="h-5 rounded-md text-[0.65625rem] font-normal" />
        <span className="truncate text-[0.8125rem] font-medium text-foreground">{career.name}</span>
      </span>
      {voters !== null ? (
        <span className="shrink-0 text-[0.71875rem] text-muted-foreground tabular-nums">
          {voters.toLocaleString("en-US")}
          <span className="sr-only"> {voters === 1 ? "voter" : "voters"}</span>
        </span>
      ) : null}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*                        One career's programs / levels                      */
/* -------------------------------------------------------------------------- */

interface CareerNarrowProps {
  option: ScopeCareer;
  scope: PositionScopeForm;
  careers: readonly Career[];
  onChange: (patch: Partial<PositionScopeForm>) => void;
}

/** "All" is its own pill here: picking a program picks just that one, and "All" clears the picks. */
function CareerNarrow({ option, scope, careers, onChange }: CareerNarrowProps) {
  const { career, programs, levels } = option;
  const pickedPrograms = programPicksOf(option, scope);
  const pickedLevels = levelPicksOf(option, scope);
  const narrowed = narrowSummary(option, scope, careers);

  const setPrograms = (next: readonly string[]) => onChange({ programs: [...scope.programs.filter((code) => !programs.includes(code)), ...next] });
  const setLevels = (next: readonly number[]) =>
    onChange({ levels: [...scope.levels.filter((level) => !levels.includes(level)), ...next].sort((a, b) => a - b) });

  return (
    <div style={careerStyle(option.color)} className="rounded-lg border border-[#e4e8f0] bg-card px-4 py-3.5 dark:border-border">
      <div className="flex items-center gap-1.5">
        <CareerBadge code={career.code} className="h-5 rounded-md text-[0.65625rem] font-normal" />
        <span className="min-w-0 truncate text-[0.6875rem] text-muted-foreground">· {career.name}</span>
        <span className={cn("ml-auto shrink-0 pl-2 text-[0.71875rem]", narrowed ? "font-medium text-foreground" : "text-muted-foreground")}>{narrowed ?? "Everyone"}</span>
      </div>

      {programs.length > 1 ? (
        <PillGroup id={`position-${career.code}-programs`} label={programGroupLabel(career)}>
          <ScopeChip selected={pickedPrograms.length === 0} onClick={() => setPrograms([])}>
            All
          </ScopeChip>
          {programs.map((code) => (
            <ScopeChip key={code} selected={pickedPrograms.includes(code)} onClick={() => setPrograms(togglePick(programs, pickedPrograms, code))}>
              {code}
            </ScopeChip>
          ))}
        </PillGroup>
      ) : null}

      {levels.length > 1 ? (
        <PillGroup id={`position-${career.code}-levels`} label={levelGroupLabel(career)}>
          <ScopeChip selected={pickedLevels.length === 0} onClick={() => setLevels([])}>
            All
          </ScopeChip>
          {levels.map((level) => (
            <ScopeChip key={level} selected={pickedLevels.includes(level)} onClick={() => setLevels(togglePick(levels, pickedLevels, level))}>
              {levelLabel(level, career)}
            </ScopeChip>
          ))}
        </PillGroup>
      ) : null}

      {programs.length <= 1 && levels.length <= 1 ? (
        <p className="mt-3 text-[0.75rem] text-muted-foreground">Every {career.name} student in this election can vote.</p>
      ) : null}
    </div>
  );
}

function PillGroup({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div role="group" aria-labelledby={id} className="mt-3.5">
      <p id={id} className="mb-2 text-[0.75rem] font-medium text-foreground">
        {label}
      </p>
      <div className="flex flex-wrap gap-x-1.5 gap-y-2">{children}</div>
    </div>
  );
}
