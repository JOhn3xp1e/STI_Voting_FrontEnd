"use client";

import type { ReactNode } from "react";
import { ArrowRight, Check, LoaderCircle, Lock } from "lucide-react";

import { AnimatedNumber } from "@/components/students/animated-number";
import {
  formatDay,
  formatLevelScope,
  levelGroupLabel,
  levelLabel,
  levelPicks,
  programGroupLabel,
  programPicks,
  type ElectionForm,
  type ProgramsByCareer,
  type VoterPool,
} from "@/lib/elections";
import { cn } from "@/lib/utils";

import { CareerBadge, Collapse, careerStyle, cardClassName, ctaButtonClassName, outlineButtonClassName } from "./create-election-ui";
import { CANDIDACY_OPTIONS } from "./create-election-steps";
import styles from "./wizard.module.css";

interface SummaryPanelProps {
  form: ElectionForm;
  bannerUrl: string | null;
  pool: VoterPool;
  programs: ProgramsByCareer;
  colors: ReadonlyMap<string, string>;
  /** Current step (0 Details, 1 Who can vote, 2 Rules, 3 Review). */
  step: number;
  /** Furthest step reached. */
  reached: number;
  /** Header badge: "Draft", or "Draft · ELC-00016" when editing. */
  badge: string;
  secondaryLabel: string;
  onSecondary: () => void;
  primaryLabel: string;
  onPrimary: () => void;
  /** Editing an existing election (changes step 1's notes). */
  editing: boolean;
  /** Step 1's gold button: "Finalize election" (or "Save changes" when editing). */
  finalizeLabel: string;
  /** Finalize saves the whole election, so it unlocks once every step has been reached. */
  canFinalize: boolean;
  onFinalize: () => void;
  /** Which button is waiting for the API, if any. */
  busy: SummaryBusy;
  error: string | null;
}

export type SummaryBusy = "secondary" | "primary" | "finalize" | null;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-7.25 items-center justify-between gap-4">
      <dt className="shrink-0 text-[0.8125rem] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right font-mono text-[0.6875rem] text-foreground">{children}</dd>
    </div>
  );
}

function SubHeading({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h3 className="text-[0.8125rem] text-muted-foreground">{children}</h3>
      {aside}
    </div>
  );
}

/** Small filled pill in the career's color ("✓ BSIT"). */
function ScopePill({ children }: { children: ReactNode }) {
  return (
    <span className={cn("inline-flex h-5.5 items-center gap-1 rounded-full bg-(--career) px-2.5 text-[0.71875rem] font-medium whitespace-nowrap text-(--career-fg)", styles.fadeUp)}>
      <Check aria-hidden className="size-3" strokeWidth={2.6} />
      {children}
    </span>
  );
}

const divider = "border-t border-[#e2e8f0] dark:border-border";

