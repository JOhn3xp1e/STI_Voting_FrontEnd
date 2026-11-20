"use client";

import { useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import { ImageUp, Lock, RefreshCw, X } from "lucide-react";

import { errorClassName, fieldClassName, labelClassName } from "@/components/shared/form-styles";
import { Switch } from "@/components/settings/settings-ui";
import { Caret, OptionMenu } from "@/components/students/option-menu";
import { AnimatedNumber } from "@/components/students/animated-number";
import {
  formatDayTime,
  formatLevelScope,
  levelGroupLabel,
  levelLabel,
  levelPicks,
  programGroupLabel,
  programPicks,
  type CareerPool,
  type DetailsErrors,
  type ElectionForm,
  type ProgramsByCareer,
  type VoterPool,
} from "@/lib/elections";
import type { IsoDate } from "@/lib/dates";
import { formatAcadYear } from "@/lib/terms";
import { cn } from "@/lib/utils";
import { ELECTION_CATEGORIES, type CandidacySettings } from "@/types/election.types";
import type { Term } from "@/types/term.types";

import { CareerBadge, DateTimePicker, ReviewRow, SectionCard, cardClassName, careerStyle } from "./create-election-ui";
import styles from "./wizard.module.css";

const inputClassName = cn(fieldClassName, "rounded-[0.25rem] border-[#e2e8f0] dark:border-border");

/** "TRM-00004 · 2025–2026 Term 1" */
export function termOptionLabel(term: Term): string {
  return `${term.id} · ${formatAcadYear(term.acadYear)} Term ${term.termNumber}`;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className={errorClassName}>
      {message}
    </p>
  ) : null;
}

/* -------------------------------------------------------------------------- */
/*                               Step 1: Details                              */
/* -------------------------------------------------------------------------- */

/** Same limits as the election endpoints in SLVP-BE (5 MB; JPG, PNG or WebP). */
const MAX_BANNER_BYTES = 5 * 1024 * 1024;
const BANNER_TYPES = ["image/png", "image/jpeg", "image/webp"];

interface BannerDropzoneProps {
  previewUrl: string | null;
  onPick: (file: File | null) => void;
  onError: (message: string) => void;
}

