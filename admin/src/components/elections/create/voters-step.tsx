"use client";

import { useState, type ReactNode } from "react";

import { errorClassName } from "@/components/shared/form-styles";
import { AnimatedNumber } from "@/components/students/animated-number";
import {
  careerLevels,
  levelGroupLabel,
  levelLabel,
  levelPicks,
  programGroupLabel,
  type ElectionForm,
  type ProgramsByCareer,
  type VoterPool,
  type VotersErrors,
} from "@/lib/elections";
import { cn } from "@/lib/utils";
import type { Career } from "@/types/program.types";

import { CareerBadge, Collapse, ScopeChip, SectionCard, careerStyle } from "./create-election-ui";

interface VotersStepProps {
  form: ElectionForm;
  update: (patch: Partial<ElectionForm>) => void;
  errors: VotersErrors;
  careers: readonly Career[];
  programs: ProgramsByCareer;
  pool: VoterPool;
  /** Color per career code. */
  colors: ReadonlyMap<string, string>;
}

const hintClassName = "ml-1.5 text-[0.8125rem] font-normal text-muted-foreground";

/** Step 2: pick careers, then narrow each one down by program and level. */
export function VotersStep({ form, update, errors, careers, programs, pool, colors }: VotersStepProps) {
  const anyPicked = careers.some((c) => form.careerScope.includes(c.code));

  function toggleCareer(code: string) {
    const on = form.careerScope.includes(code);
    // Keep career order; a career's program / level picks are kept, so turning it back on restores them.
    update({ careerScope: careers.filter((c) => (c.code === code ? !on : form.careerScope.includes(c.code))).map((c) => c.code) });
  }

  return (
    <SectionCard title="Who can vote" aside="filters build the voter list" bodyClassName="px-5 pt-4.5 pb-5">
      <div role="group" aria-labelledby="voters-careers">
        <p id="voters-careers" className="mb-2.5 text-[0.9375rem] font-medium text-foreground">
          Careers<span className={hintClassName}>choose one or more</span>
        </p>
        <div className="flex flex-wrap gap-3">
          {careers.map((career) => {
            const selected = form.careerScope.includes(career.code);
            return (
              <button
                key={career.code}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleCareer(career.code)}
                style={careerStyle(colors.get(career.code)!)}
                className={cn(
                  "flex h-11.5 w-full cursor-pointer items-center gap-2.5 rounded-[0.375rem] border bg-card pr-4 pl-3.5 text-left outline-none sm:w-60",
                  "transition-[border-color,box-shadow,scale] duration-300 ease-out active:scale-[0.98] motion-reduce:active:scale-100",
                  "focus-visible:ring-3 focus-visible:ring-brand-blue/25",
                  selected
                    ? "border-(--career) shadow-[0_0_0_3px_color-mix(in_oklab,var(--career)_18%,transparent),0_6px_16px_-10px_color-mix(in_oklab,var(--career)_70%,transparent)]"
                    : "border-[#e2e8f0] hover:border-[#c8d1dc] hover:shadow-[0_4px_12px_-8px_rgb(15_23_42/0.25)] dark:border-border dark:hover:border-white/25",
                )}
              >
                <CareerBadge code={career.code} muted={!selected} />
                <span className={cn("min-w-0 flex-1 truncate text-[0.875rem] font-medium transition-colors duration-300", selected ? "text-foreground" : "text-muted-foreground")}>
                  {career.name}
                </span>
                <AnimatedNumber value={pool.careerTotals.get(career.code) ?? 0} className="font-mono text-[0.75rem] text-muted-foreground tabular-nums" />
              </button>
            );
          })}
          {careers.length === 0 ? <p className="text-[0.8125rem] text-muted-foreground">No careers yet. Add them in Programs &amp; Careers.</p> : null}
        </div>
        {errors.careerScope ? <p className={errorClassName}>{errors.careerScope}</p> : null}
      </div>

      <div className="mt-5">
        <p className="text-[0.9375rem] font-medium text-foreground">
          Narrow it down<span className={hintClassName}>only for the careers you picked</span>
        </p>

        <Collapse open={!anyPicked}>
          <p className="mt-2.5 rounded-[0.375rem] border border-dashed border-[#d5dbe3] px-4 py-5 text-center text-[0.8125rem] text-muted-foreground dark:border-border">
            Pick a career above to narrow it down by program and level.
          </p>
        </Collapse>

        {careers.map((career) => (
          <Collapse key={career.code} open={form.careerScope.includes(career.code)}>
            <div className="pt-2.5">
              <CareerNarrow
                career={career}
                form={form}
                update={update}
                own={programs.get(career.code) ?? []}
                total={pool.careers.find((p) => p.career.code === career.code)?.total ?? null}
                color={colors.get(career.code)!}
              />
            </div>
          </Collapse>
        ))}
      </div>

      <div className="mt-4 flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-[0.375rem] border border-[#e2e8f0] px-4 py-2 dark:border-border">
        <p className="text-[0.875rem] font-medium text-foreground">
          <AnimatedNumber value={pool.total} className="tabular-nums" /> {pool.total === 1 ? "student matches" : "students match"}
        </p>
        <p className="min-w-0 truncate font-mono text-[0.6875rem] text-muted-foreground">
          {pool.careers.length > 1 ? `${pool.careers.map((p) => `${p.total.toLocaleString()} ${p.career.name}`).join(" + ")} · ` : null}
          {form.termId ?? "no term"}
        </p>
        <p className="sr-only" aria-live="polite">
          {pool.total} {pool.total === 1 ? "student matches" : "students match"}
        </p>
      </div>
    </SectionCard>
  );
}

