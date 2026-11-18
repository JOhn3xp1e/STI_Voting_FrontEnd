"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { X } from "lucide-react";

import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import {
  DialogCancel,
  DialogFrame,
  DialogHeading,
  dialogDangerLinkClassName,
  dialogPrimaryClassName,
  useLastValue,
} from "@/components/shared/dialog-frame";
import { errorClassName, fieldClassName, labelClassName } from "@/components/shared/form-styles";
import { LockedField } from "@/components/shared/locked-field";
import styles from "@/components/shared/motion.module.css";
import { OptionMenu } from "@/components/students/option-menu";
import {
  CAREER_COLOR_PRESETS,
  LEVELS,
  careerColor,
  formatLevels,
  isHexColor,
  validateCareer,
  validateProgram,
  type CareerErrors,
  type ProgramErrors,
} from "@/lib/programs";
import { cn } from "@/lib/utils";
import type { Career, CareerInput, Program, ProgramInput } from "@/types/program.types";

const createdFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

export type EditorState<T> = { mode: "new" } | { mode: "edit"; item: T } | null;

/* -------------------------------------------------------------------------- */
/*                                Shared pieces                               */
/* -------------------------------------------------------------------------- */

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  placeholder,
  className,
  inputClassName,
  maxLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  maxLength?: number;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      <input
        id={id}
        autoComplete="off"
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(fieldClassName, inputClassName)}
      />
      {error ? (
        <p id={`${id}-error`} className={cn(errorClassName, styles.fieldError)}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Footer({ saving, saveLabel, onDelete, deleteLabel }: { saving: boolean; saveLabel: string; onDelete?: () => void; deleteLabel: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4">
      {onDelete ? (
        <button type="button" disabled={saving} onClick={onDelete} className={dialogDangerLinkClassName}>
          {deleteLabel}
        </button>
      ) : (
        <span />
      )}
      <div className="flex gap-2.5">
        <DialogCancel disabled={saving} />
        <button type="submit" disabled={saving} className={dialogPrimaryClassName}>
          {saving ? "Saving…" : saveLabel}
        </button>
      </div>
    </div>
  );
}

function ServerError({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className={cn("rounded-md bg-destructive/8 px-3 py-2 text-[0.8125rem] text-destructive sm:col-span-2", styles.fieldError)}>
      {message}
    </p>
  ) : null;
}

/** Shared submit flow: validate → save → close, or show the server's message. */
function useSubmit(onClose: () => void, setSaving: (saving: boolean) => void) {
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  async function submit(event: FormEvent, valid: boolean, save: () => Promise<void>) {
    event.preventDefault();
    setSubmitted(true);
    setServerError(null);
    if (!valid) {
      const form = event.currentTarget as HTMLFormElement;
      requestAnimationFrame(() => form.querySelector<HTMLElement>("[aria-invalid=true]")?.focus());
      return;
    }
    setSaving(true);
    try {
      await save();
      onClose();
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return { submitted, serverError, setServerError, submit };
}

function EditorFrame<T>({ state, onClose, saving, children }: { state: EditorState<T>; onClose: () => void; saving: boolean; children: (shown: Exclude<EditorState<T>, null>) => ReactNode }) {
  const shown = useLastValue(state);
  return (
    <DialogFrame open={state !== null} onOpenChange={(open) => !open && onClose()} locked={saving} widthClassName="w-[min(35rem,calc(100vw-2rem))]">
      {shown ? children(shown) : null}
    </DialogFrame>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Career                                   */
/* -------------------------------------------------------------------------- */

interface CareerDialogProps {
  state: EditorState<Career>;
  careers: readonly Career[];
  /** Every program, for the "Program scope" picker. */
  programs: readonly Program[];
  onClose: () => void;
  /** Creates (no `editingCode`) or updates; rejects with a user-facing message. */
  onSave: (input: CareerInput, editingCode?: string) => Promise<void>;
  onRequestDelete: (career: Career) => void;
}

export function CareerDialog({ state, careers, programs, onClose, onSave, onRequestDelete }: CareerDialogProps) {
  const [saving, setSaving] = useState(false);
  return (
    <EditorFrame state={state} onClose={onClose} saving={saving}>
      {(shown) => (
        <CareerForm
          key={shown.mode === "edit" ? shown.item.code : "new"}
          career={shown.mode === "edit" ? shown.item : null}
          careers={careers}
          programs={programs}
          saving={saving}
          setSaving={setSaving}
          onClose={onClose}
          onSave={onSave}
          onRequestDelete={onRequestDelete}
        />
      )}
    </EditorFrame>
  );
}

const addChipClassName = cn(
  "inline-flex h-7.5 min-w-27.5 cursor-pointer items-center justify-center rounded-full border border-border bg-background px-3 text-[0.8125rem] font-semibold text-foreground outline-none",
  "transition-[background-color,border-color,box-shadow] duration-200 hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-brand-blue/15",
  "data-popup-open:border-brand-blue/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-background",
);

const MIN_LEVEL = LEVELS[0];
const MAX_LEVEL = LEVELS[LEVELS.length - 1];

/** Soft square "−" / "+" button of a level counter. */
function StepButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-7.5 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md bg-muted text-[0.875rem] font-semibold text-foreground outline-none",
        "transition-[background-color,scale,opacity] duration-200 hover:bg-[color-mix(in_oklab,var(--color-muted)_80%,var(--color-brand-muted))]",
        "focus-visible:ring-3 focus-visible:ring-brand-blue/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100",
      )}
    >
      {children}
    </button>
  );
}

/** "Minimum  − 1 +" integer counter inside the Level range panel. */
function LevelCounter({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <div role="group" aria-label={`${label} level`} className="flex min-w-0 flex-1 items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-[0.875rem] text-muted-foreground">{label}</span>
      <StepButton label={`Lower ${label.toLowerCase()} level`} disabled={value <= min} onClick={() => onChange(value - 1)}>
        −
      </StepButton>
      <output aria-live="polite" className="w-6 text-center text-[0.875rem] text-foreground tabular-nums">
        {value}
      </output>
      <StepButton label={`Raise ${label.toLowerCase()} level`} disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </StepButton>
    </div>
  );
}

function CareerForm({
  career,
  careers,
  programs,
  saving,
  setSaving,
  onClose,
  onSave,
  onRequestDelete,
}: Omit<CareerDialogProps, "state"> & { career: Career | null; saving: boolean; setSaving: (saving: boolean) => void }) {
  // A new career defaults to the levels right after the highest existing one, and the first unused color.
  const nextLevel = Math.min(MAX_LEVEL, Math.max(MIN_LEVEL - 1, ...careers.map((c) => c.maxLevel ?? -1)) + 1);
  const usedColors = new Set(careers.map((c) => c.color?.toUpperCase()));
  const [code, setCode] = useState(career?.code ?? "");
  const [name, setName] = useState(career?.name ?? "");
  const [minLevel, setMinLevel] = useState(career?.minLevel ?? nextLevel);
  const [maxLevel, setMaxLevel] = useState(career?.maxLevel ?? nextLevel);
  const [color, setColor] = useState(() =>
    (career ? careerColor(career, careers) : (CAREER_COLOR_PRESETS.find((c) => !usedColors.has(c)) ?? CAREER_COLOR_PRESETS[0])).toUpperCase(),
  );
  const [scope, setScope] = useState<string[]>(career?.programScope ?? []);
  const { submitted, serverError, setServerError, submit } = useSubmit(onClose, setSaving);

  const input: CareerInput = { code: code.trim().toUpperCase(), name: name.trim(), minLevel, maxLevel, color: color.trim().toUpperCase(), programScope: scope };
  const errors: CareerErrors = submitted ? validateCareer(input, careers, career?.code) : {};
  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setServerError(null);
  };

  // A program belongs to one career: offer only those no other career lists.
  const taken = new Set(careers.filter((c) => c.code !== career?.code).flatMap((c) => c.programScope.map((p) => p.toUpperCase())));
  const scopeSet = new Set(scope.map((p) => p.toUpperCase()));
  const addable = programs.filter((p) => !scopeSet.has(p.code.toUpperCase()) && !taken.has(p.code.toUpperCase()));
  const swatch = isHexColor(input.color) ? input.color : null;

  return (
    <form noValidate aria-busy={saving} onSubmit={(e) => void submit(e, Object.keys(validateCareer(input, careers, career?.code)).length === 0, () => onSave(input, career?.code))}>
      <DialogHeading
        eyebrow={career ? `Career · ${career.code}` : "Career · new"}
        title={career ? "Edit career" : "Create career"}
        srDescription={career ? `Rename ${career.name} or change its levels, programs and color.` : "Add a career with its levels, programs and color."}
        closeDisabled={saving}
      />
      <div className="flex flex-col gap-3.5 px-6 py-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {career ? (
            <LockedField id="career-code" label="Code" value={career.code} />
          ) : (
            <TextField id="career-code" label="Code" value={code} onChange={edit((v: string) => setCode(v.toUpperCase()))} error={errors.code} placeholder="TER" maxLength={10} inputClassName="font-mono uppercase" />
          )}
          <TextField id="career-name" label="Name" value={name} onChange={edit(setName)} error={errors.name} placeholder="Tertiary" />
        </div>

        {/* Level range */}
        <div>
          <div
            role="group"
            aria-labelledby="career-levels-label"
            aria-describedby={errors.levels ? "career-levels-error" : "career-levels-hint"}
            className={cn("rounded-lg border border-border bg-background p-3 transition-colors duration-200", errors.levels && "border-destructive/60")}
          >
            <p id="career-levels-label" className="mb-2 text-[0.75rem] leading-4 font-semibold text-foreground">
              Level range
            </p>
            <div className="flex flex-col gap-2 sm:h-10 sm:flex-row sm:items-center sm:gap-6">
              <LevelCounter label="Minimum" value={minLevel} min={MIN_LEVEL} max={maxLevel} onChange={edit(setMinLevel)} />
              <LevelCounter label="Maximum" value={maxLevel} min={minLevel} max={MAX_LEVEL} onChange={edit(setMaxLevel)} />
            </div>
          </div>
          {errors.levels ? (
            <p id="career-levels-error" className={cn(errorClassName, styles.fieldError)}>
              {errors.levels}
            </p>
          ) : (
            <p id="career-levels-hint" className="mt-1.5 text-[0.6875rem] leading-4 text-muted-foreground">
              The student import picks a career from the level (e.g. 1Y1 → level 1), so levels can&apos;t overlap.
            </p>
          )}
        </div>

        {/* Program scope */}
        <div>
          <p id="career-scope-label" className="mb-2 text-[0.75rem] leading-4 font-semibold text-foreground">
            Program scope
          </p>
          <ul aria-labelledby="career-scope-label" className="flex min-h-10 flex-wrap items-center gap-3">
            {scope.map((code) => (
              <li key={code}>
                <span className="inline-flex h-7.5 items-center gap-1.5 rounded-full border border-border bg-brand-blue/6 pr-1.5 pl-3 font-mono text-[0.8125rem] font-medium tracking-[0.06em] text-brand-blue dark:text-[#7aa7e6]">
                  {code}
                  <button
                    type="button"
                    aria-label={`Remove ${code}`}
                    onClick={() => edit(setScope)(scope.filter((c) => c !== code))}
                    className="flex size-5 cursor-pointer items-center justify-center rounded-full outline-none transition-colors hover:bg-brand-blue/12 focus-visible:ring-2 focus-visible:ring-brand-blue/30"
                  >
                    <X aria-hidden className="size-3" strokeWidth={2.4} />
                  </button>
                </span>
              </li>
            ))}
            <li>
              {addable.length > 0 ? (
                <OptionMenu<string>
                  label="Add a program"
                  value={null}
                  options={addable.map((p) => ({ value: p.code, label: p.code, hint: p.name }))}
                  onChange={(next) => next && edit(setScope)([...scope, next])}
                  triggerClassName={addChipClassName}
                >
                  + Add
                </OptionMenu>
              ) : (
                <button type="button" disabled className={addChipClassName} title={programs.length ? "Every program is already under a career" : "No programs yet"}>
                  + Add
                </button>
              )}
            </li>
          </ul>
        </div>

        {/* Color */}
        <div className="flex flex-wrap items-end gap-x-2.5 gap-y-3">
          <div className="mr-auto">
            <p id="career-color-label" className="mb-1.5 text-[0.75rem] leading-4 font-semibold text-foreground">
              Color
            </p>
            <div role="radiogroup" aria-labelledby="career-color-label" className="flex h-10 flex-wrap items-center gap-2.5">
              {CAREER_COLOR_PRESETS.map((preset) => {
                const picked = swatch === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    role="radio"
                    aria-checked={picked}
                    aria-label={preset}
                    title={preset}
                    onClick={() => edit(setColor)(preset)}
                    style={{ backgroundColor: preset }}
                    className={cn(
                      "size-7.5 shrink-0 cursor-pointer rounded-full outline-none transition-[scale,box-shadow] duration-200 ease-out hover:scale-108 active:scale-95",
                      "focus-visible:ring-3 focus-visible:ring-brand-blue/30 motion-reduce:hover:scale-100",
                      picked && "border-2 border-foreground",
                    )}
                  />
                );
              })}
            </div>
          </div>
          <div className="w-35">
            <label htmlFor="career-color" className={labelClassName}>
              Custom
            </label>
            <div className="relative">
              <span
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 rounded-full border border-border transition-colors"
                style={{ backgroundColor: swatch ?? "transparent" }}
              />
              <input
                id="career-color"
                autoComplete="off"
                spellCheck={false}
                maxLength={7}
                value={color}
                placeholder="#FFC200"
                onChange={(e) => {
                  const raw = e.target.value.trim().toUpperCase();
                  edit(setColor)(raw && !raw.startsWith("#") ? `#${raw}` : raw);
                }}
                aria-invalid={errors.color ? true : undefined}
                aria-describedby={errors.color ? "career-color-error" : undefined}
                className={cn(fieldClassName, "pl-8 font-mono uppercase")}
              />
            </div>
          </div>
          {errors.color ? (
            <p id="career-color-error" className={cn(errorClassName, "-mt-2 w-full text-right", styles.fieldError)}>
              {errors.color}
            </p>
          ) : null}
        </div>

        <ServerError message={serverError} />
      </div>
      <Footer saving={saving} saveLabel={career ? "Save changes" : "Create"} onDelete={career ? () => onRequestDelete(career) : undefined} deleteLabel="Delete career" />
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Program                                  */
/* -------------------------------------------------------------------------- */

