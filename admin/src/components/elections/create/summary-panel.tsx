"use client";

import type { ReactNode } from "react";
import { Check, LoaderCircle } from "lucide-react";

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
  /** Which button is waiting for the API, if any. */
  busy: "secondary" | "primary" | null;
  error: string | null;
}

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
  busy,
  error,
}: SummaryPanelProps) {
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
            <span aria-hidden className="absolute -top-10 -right-8 size-36 rounded-full bg-white/6" />
          )}
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
              {pool.careers.map(({ career, total, levels, scale }) => (
                <div key={career.code} style={careerStyle(colors.get(career.code)!)} className={cn("rounded-[0.375rem] bg-[#f5f7fa] px-3 py-2.5 dark:bg-white/4", styles.fadeUp)}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <p className="text-[0.8125rem] font-medium text-foreground">{career.name}</p>
                    <p className="font-mono text-[0.6875rem] text-foreground">
                      <AnimatedNumber value={total} /> · {pool.total ? Math.round((total / pool.total) * 100) : 0}%
                    </p>
                  </div>
                  <ul className="space-y-1">
                    {levels.map(({ level, count, included }) => (
                      <li key={level} className={cn("flex items-center gap-3 transition-opacity duration-300", !included && "opacity-40")}>
                        <span className="w-18 shrink-0 text-[0.75rem] text-muted-foreground">{levelLabel(level, career)}</span>
                        <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[#e3e8ef] dark:bg-white/10">
                          <span
                            className="absolute inset-y-0 left-0 rounded-full bg-(--career) transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
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

        {/* Voting rules (from step 3 on) */}
        <Collapse open={step >= 2}>
          <div className={cn("mt-3.5 pt-3.5", divider)}>
            <SubHeading>Voting rules</SubHeading>
            <dl>
              <div className="flex items-start justify-between gap-4 py-1">
                <dt className="shrink-0 text-[0.8125rem] text-muted-foreground">Rules</dt>
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

        <div className={cn("mt-4 flex gap-2.5", step >= 1 && cn("pt-4", divider))}>
          <button type="button" onClick={onSecondary} disabled={busy !== null} className={cn(outlineButtonClassName, "justify-start")}>
            {busy === "secondary" ? <LoaderCircle aria-hidden className="mr-2 size-3.5 animate-spin" /> : null}
            {secondaryLabel}
          </button>
          <button type="button" onClick={onPrimary} disabled={busy !== null} className={cn(ctaButtonClassName, "min-w-0")}>
            {busy === "primary" ? <LoaderCircle aria-hidden className="mr-2 size-3.5 animate-spin" /> : null}
            <span key={primaryLabel} className={cn("truncate", styles.fadeUp)}>
              {primaryLabel}
            </span>
          </button>
        </div>

        {error ? (
          <p role="alert" className="mt-3 rounded-[0.25rem] border border-destructive/30 bg-destructive/5 px-3 py-2 text-[0.75rem] leading-4.5 text-destructive">
            {error}
          </p>
        ) : null}

        <Collapse open={step >= 1}>
          <p className="mt-4 text-[0.75rem] leading-4 text-muted-foreground">Voters, passcodes and OTP emails are generated after the election is created.</p>
        </Collapse>
      </div>
    </section>
  );
}
