"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { CircleCheck, LoaderCircle, Pencil, Search, Upload, X } from "lucide-react";

import { DialogCancel, DialogFrame, DialogHeading, dialogDangerLinkClassName, dialogPrimaryClassName } from "@/components/shared/dialog-frame";
import { errorClassName, fieldClassName, labelClassName } from "@/components/shared/form-styles";
import { IMAGE_TYPES, checkImage } from "@/components/shared/image-dropzone";
import { Caret, OptionMenu } from "@/components/students/option-menu";
import { PORTRAIT_MAX_BYTES, STUDENT_ID_LENGTH, studentIdProblem, validateCandidate, type CandidateErrors, type CandidateForm } from "@/lib/ballot";
import { mottoText, partyColorFallbackClassName, partyColorStyle, partyInitial } from "@/lib/partylists";
import { formatStudentName, getStudentInitials } from "@/lib/students";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/services/api/error-message";
import { createCandidate, deleteCandidate, updateCandidate } from "@/services/ballot/ballot.service";
import type { Candidate, Position } from "@/types/ballot.types";
import type { Partylist } from "@/types/partylist.types";
import type { Student } from "@/types/student.types";

/** What the dialog is open for: a new candidate (optionally for a given position) or an existing one. */
export type CandidateDialogTarget = { mode: "create"; positionId: string | null } | { mode: "edit"; candidate: Candidate } | null;

interface CandidateDialogProps {
  target: CandidateDialogTarget;
  electionId: string;
  positions: readonly Position[];
  parties: readonly Partylist[];
  /** `null` when the student list couldn't be loaded; the student number is typed in instead. */
  students: readonly Student[] | null;
  /** Every candidate in the election, so a student can't run twice. */
  candidates: readonly Candidate[];
  onClose: () => void;
  onSaved: (candidate: Candidate, created: boolean) => void;
  onRemoved: (candidate: Candidate) => void;
}

const PARTY_INDEPENDENT = "__independent__";

const inputClassName = cn(fieldClassName, "rounded-[0.25rem] border-[#e2e8f0] dark:border-border");

/** Brand-blue filled action (Choose photo, Save changes). */
const bluePrimaryClassName = cn(
  dialogPrimaryClassName,
  "bg-brand-blue text-white hover:bg-[color-mix(in_oklab,var(--color-brand-blue)_85%,black)] dark:hover:bg-[color-mix(in_oklab,var(--color-brand-blue)_85%,white)]",
);

function initialForm(target: CandidateDialogTarget): CandidateForm {
  if (target?.mode === "edit") {
    const c = target.candidate;
    return { studentId: c.studentId, positionId: c.positionId, partylistId: c.partylistId, platform: c.platform ?? "" };
  }
  return { studentId: "", positionId: target?.positionId ?? null, partylistId: null, platform: "" };
}