interface ProgramDialogProps {
  state: EditorState<Program>;
  programs: readonly Program[];
  onClose: () => void;
  onSave: (input: ProgramInput, editingCode?: string) => Promise<void>;
  onRequestDelete: (program: Program) => void;
}

export function ProgramDialog({ state, programs, onClose, onSave, onRequestDelete }: ProgramDialogProps) {
  const [saving, setSaving] = useState(false);
  return (
    <EditorFrame state={state} onClose={onClose} saving={saving}>
      {(shown) => (
        <ProgramForm
          key={shown.mode === "edit" ? shown.item.code : "new"}
          program={shown.mode === "edit" ? shown.item : null}
          programs={programs}
          saving={saving}
          setSaving={setSaving}
          onClose={onClose}
          onSave={onSave}
          onRequestDelete={onRequestDelete}
        />
      )}
    </EditorFrame>
  );
}

function ProgramForm({
  program,
  programs,
  saving,
  setSaving,
  onClose,
  onSave,
  onRequestDelete,
}: Omit<ProgramDialogProps, "state"> & { program: Program | null; saving: boolean; setSaving: (saving: boolean) => void }) {
  const [code, setCode] = useState(program?.code ?? "");
  const [name, setName] = useState(program?.name ?? "");
  const { submitted, serverError, setServerError, submit } = useSubmit(onClose, setSaving);

  const input: ProgramInput = { code: code.trim(), name: name.trim() };
  const errors: ProgramErrors = submitted ? validateProgram(input, programs, program?.code) : {};

  return (
    <form noValidate aria-busy={saving} onSubmit={(e) => void submit(e, Object.keys(validateProgram(input, programs, program?.code)).length === 0, () => onSave(input, program?.code))}>
      <DialogHeading
        eyebrow={program ? `Program · ${program.code}` : "Program · new"}
        title={program ? "Edit program" : "New program"}
        srDescription={program ? `Rename ${program.code}.` : "Add an academic program."}
        closeDisabled={saving}
      />
      <div className="grid grid-cols-1 gap-x-3 gap-y-4 px-6 py-5 sm:grid-cols-2">
        {program ? (
          <>
            <LockedField id="program-code" label="Code" value={program.code} />
            <LockedField id="program-created" label="Created" value={program.createdAt ? createdFormat.format(new Date(program.createdAt)) : "—"} />
          </>
        ) : (
          <TextField
            id="program-code"
            label="Code"
            value={code}
            onChange={(v) => {
              setCode(v.toUpperCase());
              setServerError(null);
            }}
            error={errors.code}
            placeholder="BSIT"
            maxLength={12}
            inputClassName="font-mono uppercase"
            className="sm:col-span-2"
          />
        )}
        <TextField
          id="program-name"
          label="Name"
          value={name}
          onChange={(v) => {
            setName(v);
            setServerError(null);
          }}
          error={errors.name}
          placeholder="BS Information Technology"
          className="sm:col-span-2"
        />
        <ServerError message={serverError} />
      </div>
      <Footer saving={saving} saveLabel={program ? "Save changes" : "Create program"} onDelete={program ? () => onRequestDelete(program) : undefined} deleteLabel="Delete program" />
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Delete                                   */
/* -------------------------------------------------------------------------- */

/** What still uses a career or program; `null` parts couldn't be loaded. */
export interface Usage {
  enrollments: number | null;
  /** Titles of elections whose voter filter uses it. */
  elections: string[] | null;
}

function plural(count: number, word: string) {
  return `${count.toLocaleString("en-US")} ${word}${count === 1 ? "" : "s"}`;
}

function describeUsage(usage: Usage, unusedText: string): { text: string; blocked: boolean } {
  const reasons: string[] = [];
  if (usage.enrollments) reasons.push(`${plural(usage.enrollments, "enrollment")} use it`);
  if (usage.elections?.length) {
    const titles = usage.elections.slice(0, 2).join(", ") + (usage.elections.length > 2 ? ` and ${usage.elections.length - 2} more` : "");
    reasons.push(`the voter filter of ${titles} uses it`);
  }
  if (reasons.length) return { text: `${reasons.join(", and ")}, so it can't be deleted.`.replace(/^./, (c) => c.toUpperCase()), blocked: true };
  if (usage.enrollments === null || usage.elections === null) return { text: "If it's still in use, it won't be deleted.", blocked: false };
  return { text: unusedText, blocked: false };
}

export function DeleteProgramDialog({
  program,
  usageOf,
  onClose,
  onConfirm,
}: {
  program: Program | null;
  usageOf: (code: string) => Usage;
  onClose: () => void;
  onConfirm: (program: Program) => Promise<void>;
}) {
  return (
    <ConfirmDeleteDialog
      item={program}
      getKey={(p) => p.code}
      title={(p) => `Delete ${p.code}?`}
      description={(p) => describeUsage(usageOf(p.code), "No students are enrolled in it, and no election voter filter uses it.").text}
      summary={(p) => `${p.code} · ${p.name}`}
      blocked={(p) => describeUsage(usageOf(p.code), "").blocked}
      confirmLabel="Delete program"
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}

export function DeleteCareerDialog({
  career,
  usageOf,
  onClose,
  onConfirm,
}: {
  career: Career | null;
  usageOf: (code: string) => Usage;
  onClose: () => void;
  onConfirm: (career: Career) => Promise<void>;
}) {
  return (
    <ConfirmDeleteDialog
      item={career}
      getKey={(c) => c.code}
      title={(c) => `Delete ${c.code}?`}
      description={(c) => describeUsage(usageOf(c.code), "No students are enrolled in it, and no election voter filter uses it.").text}
      summary={(c) => `${c.code} · ${c.name} · levels ${formatLevels(c)}`}
      blocked={(c) => describeUsage(usageOf(c.code), "").blocked}
      confirmLabel="Delete career"
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