/* -------------------------------------------------------------------------- */
/*                         One career's program / levels                      */
/* -------------------------------------------------------------------------- */

interface CareerNarrowProps {
  career: Career;
  form: ElectionForm;
  update: (patch: Partial<ElectionForm>) => void;
  /** The career's program codes. */
  own: readonly string[];
  /** Its students who can vote, or `null` while it isn't picked. */
  total: number | null;
  color: string;
}

function CareerNarrow({ career, form, update, own, total, color }: CareerNarrowProps) {
  // Keep the last count while the box closes, rather than jumping to 0.
  const [shownTotal, setShownTotal] = useState(total ?? 0);
  if (total !== null && total !== shownTotal) setShownTotal(total);

  const levels = careerLevels(career);
  const programs = own.filter((code) => form.programScope.includes(code));
  const pickedLevels = levelPicks(form, career);

  /**
   * "All" (no picks) shows every chip highlighted, so a chip toggles from there too:
   * clicking one under "All" leaves out just that one. Picking none or every one means "All".
   */
  function nextPicks<T>(all: readonly T[], picks: readonly T[], value: T): T[] {
    const current = picks.length === 0 ? all : picks;
    const next = current.includes(value) ? current.filter((p) => p !== value) : [...current, value];
    return next.length === all.length ? [] : all.filter((x) => next.includes(x));
  }

  function setPrograms(next: readonly string[]) {
    update({ programScope: [...form.programScope.filter((code) => !own.includes(code)), ...next] });
  }

  function setLevels(next: readonly number[]) {
    update({ levelScope: [...form.levelScope.filter((level) => !levels.includes(level)), ...next].sort((a, b) => a - b) });
  }

  return (
    <div style={careerStyle(color)} className="rounded-[0.375rem] border border-[#e2e8f0] px-4 pt-3.5 pb-4 dark:border-border">
      <div className="flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2">
          <CareerBadge code={career.code} />
          <span className="truncate text-[0.8125rem] text-muted-foreground">· {career.name}</span>
        </p>
        <p className="shrink-0 text-[0.8125rem] font-medium text-foreground">
          <AnimatedNumber value={shownTotal} className="tabular-nums" /> {shownTotal === 1 ? "student" : "students"}
        </p>
      </div>

      {own.length ? (
        <ChipGroup id={`narrow-${career.code}-programs`} label={programGroupLabel(career)}>
          <ScopeChip selected={programs.length === 0} onClick={() => setPrograms([])}>
            All
          </ScopeChip>
          {own.map((code) => (
            <ScopeChip key={code} selected={programs.length === 0 || programs.includes(code)} onClick={() => setPrograms(nextPicks(own, programs, code))}>
              {code}
            </ScopeChip>
          ))}
        </ChipGroup>
      ) : null}

      {levels.length ? (
        <ChipGroup id={`narrow-${career.code}-levels`} label={levelGroupLabel(career)}>
          <ScopeChip selected={pickedLevels.length === 0} onClick={() => setLevels([])}>
            All
          </ScopeChip>
          {levels.map((level) => (
            <ScopeChip key={level} selected={pickedLevels.length === 0 || pickedLevels.includes(level)} onClick={() => setLevels(nextPicks(levels, pickedLevels, level))}>
              {levelLabel(level, career)}
            </ScopeChip>
          ))}
        </ChipGroup>
      ) : null}

      {!own.length && !levels.length ? (
        <p className="mt-3 text-[0.8125rem] text-muted-foreground">Every {career.name} student enrolled in the term can vote.</p>
      ) : null}
    </div>
  );
}

function ChipGroup({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div role="group" aria-labelledby={id} className="mt-3.5">
      <p id={id} className="mb-2 text-[0.8125rem] text-foreground">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
