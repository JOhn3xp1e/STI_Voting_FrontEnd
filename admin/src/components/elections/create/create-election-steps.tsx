"use client";

import { useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import { X } from "lucide-react";

import { errorClassName, fieldClassName, labelClassName } from "@/components/shared/form-styles";
import { Caret, OptionMenu } from "@/components/students/option-menu";
import {
  careerLevels,
  formatCareerScope,
  formatDayTime,
  formatLevelScope,
  formatProgramScope,
  levelLabel,
  type DetailsErrors,
  type ElectionForm,
  type VotersErrors,
} from "@/lib/elections";
import type { IsoDate } from "@/lib/dates";
import { formatAcadYear } from "@/lib/terms";
import { cn } from "@/lib/utils";
import { ELECTION_CATEGORIES } from "@/types/election.types";
import type { Career, Program } from "@/types/program.types";
import type { Term } from "@/types/term.types";

import { Chip, DateTimePicker, ReviewRow, SectionCard, cardClassName } from "./create-election-ui";

const inputClassName = cn(fieldClassName, "rounded-[0.25rem] border-[#e2e8f0] dark:border-border");

/** "TRM-00004 · 2025–2026 Term 1" */
export function termOptionLabel(term: Term): string {
  return `${term.id} · ${formatAcadYear(term.acadYear)} Term ${term.termNumber}`;
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

  return (
    <SectionCard title="Banner" aside="shown on voter home and election cards" bodyClassName="p-5 pb-4.5">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "relative flex h-26.5 items-center justify-center overflow-hidden rounded-[0.25rem] border border-dashed bg-cover bg-center text-center transition-[border-color,background-color] duration-200",
          dragging ? "border-brand-blue/60 bg-brand-blue/4" : "border-[#d5dbe3] dark:border-white/15",
        )}
        style={previewUrl ? { backgroundImage: `url("${previewUrl}")` } : undefined}
      >
        {previewUrl ? (
          <>
            <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/55 to-transparent px-3 pt-6 pb-2 text-left font-mono text-[0.65625rem] text-white/85">
              Uploads when you save
            </span>
            <button
              type="button"
              onClick={() => onPick(null)}
              aria-label="Remove banner"
              className="absolute top-2 right-2 flex size-7 cursor-pointer items-center justify-center rounded-full bg-black/45 text-white outline-none transition-colors hover:bg-black/65 focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="group/drop flex h-full w-full cursor-pointer flex-col items-center justify-center gap-1 outline-none focus-visible:ring-3 focus-visible:ring-brand-blue/15"
          >
            <span className="text-[0.8125rem] text-foreground">
              Drop a banner image or <span className="underline-offset-2 transition-colors group-hover/drop:text-brand-blue group-hover/drop:underline dark:group-hover/drop:text-[#7aa7e6]">browse</span>
            </span>
            <span className="font-mono text-[0.65625rem] text-muted-foreground">
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

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className={errorClassName}>
      {message}
    </p>
  ) : null;
}

export function DetailsStep({ form, update, errors, terms, today, bannerUrl, onBannerPick, onBannerError }: DetailsStepProps) {
  const term = terms.find((t) => t.id === form.termId);

  return (
    <>
      <BannerDropzone previewUrl={bannerUrl} onPick={onBannerPick} onError={onBannerError} />

      <SectionCard title="Details" aside="step 1 of 3">
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
            <input
              id="election-description"
              value={form.description}
              onChange={(e) => update({ description: e.target.value })}
              placeholder="What this election is for"
              maxLength={1000}
              aria-invalid={!!errors.description || undefined}
              aria-describedby={errors.description ? "election-description-error" : undefined}
              className={inputClassName}
            />
            <FieldError id="election-description-error" message={errors.description} />
          </div>

          <div>
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
/*                            Step 2: Who can vote                            */
/* -------------------------------------------------------------------------- */

const PROGRAMS_SHOWN = 4;

interface VotersStepProps {
  form: ElectionForm;
  update: (patch: Partial<ElectionForm>) => void;
  errors: VotersErrors;
  careers: readonly Career[];
  programs: readonly Program[];
  eligible: number;
}

export function VotersStep({ form, update, errors, careers, programs, eligible }: VotersStepProps) {
  const [showAllPrograms, setShowAllPrograms] = useState(false);
  const selectedCareers = careers.filter((c) => form.careerScope.includes(c.code));
  const shownPrograms = showAllPrograms ? programs : programs.slice(0, PROGRAMS_SHOWN);
  const hiddenCount = programs.length - shownPrograms.length;

  function toggleCareer(career: Career) {
    const on = form.careerScope.includes(career.code);
    const levels = careerLevels(career);
    update({
      careerScope: on ? form.careerScope.filter((c) => c !== career.code) : [...form.careerScope, career.code],
      // Picking a career adds all its levels; dropping it removes them.
      levelScope: on
        ? form.levelScope.filter((l) => !levels.includes(l))
        : [...new Set([...form.levelScope, ...levels])].sort((a, b) => a - b),
    });
  }

  function toggleProgram(code: string) {
    const on = form.programScope.includes(code);
    update({ programScope: on ? form.programScope.filter((p) => p !== code) : [...form.programScope, code] });
  }

  function toggleLevel(level: number) {
    const on = form.levelScope.includes(level);
    update({ levelScope: on ? form.levelScope.filter((l) => l !== level) : [...form.levelScope, level].sort((a, b) => a - b) });
  }

  const groupLabelClassName = "mb-2 text-[0.875rem] text-foreground";

  return (
    <SectionCard title="Who can vote" aside="filters build the voter list" bodyClassName="px-5 pt-4.5 pb-5">
      <div role="group" aria-labelledby="voters-careers">
        <p id="voters-careers" className={groupLabelClassName}>
          Careers
        </p>
        <div className="flex flex-wrap gap-2">
          {careers.map((career) => (
            <Chip key={career.code} selected={form.careerScope.includes(career.code)} onClick={() => toggleCareer(career)}>
              {career.code} · {career.name}
            </Chip>
          ))}
          {careers.length === 0 ? <p className="text-[0.8125rem] text-muted-foreground">No careers yet. Add them in Programs &amp; Careers.</p> : null}
        </div>
        {errors.careerScope ? <p className={errorClassName}>{errors.careerScope}</p> : null}
      </div>

      <div role="group" aria-labelledby="voters-programs" className="mt-4">
        <p id="voters-programs" className={groupLabelClassName}>
          Programs
        </p>
        <div className="flex flex-wrap gap-2">
          <Chip selected={form.programScope.length === 0} onClick={() => update({ programScope: [] })}>
            All programs
          </Chip>
          {shownPrograms.map((program) => (
            <Chip key={program.code} selected={form.programScope.includes(program.code)} onClick={() => toggleProgram(program.code)}>
              {program.code}
            </Chip>
          ))}
          {hiddenCount > 0 || showAllPrograms ? (
            <button
              type="button"
              onClick={() => setShowAllPrograms((v) => !v)}
              className="inline-flex h-6.5 cursor-pointer items-center rounded-full border border-[#e2e8f0] px-3 text-[0.8125rem] text-foreground outline-none transition-colors hover:border-[color-mix(in_oklab,var(--color-brand-muted)_45%,transparent)] focus-visible:ring-3 focus-visible:ring-brand-blue/20 dark:border-border"
            >
              {showAllPrograms ? "Show less" : `+${hiddenCount} more`}
            </button>
          ) : null}
        </div>
      </div>

      <div role="group" aria-labelledby="voters-levels" className="mt-4">
        <p id="voters-levels" className={groupLabelClassName}>
          Levels
        </p>
        <div className="flex flex-wrap gap-2">
          {selectedCareers.flatMap((career) =>
            careerLevels(career).map((level) => (
              <Chip key={`${career.code}-${level}`} selected={form.levelScope.includes(level)} onClick={() => toggleLevel(level)}>
                {levelLabel(level, career)}
              </Chip>
            )),
          )}
          {selectedCareers.length === 0 ? <p className="text-[0.8125rem] text-muted-foreground">Pick a career to see its levels.</p> : null}
        </div>
        {errors.levelScope ? <p className={errorClassName}>{errors.levelScope}</p> : null}
      </div>

      <div className="mt-3.5 flex min-h-9.5 items-center justify-between gap-3 rounded-[0.25rem] border border-[#e2e8f0] px-3.5 dark:border-border" aria-live="polite">
        <p className="text-[0.875rem] text-foreground">
          {eligible.toLocaleString()} {eligible === 1 ? "student matches" : "students match"}
        </p>
        <p className="truncate font-mono text-[0.65625rem] text-muted-foreground">enrolled in {form.termId ?? "—"}</p>
      </div>
    </SectionCard>
  );
}

/* -------------------------------------------------------------------------- */
/*                               Step 3: Review                               */
/* -------------------------------------------------------------------------- */

interface ReviewStepProps {
  form: ElectionForm;
  terms: readonly Term[];
  careers: readonly Career[];
  eligible: number;
  onEdit: (step: number) => void;
}

function ReviewCard({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
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
    </SectionCard>
  );
}

export function ReviewStep({ form, terms, careers, eligible, onEdit }: ReviewStepProps) {
  const term = terms.find((t) => t.id === form.termId);

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

      <ReviewCard title="Who can vote" onEdit={() => onEdit(1)}>
        <ReviewRow label="Careers">{formatCareerScope(form.careerScope, careers)}</ReviewRow>
        <ReviewRow label="Programs">{formatProgramScope(form.programScope, 6)}</ReviewRow>
        <ReviewRow label="Levels">{formatLevelScope(form.levelScope, careers)}</ReviewRow>
        <ReviewRow label="Eligible voters">
          {eligible.toLocaleString()} {eligible === 1 ? "student" : "students"}
        </ReviewRow>
      </ReviewCard>

      <p className={cn(cardClassName, "border-[#f3d26b] bg-[#fff8db] px-3.5 py-3 text-[0.8125rem] leading-5 text-brand-navy dark:border-brand-gold/30 dark:bg-brand-gold/10 dark:text-foreground")}>
        After you create it, voters and passcodes are generated. Add election admins and send OTP emails from the election&apos;s Admins and Voters &amp;
        passcodes tabs.
      </p>
    </>
  );
}