/** Banner picker. The picked image is previewed here and uploaded with the election when it's saved. */
function BannerDropzone({ previewUrl, onPick, onError }: BannerDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function accept(file: File | undefined) {
    if (!file) return;
    if (!BANNER_TYPES.includes(file.type)) return onError("Use a PNG, JPG or WebP image.");
    if (file.size > MAX_BANNER_BYTES) return onError("The image is over 5 MB.");
    onPick(file);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    accept(event.dataTransfer.files[0]);
  }

  const overlayButtonClassName =
    "inline-flex h-7.5 cursor-pointer items-center gap-1.5 rounded-full bg-black/45 px-3 text-[0.75rem] font-medium text-white outline-none backdrop-blur-sm transition-colors hover:bg-black/65 focus-visible:ring-2 focus-visible:ring-white/70";

  return (
    <SectionCard title="Banner" aside="shown on voter home and election cards" bodyClassName="p-5">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "relative flex h-37.5 items-center justify-center overflow-hidden rounded-[0.375rem] text-center",
          "transition-[border-color,background-color,box-shadow] duration-250",
          previewUrl
            ? "border border-transparent"
            : dragging
              ? "border border-dashed border-brand-blue/70 bg-brand-blue/5 shadow-[inset_0_0_0_3px_color-mix(in_oklab,var(--color-brand-blue)_8%,transparent)]"
              : "border border-dashed border-[#d5dbe3] hover:border-brand-blue/40 hover:bg-[#f8fafc] dark:border-white/15 dark:hover:bg-white/3",
        )}
      >
        {previewUrl ? (
          <>
            {/* key: replays the entrance when another image is picked */}
            <span
              key={previewUrl}
              aria-hidden
              className={cn("absolute inset-0 bg-cover bg-center", styles.bannerIn)}
              style={{ backgroundImage: `url("${previewUrl}")` }}
            />
            <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/60 to-transparent px-3.5 pt-8 pb-2.5 text-left font-mono text-[0.65625rem] text-white/85">
              Uploads when you save
            </span>
            <div className="absolute top-2.5 right-2.5 flex gap-1.5">
              <button type="button" onClick={() => inputRef.current?.click()} className={overlayButtonClassName}>
                <RefreshCw aria-hidden className="size-3" />
                Replace
              </button>
              <button type="button" onClick={() => onPick(null)} aria-label="Remove banner" className={cn(overlayButtonClassName, "w-7.5 justify-center px-0")}>
                <X aria-hidden className="size-3.5" />
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="group/drop flex h-full w-full cursor-pointer flex-col items-center justify-center outline-none focus-visible:ring-3 focus-visible:ring-brand-blue/15"
          >
            <span
              aria-hidden
              className={cn(
                "flex size-10 items-center justify-center rounded-[0.5rem] bg-brand-blue/8 text-brand-blue transition-[transform,background-color] duration-300 ease-out",
                "group-hover/drop:-translate-y-0.5 group-hover/drop:bg-brand-blue/12 dark:bg-white/8 dark:text-[#7aa7e6]",
                dragging && styles.dropHover,
              )}
            >
              <ImageUp className="size-5" strokeWidth={1.75} />
            </span>
            <span className="mt-3 text-[0.875rem] font-medium text-foreground">
              {dragging ? (
                "Drop it here"
              ) : (
                <>
                  Drop a banner image or{" "}
                  <span className="underline-offset-2 transition-colors group-hover/drop:text-brand-blue group-hover/drop:underline dark:group-hover/drop:text-[#7aa7e6]">
                    browse
                  </span>
                </>
              )}
            </span>
            <span className="mt-1 font-mono text-[0.65625rem] text-muted-foreground">
              1600 × 500 <span aria-hidden>·</span> PNG, JPG or WebP <span aria-hidden>·</span> up to 5 MB
            </span>
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={BANNER_TYPES.join(",")}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            accept(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
    </SectionCard>
  );
}

interface DetailsStepProps {
  form: ElectionForm;
  update: (patch: Partial<ElectionForm>) => void;
  errors: DetailsErrors;
  terms: readonly Term[];
  today: IsoDate;
  bannerUrl: string | null;
  onBannerPick: (file: File | null) => void;
  onBannerError: (message: string) => void;
}

export function DetailsStep({ form, update, errors, terms, today, bannerUrl, onBannerPick, onBannerError }: DetailsStepProps) {
  const term = terms.find((t) => t.id === form.termId);

  return (
    <>
      <BannerDropzone previewUrl={bannerUrl} onPick={onBannerPick} onError={onBannerError} />

      <SectionCard title="Details" aside="step 1 of 4">
        <div className="grid grid-cols-1 gap-x-3 gap-y-3.5 sm:grid-cols-2">
          <div>
            <label htmlFor="election-title" className={labelClassName}>
              Title
            </label>
            <input
              id="election-title"
              value={form.title}
              onChange={(e) => update({ title: e.target.value })}
              placeholder="e.g. CSC Elections 2026–2027"
              maxLength={150}
              aria-invalid={!!errors.title || undefined}
              aria-describedby={errors.title ? "election-title-error" : undefined}
              className={inputClassName}
            />
            <FieldError id="election-title-error" message={errors.title} />
          </div>

          <div>
            <span id="election-category-label" className={labelClassName}>
              Category
            </span>
            <OptionMenu
              label="Category"
              value={form.category}
              options={ELECTION_CATEGORIES.map((c) => ({ value: c, label: c }))}
              onChange={(value) => value && update({ category: value })}
              triggerClassName={cn(inputClassName, "cursor-pointer gap-1")}
            >
              {form.category}
              <Caret />
            </OptionMenu>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="election-description" className={labelClassName}>
              Description
            </label>
            <textarea
              id="election-description"
              value={form.description}
              onChange={(e) => update({ description: e.target.value })}
              placeholder="What this election is for"
              maxLength={1000}
              rows={4}
              aria-invalid={!!errors.description || undefined}
              aria-describedby={errors.description ? "election-description-error" : undefined}
              className={cn(inputClassName, "h-auto min-h-26.5 resize-y py-2.5 leading-5.5")}
            />
            <FieldError id="election-description-error" message={errors.description} />
          </div>

          <div className="sm:col-span-2">
            <span className={labelClassName}>Term</span>
            <OptionMenu<string>
              label="Term"
              value={form.termId}
              options={terms.map((t) => ({ value: t.id, label: termOptionLabel(t) }))}
              onChange={(value) => value && update({ termId: value })}
              invalid={!!errors.termId}
              triggerClassName={cn(inputClassName, "cursor-pointer gap-1")}
            >
              <span className={cn("truncate", !term && "text-muted-foreground")}>{term ? termOptionLabel(term) : terms.length ? "Pick a term" : "No terms yet"}</span>
              <Caret />
            </OptionMenu>
            <FieldError id="election-term-error" message={errors.termId} />
          </div>

          <div>
            <label htmlFor="election-opens" className={labelClassName}>
              Opens
            </label>
            <DateTimePicker
              id="election-opens"
              label="Voting opens"
              value={form.opensAt}
              onChange={(value) => update({ opensAt: value })}
              today={today}
              defaultTime="08:00"
              invalid={!!errors.opensAt}
              describedBy={errors.opensAt ? "election-opens-error" : undefined}
            />
            <FieldError id="election-opens-error" message={errors.opensAt} />
          </div>

          <div>
            <label htmlFor="election-closes" className={labelClassName}>
              Closes
            </label>
            <DateTimePicker
              id="election-closes"
              label="Voting closes"
              value={form.closesAt}
              onChange={(value) => update({ closesAt: value })}
              today={today}
              defaultTime="17:00"
              min={form.opensAt?.slice(0, 10) ?? null}
              invalid={!!errors.closesAt}
              describedBy={errors.closesAt ? "election-closes-error" : undefined}
            />
            <FieldError id="election-closes-error" message={errors.closesAt} />
          </div>
        </div>
      </SectionCard>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Step 3: Rules                               */
/* -------------------------------------------------------------------------- */

export const CANDIDACY_OPTIONS: { key: keyof CandidacySettings; title: string; short: string; hint: string }[] = [
  {
    key: "openCandidacy",
    title: "Open candidacy",
    short: "Open candidacy",
    hint: "Any student can run. Off: candidates must be within this election’s careers, programs and levels.",
  },
  {
    key: "crossPositionCandidacy",
    title: "Run for more than one position",
    short: "More than one position",
    hint: "A student can be a candidate for several positions, once per position. Off: one position per student.",
  },
  {
    key: "requireActiveEnrollment",
    title: "Require active enrollment",
    short: "Active enrollment required",
    hint: "Candidates need an Active enrollment in this election’s term.",
  },
];

interface RulesStepProps {
  form: ElectionForm;
  update: (patch: Partial<ElectionForm>) => void;
  /** Editing an existing election: the candidacy settings are fixed. */
  locked: boolean;
}

export function RulesStep({ form, update, locked }: RulesStepProps) {
  return (
    <>
      <SectionCard title="Voting rules" aside="step 3 of 4">
        <label htmlFor="election-rules" className={labelClassName}>
          Rules
        </label>
        <input
          id="election-rules"
          value={form.rules}
          onChange={(e) => update({ rules: e.target.value })}
          placeholder="One vote per position · abstain allowed"
          maxLength={4000}
          className={inputClassName}
        />
      </SectionCard>

      <SectionCard
        title="Candidacy"
        aside={
          locked ? (
            <span className="inline-flex items-center gap-1.5 font-mono text-[0.65625rem] text-muted-foreground">
              <Lock aria-hidden className="size-3" />
              set when created · locked
            </span>
          ) : (
            "set when created · can’t be changed later"
          )
        }
        bodyClassName="p-0"
      >
        <ul className="divide-y divide-[#e2e8f0] dark:divide-border">
          {CANDIDACY_OPTIONS.map((option) => (
            <li key={option.key} className="flex items-center justify-between gap-6 px-5 py-3.5">
              <div className="min-w-0">
                <p id={`candidacy-${option.key}`} className="text-[0.875rem] font-medium text-foreground">
                  {option.title}
                </p>
                <p id={`candidacy-${option.key}-hint`} className="mt-0.5 text-[0.8125rem] leading-5 text-muted-foreground">
                  {option.hint}
                </p>
              </div>
              <span className="shrink-0">
                <Switch
                  checked={form[option.key]}
                  onChange={(checked) => update({ [option.key]: checked })}
                  labelledBy={`candidacy-${option.key}`}
                  disabled={locked}
                />
              </span>
            </li>
          ))}
        </ul>
      </SectionCard>

      {locked ? null : (
        <p className="flex items-start gap-2 px-1 text-[0.8125rem] leading-5 text-muted-foreground">
          <Lock aria-hidden className="mt-0.75 size-3.5 shrink-0" />
          Pick these carefully: once the election is created, the candidacy settings can’t be changed.
        </p>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*                               Step 4: Review                               */
/* -------------------------------------------------------------------------- */

interface ReviewStepProps {
  form: ElectionForm;
  terms: readonly Term[];
  pool: VoterPool;
  programs: ProgramsByCareer;
  colors: ReadonlyMap<string, string>;
  editing: boolean;
  onEdit: (step: number) => void;
}

function ReviewCard({ title, onEdit, children, after }: { title: string; onEdit: () => void; children: ReactNode; after?: ReactNode }) {
  return (
    <SectionCard
      title={title}
      aside={
        <button
          type="button"
          onClick={onEdit}
          className="cursor-pointer rounded-sm text-[0.875rem] text-brand-blue outline-none hover:underline hover:underline-offset-2 focus-visible:ring-2 focus-visible:ring-brand-blue/30 dark:text-[#7aa7e6]"
        >
          Edit<span className="sr-only"> {title.toLowerCase()}</span>
        </button>
      }
      bodyClassName="px-5 pt-4 pb-3.5"
    >
      <dl>{children}</dl>
      {after}
    </SectionCard>
  );
}

const switchText = (on: boolean, yes = "On", no = "Off") => (
  <span className={on ? "font-medium text-brand-blue dark:text-[#7aa7e6]" : "text-muted-foreground"}>{on ? yes : no}</span>
);

/** Rows of the review's Rules card (labels as on the printed election summary). */
const RULE_ROWS: { key: keyof CandidacySettings; label: string; on: string; off: string }[] = [
  { key: "openCandidacy", label: "Open candidacy", on: "On", off: "Off" },
  { key: "crossPositionCandidacy", label: "Run for more than one position", on: "On", off: "Off" },
  { key: "requireActiveEnrollment", label: "Active enrollment", on: "Required", off: "Not required" },
];

const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

/** One labelled bar list ("By program", "By year level") inside a career's breakdown. */
function BreakdownBars({ title, rows, total, scale }: { title: string; rows: { key: string; label: string; count: number; included: boolean }[]; total: number; scale: number }) {
  return (
    <div className="mt-3 first:mt-2">
      <p className="mb-1.5 font-mono text-[0.625rem] tracking-[0.1em] text-muted-foreground uppercase">{title}</p>
      <ul className="space-y-1.5">
        {rows.map((row, index) => (
          <li key={row.key} className={cn("grid grid-cols-[4.75rem_minmax(0,1fr)_2.75rem_2.25rem] items-center gap-2.5 transition-opacity duration-300", !row.included && "opacity-40")}>
            <span className="truncate text-[0.75rem] text-foreground/85">{row.label}</span>
            <span className="relative h-1.5 overflow-hidden rounded-full bg-[#e3e8ef] dark:bg-white/10">
              <span
                className={cn("absolute inset-y-0 left-0 rounded-full bg-(--career)", styles.barGrow)}
                style={{ width: `${(row.count / scale) * 100}%`, animationDelay: `${150 + index * 45}ms` }}
              />
            </span>
            <AnimatedNumber value={row.count} from={0} duration={900} delay={150 + index * 45} className="text-right font-mono text-[0.6875rem] text-foreground tabular-nums" />
            <span className="text-right font-mono text-[0.625rem] text-muted-foreground tabular-nums">{row.included ? `${percent(row.count, total)}%` : "—"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A career's box in the voter pool breakdown: by program (or strand), then by level. */
function CareerBreakdown({ pool, poolTotal, color }: { pool: CareerPool; poolTotal: number; color: string }) {
  const { career, total, programs, programScale, levels, scale } = pool;
  const programWord = programGroupLabel(career) === "Strands" ? "strand" : "program";
  return (
    <div style={careerStyle(color)} className="rounded-[0.375rem] bg-[#f5f7fa] px-3.5 pt-3 pb-3.5 dark:bg-white/4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[0.875rem] font-semibold text-foreground">{career.name}</p>
        <p className="font-mono text-[0.75rem] text-foreground tabular-nums">
          <AnimatedNumber value={total} from={0} duration={900} /> · {percent(total, poolTotal)}%
        </p>
      </div>
      {programs.length ? (
        <BreakdownBars
          title={`By ${programWord}`}
          rows={programs.map((p) => ({ key: p.code, label: p.code, count: p.count, included: p.included }))}
          total={total}
          scale={programScale}
        />
      ) : null}
      {levels.length ? (
        <BreakdownBars
          title={`By ${levelGroupLabel(career).toLowerCase()}`}
          rows={levels.map((l) => ({ key: String(l.level), label: levelLabel(l.level, career), count: l.count, included: l.included }))}
          total={total}
          scale={scale}
        />
      ) : null}
    </div>
  );
}

export function ReviewStep({ form, terms, pool, programs, colors, editing, onEdit }: ReviewStepProps) {
  const term = terms.find((t) => t.id === form.termId);
  const withPrograms = pool.careers.filter(({ career }) => (programs.get(career.code)?.length ?? 0) > 0);
  const groupWords = [...new Set(withPrograms.map(({ career }) => programGroupLabel(career)))];
  const programsLabel = groupWords.length > 1 ? "Programs & strands" : (groupWords[0] ?? "Programs");

  return (
    <>
      <ReviewCard title="Details" onEdit={() => onEdit(0)}>
        <ReviewRow label="Title">{form.title.trim() || "—"}</ReviewRow>
        <ReviewRow label="Category">{form.category}</ReviewRow>
        <ReviewRow label="Term">{term ? termOptionLabel(term) : "—"}</ReviewRow>
        <ReviewRow label="Voting window">
          {form.opensAt && form.closesAt ? (
            <>
              {formatDayTime(form.opensAt)} <span aria-label="to">→</span> {formatDayTime(form.closesAt)}
            </>
          ) : (
            "Not set"
          )}
        </ReviewRow>
      </ReviewCard>

      <ReviewCard
        title="Who can vote"
        onEdit={() => onEdit(1)}
        after={
          pool.careers.length ? (
            <div className="mt-3 border-t border-[#e2e8f0] pt-3 dark:border-border">
              <div className="mb-2.5 flex items-baseline justify-between gap-3">
                <p className="text-[0.8125rem] text-muted-foreground">Voter pool breakdown</p>
                <p className="text-[0.8125rem] text-foreground">
                  <AnimatedNumber value={pool.total} from={0} duration={900} className="tabular-nums" /> total
                </p>
              </div>
              <div className={cn("grid grid-cols-1 gap-3", pool.careers.length > 1 && "md:grid-cols-2")}>
                {pool.careers.map((careerPool) => (
                  <CareerBreakdown key={careerPool.career.code} pool={careerPool} poolTotal={pool.total} color={colors.get(careerPool.career.code)!} />
                ))}
              </div>
            </div>
          ) : null
        }
      >
        <ReviewRow label="Careers">
          <span className="inline-flex flex-wrap justify-end gap-x-3 gap-y-1.5">
            {pool.careers.length
              ? pool.careers.map(({ career }) => (
                  <span key={career.code} style={careerStyle(colors.get(career.code)!)} className="inline-flex items-center gap-1.5">
                    <CareerBadge code={career.code} />
                    {career.name}
                  </span>
                ))
              : "—"}
          </span>
        </ReviewRow>
        {withPrograms.length ? (
          <ReviewRow label={programsLabel}>
            {withPrograms
              .map(({ career }) => {
                const picks = programPicks(form, career, programs);
                return picks.length ? picks.join(" · ") : `All ${programGroupLabel(career).toLowerCase()}`;
              })
              .join(" · ")}
          </ReviewRow>
        ) : null}
        <ReviewRow label="Levels">
          {pool.careers
            .map(({ career }) => {
              const levels = levelPicks(form, career);
              return levels.length ? formatLevelScope(levels, [career]) : `All ${levelGroupLabel(career).toLowerCase()}s`;
            })
            .join(" · ") || "—"}
        </ReviewRow>
        <ReviewRow label="Eligible voters">
          <AnimatedNumber value={pool.total} from={0} duration={900} className="tabular-nums" /> {pool.total === 1 ? "student" : "students"}
        </ReviewRow>
      </ReviewCard>

      <ReviewCard title="Rules" onEdit={() => onEdit(2)}>
        <ReviewRow label="Voting rules">{form.rules.trim() || "—"}</ReviewRow>
        {RULE_ROWS.map((row) => (
          <ReviewRow key={row.key} label={row.label}>
            {switchText(form[row.key], row.on, row.off)}
          </ReviewRow>
        ))}
      </ReviewCard>

      {editing ? null : (
        <p className={cn(cardClassName, "border-[#f3d26b] bg-[#fff8db] px-3.5 py-3 text-[0.8125rem] leading-5 text-brand-navy dark:border-brand-gold/30 dark:bg-brand-gold/10 dark:text-foreground")}>
          After you create the election, an admin will add voters and create their passcodes. Add election admins and send OTP emails from the election&apos;s
          Admins and Voters &amp; passcodes tabs.
        </p>
      )}
    </>
  );
}