/** "Add candidate" and "Edit candidate": portrait on the left; student, position, party list and platform on the right. */
export function CandidateDialog({ target, electionId, positions, parties, students, candidates, onClose, onSaved, onRemoved }: CandidateDialogProps) {
  const [form, setForm] = useState<CandidateForm>(() => initialForm(target));
  const [errors, setErrors] = useState<CandidateErrors>({});
  const [portrait, setPortrait] = useState<{ file: File; url: string } | null>(null);
  const [busy, setBusy] = useState<"save" | "remove" | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start from the target each time the dialog opens for something new.
  const [openedFor, setOpenedFor] = useState(target);
  if (target !== openedFor) {
    setOpenedFor(target);
    if (target) {
      setForm(initialForm(target));
      setErrors({});
      setPortrait(null);
      setConfirmRemove(false);
      setError(null);
    }
  }

  // Free the portrait preview's object URL when it changes or the dialog closes.
  useEffect(() => (portrait ? () => URL.revokeObjectURL(portrait.url) : undefined), [portrait]);

  // Keep showing the last target while the dialog animates out.
  const [shown, setShown] = useState(target);
  if (target && target !== shown) setShown(target);
  const editing = shown?.mode === "edit" ? shown.candidate : null;

  const takenBy = useMemo(() => new Map(candidates.map((c) => [c.studentId, c])), [candidates]);
  const studentById = useMemo(() => new Map((students ?? []).map((s) => [s.studentNo, s])), [students]);
  const known = useMemo(() => (students ? new Set(studentById.keys()) : null), [students, studentById]);
  const student = studentById.get(form.studentId) ?? null;
  // Checked as soon as all 11 digits are typed, not only on save.
  const liveStudentProblem = studentIdProblem(form.studentId, known, takenBy, editing?.id ?? null);
  const studentMatched = student !== null && liveStudentProblem === null;

  function update(patch: Partial<CandidateForm>) {
    const next = { ...form, ...patch };
    setForm(next);
    if (Object.keys(errors).length) setErrors(validateCandidate(next, known, takenBy, editing?.id ?? null));
    setError(null);
  }

  async function save() {
    const found = validateCandidate(form, known, takenBy, editing?.id ?? null);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy("save");
    setError(null);
    try {
      const input = { studentId: form.studentId.trim(), positionId: form.positionId!, electionId, partylistId: form.partylistId, platform: form.platform.trim() || null };
      const saved = editing ? await updateCandidate(editing.id, input, portrait?.file) : await createCandidate(input, portrait?.file);
      onSaved(saved, !editing);
      onClose();
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!editing) return;
    if (!confirmRemove) return setConfirmRemove(true);
    setBusy("remove");
    setError(null);
    try {
      await deleteCandidate(editing.id);
      onRemoved(editing);
      onClose();
    } catch (cause) {
      setError(getApiErrorMessage(cause));
      setConfirmRemove(false);
    } finally {
      setBusy(null);
    }
  }

  const portraitUrl = portrait?.url ?? editing?.portraitUrl ?? null;
  const position = positions.find((p) => p.id === form.positionId);
  const party = parties.find((p) => p.id === form.partylistId) ?? null;

  return (
    <DialogFrame open={target !== null} onOpenChange={(open) => !open && onClose()} locked={busy !== null} widthClassName="w-[min(45rem,calc(100vw-2rem))]">
      {shown ? (
        <>
          <DialogHeading
            eyebrow={editing ? `Candidate · ${editing.studentId}` : "Ballot"}
            title={editing ? "Edit candidate" : "Add candidate"}
            srDescription="Pick the student, their position and party list, and add a portrait and platform."
            closeDisabled={busy !== null}
          />

          <div className="grid max-h-[calc(100dvh-12rem)] grid-cols-1 gap-6 overflow-y-auto px-6 pt-5 pb-6 sm:grid-cols-[15rem_minmax(0,1fr)]">
            <div>
              <p className={labelClassName}>Portrait</p>
              <PortraitPicker
                url={portraitUrl}
                onPick={(file) => setPortrait(file ? { file, url: URL.createObjectURL(file) } : null)}
                picked={portrait !== null}
                onError={setError}
              />
            </div>

            <div className="min-w-0 space-y-4">
              {editing || studentMatched ? (
                <div>
                  <p className={labelClassName}>Student</p>
                  <StudentCard student={student} studentId={form.studentId} onClear={editing ? undefined : () => update({ studentId: "" })} />
                </div>
              ) : (
                <div>
                  <label htmlFor="candidate-student-id" className={labelClassName}>
                    Student ID
                  </label>
                  <div className="relative">
                    <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.25 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      id="candidate-student-id"
                      autoFocus
                      value={form.studentId}
                      onChange={(e) => update({ studentId: e.target.value.replace(/\D/g, "").slice(0, STUDENT_ID_LENGTH) })}
                      placeholder="Enter student ID"
                      inputMode="numeric"
                      autoComplete="off"
                      aria-invalid={!!(errors.studentId || liveStudentProblem) || undefined}
                      aria-describedby="candidate-student-id-hint"
                      className={cn(inputClassName, "pl-9 tabular-nums")}
                    />
                  </div>
                  <p id="candidate-student-id-hint" className={cn(errors.studentId || liveStudentProblem ? errorClassName : "mt-1.5 text-[0.6875rem] leading-4 text-muted-foreground")}>
                    {liveStudentProblem ??
                      errors.studentId ??
                      (students
                        ? "11 digits · e.g. 02000334567. The student's name appears once it matches."
                        : "11 digits · e.g. 02000334567. The student list couldn't be loaded, so names won't show.")}
                  </p>
                </div>
              )}

              <div>
                <p className={labelClassName}>Position</p>
                <OptionMenu<string>
                  label="Position"
                  value={form.positionId}
                  options={positions.map((p) => ({ value: p.id, label: p.title, hint: `${p.maxVotes} ${p.maxVotes === 1 ? "seat" : "seats"}` }))}
                  onChange={(value) => value && update({ positionId: value })}
                  invalid={!!errors.positionId}
                  triggerClassName={cn(inputClassName, "cursor-pointer gap-1")}
                >
                  <span className={cn("truncate", !position && "text-muted-foreground")}>{position?.title ?? "Pick a position"}</span>
                  <Caret />
                </OptionMenu>
                {errors.positionId ? <p className={errorClassName}>{errors.positionId}</p> : null}
              </div>

              <div>
                <p className={labelClassName}>Party list</p>
                <OptionMenu<string>
                  label="Party list"
                  value={form.partylistId ?? PARTY_INDEPENDENT}
                  options={[...parties.map((p) => ({ value: p.id, label: p.name })), { value: PARTY_INDEPENDENT, label: "Independent" }]}
                  onChange={(value) => update({ partylistId: !value || value === PARTY_INDEPENDENT ? null : value })}
                  triggerClassName="block w-full cursor-pointer rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-brand-blue/25"
                >
                  <PartyCard party={party} />
                </OptionMenu>
              </div>

              <div>
                <label htmlFor="candidate-platform" className={labelClassName}>
                  Platform
                </label>
                <textarea
                  id="candidate-platform"
                  value={form.platform}
                  onChange={(e) => update({ platform: e.target.value })}
                  placeholder="What will they do if elected?"
                  rows={3}
                  maxLength={1000}
                  className={cn(inputClassName, "h-auto min-h-20 resize-y py-2.5 leading-5.5")}
                />
              </div>

              {error ? (
                <p role="alert" className="rounded-md bg-destructive/8 px-3 py-2 text-[0.8125rem] text-destructive">
                  {error}
                </p>
              ) : (
                <p className="text-[0.75rem] text-muted-foreground">A student can run for one position per election.</p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
            {editing ? (
              <button type="button" onClick={() => void remove()} disabled={busy !== null} className={dialogDangerLinkClassName}>
                {busy === "remove" ? "Removing…" : confirmRemove ? "Click again to remove" : "Remove candidate"}
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2.5">
              <DialogCancel disabled={busy !== null} />
              <button type="button" onClick={() => void save()} disabled={busy !== null} className={cn(bluePrimaryClassName, "inline-flex items-center gap-2")}>
                {busy === "save" ? <LoaderCircle aria-hidden className="size-3.5 animate-spin" /> : null}
                {editing ? "Save changes" : "Add candidate"}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </DialogFrame>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Pieces                                   */
/* -------------------------------------------------------------------------- */

function PortraitPicker({ url, picked, onPick, onError }: { url: string | null; picked: boolean; onPick: (file: File | null) => void; onError: (message: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function accept(file: File | undefined) {
    if (!file) return;
    const problem = checkImage(file, PORTRAIT_MAX_BYTES);
    if (problem) return onError(problem);
    onPick(file);
  }

  return (
    <div
      onDragOver={(e: DragEvent) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e: DragEvent) => {
        e.preventDefault();
        setDragging(false);
        accept(e.dataTransfer.files[0]);
      }}
      className={cn(
        "relative aspect-4/5 w-full overflow-hidden rounded-xl border transition-[border-color,background-color] duration-200",
        url ? "border-[#e2e8f0] bg-muted bg-cover bg-top dark:border-border" : "border-dashed",
        !url && (dragging ? "border-brand-blue/60 bg-brand-blue/4" : "border-[#d5dbe3] dark:border-white/15"),
      )}
      style={url ? { backgroundImage: `url("${url}")` } : undefined}
    >
      {url ? (
        <div className="absolute top-2.5 right-2.5 flex gap-1.5">
          {picked ? (
            <button type="button" onClick={() => onPick(null)} aria-label="Remove the picked photo" className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-black/45 text-white outline-none hover:bg-black/65 focus-visible:ring-2 focus-visible:ring-white/70">
              <X aria-hidden className="size-4" />
            </button>
          ) : null}
          <button type="button" onClick={() => inputRef.current?.click()} aria-label="Replace the photo" className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-white/85 text-foreground shadow-sm outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-brand-blue/40">
            <Pencil aria-hidden className="size-4" strokeWidth={1.75} />
          </button>
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-1.5 px-4 text-center">
          <span className="flex size-11 items-center justify-center rounded-lg bg-brand-blue/8 text-brand-blue dark:text-[#7aa7e6]">
            <Upload aria-hidden className="size-5" strokeWidth={1.75} />
          </span>
          <p className="mt-2 text-[0.875rem] font-semibold text-foreground">Drag and drop a photo</p>
          <p className="text-[0.75rem] leading-4.5 text-muted-foreground">
            or choose a file · JPG, PNG or WebP
            <br />
            4:5 · up to 2 MB
          </p>
          <button type="button" onClick={() => inputRef.current?.click()} className={cn(bluePrimaryClassName, "mt-3 h-8.5 px-4 text-[0.8125rem]")}>
            Choose photo
          </button>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          accept(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function StudentCard({ student, studentId, onClear }: { student: Student | null; studentId: string; onClear?: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-[#e2e8f0] px-3 py-2.5 dark:border-border">
      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border font-mono text-[0.6875rem] text-muted-foreground">
        {student ? getStudentInitials(student) : "?"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.875rem] leading-5 font-semibold text-foreground">{student ? formatStudentName(student) : "Student"}</p>
        <p className="truncate font-mono text-[0.6875rem] text-muted-foreground">
          {studentId}
          {student?.email ? ` · ${student.email}` : ""}
        </p>
      </div>
      <CircleCheck aria-hidden className="size-5 shrink-0 fill-[#22c55e] text-white" />
      {onClear ? (
        <button type="button" onClick={onClear} aria-label="Enter another student ID" title="Change student" className="-mr-1 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand-blue/30">
          <X aria-hidden className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

/** The chosen party list in its colour, with "Change ▾" (the whole card opens the menu). */
function PartyCard({ party }: { party: Partylist | null }) {
  if (!party) {
    return (
      <span className="flex min-h-12 items-center justify-between gap-3 rounded-md border border-[#e2e8f0] px-3.5 py-2.5 dark:border-border">
        <span className="text-[0.875rem] text-foreground">Independent</span>
        <span className="flex items-center gap-1 text-[0.8125rem] text-muted-foreground">
          Change <Caret />
        </span>
      </span>
    );
  }
  const style = partyColorStyle(party.color);
  const motto = mottoText(party.motto);
  return (
    <span className={cn("flex min-h-14 items-center gap-3 rounded-md px-3.5 py-2.5", !style && partyColorFallbackClassName)} style={style}>
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white bg-cover bg-center text-[0.875rem] font-semibold text-brand-navy"
        style={party.logoUrl ? { backgroundImage: `url("${party.logoUrl}")` } : undefined}
      >
        {party.logoUrl ? null : partyInitial(party.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[1rem] leading-5 font-semibold">{party.name}</span>
        {motto ? <span className="block truncate text-[0.75rem] opacity-85">“{motto}”</span> : null}
      </span>
      <span className="flex shrink-0 items-center gap-1 text-[0.8125rem] font-medium">
        Change <Caret className="text-current" />
      </span>
    </span>
  );
}