/** Right-hand card: live preview of the election plus the step's buttons. */
export function SummaryPanel({
  form,
  bannerUrl,
  pool,
  programs,
  colors,
  step,
  reached,
  badge,
  secondaryLabel,
  onSecondary,
  primaryLabel,
  onPrimary,
  editing,
  finalizeLabel,
  canFinalize,
  onFinalize,
  busy,
  error,
}: SummaryPanelProps) {
  const first = step === 0;
  const spinner = <LoaderCircle aria-hidden className="mr-2 size-3.5 animate-spin" />;
  const primaryButton = (
    <button type="button" onClick={onPrimary} disabled={busy !== null} className={cn(ctaButtonClassName, "group/next min-w-0", first && "w-full justify-between")}>
      <span className="flex min-w-0 items-center">
        {busy === "primary" ? spinner : null}
        <span key={primaryLabel} className={cn("truncate", styles.fadeUp)}>
          {primaryLabel}
        </span>
      </span>
      {first ? (
        <ArrowRight aria-hidden className="ml-2 size-4 shrink-0 transition-transform duration-300 ease-out group-hover/next:translate-x-1 motion-reduce:transition-none" strokeWidth={2} />
      ) : null}
    </button>
  );

  return (
    <section aria-labelledby="summary-heading" className={cn(cardClassName, "shadow-[0_18px_40px_-30px_rgb(15_23_42/0.35)]")}>
      <header className="flex h-13.75 items-center justify-between gap-3 border-b border-[#e2e8f0] px-5 dark:border-border">
        <h2 id="summary-heading" className="font-mono text-[0.6875rem] font-semibold tracking-[0.16em] text-foreground uppercase">
          Summary
        </h2>
        <span className="inline-flex h-5.5 items-center rounded-[0.1875rem] border border-[#d5dbe3] px-2 font-mono text-[0.625rem] tracking-[0.08em] text-muted-foreground uppercase dark:border-border">
          {badge}
        </span>
      </header>

      <div className="px-5 pt-4.5 pb-5">
        {/* Banner preview */}
        <div className="relative flex h-27.5 flex-col justify-end overflow-hidden rounded-[0.25rem] bg-brand-blue px-3.5 pb-4">
          {bannerUrl ? (
            <>
              <span key={bannerUrl} aria-hidden className={cn("absolute inset-0 bg-cover bg-center", styles.bannerIn)} style={{ backgroundImage: `url("${bannerUrl}")` }} />
              <span aria-hidden className="absolute inset-0 bg-linear-to-t from-brand-navy/85 via-brand-navy/30 to-transparent" />
            </>
          ) : (
            <>
              {/* Two soft lights drifting slowly across the empty banner. */}
              <span aria-hidden className={cn("absolute -top-12 -right-10 size-40 rounded-full bg-white/8 blur-xl", styles.drift)} />
              <span aria-hidden className={cn("absolute -bottom-16 left-6 size-32 rounded-full bg-[#3b82f6]/30 blur-2xl", styles.driftSlow)} />
            </>
          )}
          {/* A light sweeps across when the category changes. */}
          <span key={`sheen-${form.category}`} aria-hidden className={cn("absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-linear-to-r from-transparent via-white/18 to-transparent", styles.sheen)} />
          <p key={form.category} className={cn("relative font-mono text-[0.625rem] tracking-[0.06em] text-brand-gold uppercase", styles.fadeUp)}>
            {form.category}
          </p>
          <p className="relative mt-1 truncate text-[1.125rem] leading-6 font-semibold text-white">{form.title.trim() || "Untitled election"}</p>
        </div>

        <dl className="mt-2">
          <Row label="Term">{form.termId ?? "—"}</Row>
          <Row label="Voting window">
            {form.opensAt && form.closesAt ? (
              <span key={`${form.opensAt}-${form.closesAt}`} className={cn("inline-block", styles.fadeUp)}>
                {formatDay(form.opensAt)} <span aria-label="to">→</span> {formatDay(form.closesAt)}
              </span>
            ) : (
              "Not set"
            )}
          </Row>
          <Row label="Eligible voters">
            {reached < 1 ? <span className="text-muted-foreground">Set in step 2</span> : form.termId ? <AnimatedNumber value={pool.total} /> : "—"}
          </Row>
        </dl>

        {/* Who can vote (from step 2 on) */}
        <Collapse open={step >= 1}>
          <div className={cn("mt-3 pt-3.5", divider)}>
            <SubHeading>Who can vote</SubHeading>
            {pool.careers.length ? (
              <div className="space-y-2">
                {pool.careers.map(({ career }) => {
                  const picks = programPicks(form, career, programs);
                  const levels = levelPicks(form, career);
                  const hasPrograms = (programs.get(career.code)?.length ?? 0) > 0;
                  return (
                    <div key={career.code} style={careerStyle(colors.get(career.code)!)} className={cn("flex flex-wrap items-center gap-1.5", styles.fadeUp)}>
                      <CareerBadge code={career.code} className="h-5.5 text-[0.65625rem]" />
                      {picks.length ? (
                        picks.map((code) => <ScopePill key={code}>{code}</ScopePill>)
                      ) : hasPrograms ? (
                        <ScopePill key="all-programs">All {programGroupLabel(career).toLowerCase()}</ScopePill>
                      ) : null}
                      <ScopePill key={levels.join(",") || "all-levels"}>
                        {levels.length ? formatLevelScope(levels, [career]) : `All ${levelGroupLabel(career).toLowerCase()}s`}
                      </ScopePill>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[0.8125rem] text-muted-foreground">No careers picked yet.</p>
            )}
          </div>
        </Collapse>

        {/* Voter pool breakdown (step 2 only) */}
        <Collapse open={step === 1 && pool.careers.length > 0}>
          <div className="mt-3.5">
            <SubHeading
              aside={
                <span className="text-[0.8125rem] font-medium text-foreground">
                  <AnimatedNumber value={pool.total} /> total
                </span>
              }
            >
              Voter pool breakdown
            </SubHeading>
            <div className="space-y-2">
              {pool.careers.every(({ total }) => total === 0) ? (
                <p className="text-[0.8125rem] text-muted-foreground">No students match yet.</p>
              ) : null}
              {/* Careers and levels with no students are left out. */}
              {pool.careers.filter(({ total }) => total > 0).map(({ career, total, levels, scale }) => (
                <div key={career.code} style={careerStyle(colors.get(career.code)!)} className={cn("rounded-[0.375rem] bg-[#f5f7fa] px-3 py-2.5 dark:bg-white/4", styles.fadeUp)}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <p className="text-[0.8125rem] font-medium text-foreground">{career.name}</p>
                    <p className="font-mono text-[0.6875rem] text-foreground">
                      <AnimatedNumber value={total} /> · {pool.total ? Math.round((total / pool.total) * 100) : 0}%
                    </p>
                  </div>
                  <ul className="space-y-1">
                    {levels.filter(({ count }) => count > 0).map(({ level, count, included }) => (
                      <li key={level} className={cn("flex items-center gap-3 transition-opacity duration-300", !included && "opacity-40")}>
                        <span className="w-18 shrink-0 text-[0.75rem] text-muted-foreground">{levelLabel(level, career)}</span>
                        <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[#e3e8ef] dark:bg-white/10">
                          <span
                            className={cn("absolute inset-y-0 left-0 rounded-full bg-(--career) transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none", styles.barGrow)}
                            style={{ width: `${(count / scale) * 100}%` }}
                          />
                        </span>
                        <AnimatedNumber value={count} className="w-9 shrink-0 text-right font-mono text-[0.6875rem] text-foreground tabular-nums" />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </Collapse>

        {/* Voting rules (step 3) */}
        <Collapse open={step === 2}>
          <div className={cn("mt-3.5 pt-3.5", divider)}>
            <SubHeading>Voting rules</SubHeading>
            <dl>
              <div className="flex items-start justify-between gap-4 py-1">
                <dt className="shrink-0 text-[0.8125rem] text-muted-foreground">Ballot</dt>
                <dd className="min-w-0 text-right text-[0.75rem] leading-5 break-words text-foreground">{form.rules.trim() || "—"}</dd>
              </div>
              {CANDIDACY_OPTIONS.map((option) => {
                const on = form[option.key];
                return (
                  <Row key={option.key} label={option.short}>
                    <span key={String(on)} className={cn("inline-block", styles.fadeUp, on ? "font-semibold text-brand-blue dark:text-[#7aa7e6]" : "text-muted-foreground")}>
                      {on ? "On" : "Off"}
                    </span>
                  </Row>
                );
              })}
            </dl>
          </div>
        </Collapse>

        {/* Admins (review) */}
        <Collapse open={step === 3}>
          <dl className={cn("mt-3.5 pt-2.5", divider)}>
            <Row label="Admins">
              <span className="text-muted-foreground">Add after creating</span>
            </Row>
          </dl>
        </Collapse>

        {first ? (
          // Step 1: Next on its own row, then Save draft | Finalize.
          <div key="buttons-first" className={cn("mt-4 space-y-2.5", styles.fadeUp)}>
            {primaryButton}
            <div className="grid grid-cols-2 gap-2.5">
              <button type="button" onClick={onSecondary} disabled={busy !== null} className={cn(outlineButtonClassName, "min-w-0 justify-start")}>
                {busy === "secondary" ? spinner : null}
                <span className="truncate">{secondaryLabel}</span>
              </button>
              <button
                type="button"
                onClick={onFinalize}
                disabled={!canFinalize || busy !== null}
                aria-describedby="summary-finalize-hint"
                className={cn(
                  "relative inline-flex h-8.5 min-w-0 cursor-pointer items-center justify-start overflow-hidden rounded-[0.25rem] px-4 text-[0.875rem] font-semibold outline-none",
                  "transition-[background-color,color,box-shadow,translate] duration-300 ease-out focus-visible:ring-3 focus-visible:ring-brand-gold/40",
                  canFinalize
                    ? "bg-brand-gold text-brand-navy shadow-[0_8px_18px_-12px_color-mix(in_oklab,var(--color-brand-gold)_90%,black)] hover:-translate-y-px hover:bg-[#ffcd33] active:translate-y-0 motion-reduce:hover:translate-y-0"
                    : "cursor-not-allowed bg-brand-gold/35 text-brand-navy/40 dark:bg-brand-gold/15 dark:text-brand-gold/45",
                  "disabled:pointer-events-none",
                )}
              >
                {busy === "finalize" ? spinner : !canFinalize ? <Lock aria-hidden className="mr-1.5 size-3.5 shrink-0" strokeWidth={2} /> : null}
                <span className="truncate">{finalizeLabel}</span>
                {/* A light runs across once when it unlocks. */}
                {canFinalize ? (
                  <span aria-hidden className={cn("pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-linear-to-r from-transparent via-white/55 to-transparent", styles.sheen)} />
                ) : null}
              </button>
            </div>
          </div>
        ) : (
          <div key="buttons-later" className={cn("mt-4 flex gap-2.5 pt-4", divider, styles.fadeUp)}>
            <button type="button" onClick={onSecondary} disabled={busy !== null} className={cn(outlineButtonClassName, "justify-start")}>
              {busy === "secondary" ? spinner : null}
              {secondaryLabel}
            </button>
            {primaryButton}
          </div>
        )}

        {error ? (
          <p role="alert" className="mt-3 rounded-[0.25rem] border border-destructive/30 bg-destructive/5 px-3 py-2 text-[0.75rem] leading-4.5 text-destructive animate-in fade-in slide-in-from-top-1 duration-300 motion-reduce:animate-none">
            {error}
          </p>
        ) : null}

        <p key={first ? "note-first" : "note-later"} id="summary-finalize-hint" className={cn("mt-3 text-[0.75rem] leading-4 text-muted-foreground", styles.fadeUp)}>
          {!first
            ? "Voters, passcodes and OTP emails are generated after the election is created."
            : editing
              ? "Finalize saves your changes and schedules the election: it turns Upcoming and its details lock. Save changes on Review keeps it a draft."
              : canFinalize
                ? "All 4 steps are complete. Finalize creates the election as Upcoming (it shows in the sidebar). Add its ballot before it opens."
                : "Finalize unlocks after all 4 steps are complete. Finalizing locks the details and schedules the election."}
        </p>
      </div>
    </section>
  );
}
  