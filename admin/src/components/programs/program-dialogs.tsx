"use client";

import { useState, type FormEvent, type ReactNode } from "react";

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
import { Caret, OptionMenu } from "@/components/students/option-menu";
import { LEVELS, formatLevels, validateCareer, validateProgram, type CareerErrors, type ProgramErrors } from "@/lib/programs";
import { cn } from "@/lib/utils";
import type { Career, CareerInput, Program, ProgramInput } from "@/types/program.types";

const createdFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const LEVEL_OPTIONS = LEVELS.map((n) => ({ value: n, label: String(n), hint: n === 0 ? "Kinder" : undefined }));

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
  onClose: () => void;
  /** Creates (no `editingCode`) or updates; rejects with a user-facing message. */
  onSave: (input: CareerInput, editingCode?: string) => Promise<void>;
  onRequestDelete: (career: Career) => void;
}

export function CareerDialog({ state, careers, onClose, onSave, onRequestDelete }: CareerDialogProps) {
  const [saving, setSaving] = useState(false);
  return (
    <EditorFrame state={state} onClose={onClose} saving={saving}>
      {(shown) => (
        <CareerForm
          key={shown.mode === "edit" ? shown.item.code : "new"}
          career={shown.mode === "edit" ? shown.item : null}
          careers={careers}
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

function CareerForm({
  career,
  careers,
  saving,
  setSaving,
  onClose,
  onSave,
  onRequestDelete,
}: Omit<CareerDialogProps, "state"> & { career: Career | null; saving: boolean; setSaving: (saving: boolean) => void }) {
  // A new career defaults to the levels right after the highest existing one.
  const nextLevel = Math.min(12, Math.max(-1, ...careers.map((c) => c.maxLevel ?? -1)) + 1);
  const [code, setCode] = useState(career?.code ?? "");
  const [name, setName] = useState(career?.name ?? "");
  const [minLevel, setMinLevel] = useState(career?.minLevel ?? nextLevel);
  const [maxLevel, setMaxLevel] = useState(career?.maxLevel ?? nextLevel);
  const { submitted, serverError, setServerError, submit } = useSubmit(onClose, setSaving);

  const input: CareerInput = { code: code.trim().toUpperCase(), name: name.trim(), minLevel, maxLevel };
  const errors: CareerErrors = submitted ? validateCareer(input, careers, career?.code) : {};
  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setServerError(null);
  };

  const levelSelect = (label: string, value: number, onChange: (v: number) => void, align: "start" | "end") => (
    <div>
      <p className={labelClassName}>{label}</p>
      <OptionMenu<number>
        label={label}
        value={value}
        options={LEVEL_OPTIONS}
        onChange={(v) => v !== null && onChange(v)}
        align={align}
        invalid={!!errors.levels}
        triggerClassName={cn(fieldClassName, "cursor-pointer gap-1 tabular-nums")}
      >
        {value}
        <Caret />
      </OptionMenu>
    </div>
  );

  return (
    <form noValidate aria-busy={saving} onSubmit={(e) => void submit(e, Object.keys(validateCareer(input, careers, career?.code)).length === 0, () => onSave(input, career?.code))}>
      <DialogHeading
        eyebrow={career ? `Career · ${career.code}` : "Career · new"}
        title={career ? "Edit career" : "New career"}
        srDescription={career ? `Rename ${career.name} or change its grade levels.` : "Add a career with its grade levels."}
        closeDisabled={saving}
      />
      <div className="grid grid-cols-1 gap-x-3 gap-y-4 px-6 py-5 sm:grid-cols-2">
        {career ? (
          <LockedField id="career-code" label="Code" value={career.code} />
        ) : (
          <TextField id="career-code" label="Code" value={code} onChange={edit((v: string) => setCode(v.toUpperCase()))} error={errors.code} placeholder="TER" maxLength={10} inputClassName="font-mono uppercase" />
        )}
        <TextField id="career-name" label="Name" value={name} onChange={edit(setName)} error={errors.name} placeholder="Tertiary" />
        {levelSelect("Lowest level", minLevel, edit(setMinLevel), "start")}
        {levelSelect("Highest level", maxLevel, edit(setMaxLevel), "end")}
        {errors.levels ? <p className={cn(errorClassName, "-mt-2 sm:col-span-2", styles.fieldError)}>{errors.levels}</p> : null}
        <p className="-mt-1 text-[0.75rem] leading-4.5 text-muted-foreground sm:col-span-2">
          The student import picks a career from the level (e.g. 1Y1 → level 1), so levels can&apos;t overlap.
        </p>
        <ServerError message={serverError} />
      </div>
      <Footer saving={saving} saveLabel={career ? "Save changes" : "Create career"} onDelete={career ? () => onRequestDelete(career) : undefined} deleteLabel="Delete career" />
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
