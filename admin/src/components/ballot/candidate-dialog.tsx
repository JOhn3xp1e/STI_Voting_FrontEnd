"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Check, LoaderCircle, Pencil, Plus, Search, Trash2, Upload, X } from "lucide-react";

import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import motionStyles from "@/components/shared/motion.module.css";
import { DialogCancel, DialogFrame, DialogHeading, dialogDangerLinkClassName, dialogPrimaryClassName, dialogSecondaryClassName } from "@/components/shared/dialog-frame";
import { errorClassName, fieldClassName, labelClassName } from "@/components/shared/form-styles";
import { IMAGE_TYPES } from "@/components/shared/image-dropzone";
import { PhotoEditorDialog, type PhotoEditorRequest } from "@/components/photo-editor/photo-editor-dialog";
import { Caret, OptionMenu } from "@/components/students/option-menu";
import {
  MAX_LINKS,
  PLATFORM_LABELS,
  STUDENT_ID_LENGTH,
  linksToSave,
  newLinkDraft,
  nextPlatform,
  studentIdProblem,
  validateCandidate,
  type CandidateErrors,
  type CandidateForm,
  type LinkDraft,
} from "@/lib/ballot";
import { mottoText, partyColorFallbackClassName, partyColorStyle, partyInitial } from "@/lib/partylists";
import { formatStudentName, formatYear, getStudentInitials } from "@/lib/students";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/services/api/error-message";
import { createCandidate, deleteCandidate, updateCandidate } from "@/services/ballot/ballot.service";
import { SOCIAL_PLATFORMS, type Candidate, type Position, type SocialPlatform } from "@/types/ballot.types";
import type { Partylist } from "@/types/partylist.types";
import { useLeaving } from "@/hooks/use-leaving";
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
  /** An existing candidate's portrait was replaced from the photo editor (the dialog stays open). */
  onPortraitSaved: (candidate: Candidate) => void;
  onRemoved: (candidate: Candidate) => void;
}

const PARTY_INDEPENDENT = "__independent__";

const inputClassName = cn(fieldClassName, "rounded-md border-[#e4e8f0] text-[0.8125rem] dark:border-border");
const fieldLabelClassName = cn(labelClassName, "text-[0.6875rem]");
const hintClassName = "mt-1.5 text-[0.71875rem] leading-4 text-muted-foreground";
/** Outlined button (+ Add link). */
const secondaryButtonClassName = cn(dialogSecondaryClassName, "inline-flex items-center gap-1.5 px-4 text-[0.8125rem] font-semibold");

const platformOptions = SOCIAL_PLATFORMS.map((p) => ({ value: p, label: PLATFORM_LABELS[p] }));

/** Something that just replaced something else (student ID ↔ student card, party card, portrait) settles in. */
const swapInClassName = "animate-in fade-in zoom-in-[0.98] slide-in-from-top-1 duration-300 ease-out motion-reduce:animate-none";

function initialForm(target: CandidateDialogTarget): CandidateForm {
  if (target?.mode === "edit") {
    const c = target.candidate;
    return { studentId: c.studentId, positionId: c.positionId, partylistId: c.partylistId, motto: c.motto ?? "", links: c.socialLinks.map((l) => newLinkDraft(l)) };
  }
  return { studentId: "", positionId: target?.positionId ?? null, partylistId: null, motto: "", links: [] };
}

/** "Create candidate" and "Edit candidate": portrait on the left; student, position, party list, motto and links on the right. */
export function CandidateDialog({ target, electionId, positions, parties, students, candidates, onClose, onSaved, onPortraitSaved, onRemoved }: CandidateDialogProps) {
  const [form, setForm] = useState<CandidateForm>(() => initialForm(target));
  const [errors, setErrors] = useState<CandidateErrors>({});
  const [portrait, setPortrait] = useState<{ file: File; url: string } | null>(null);
  const [busy, setBusy] = useState<"save" | null>(null);
  /** The candidate being confirmed for removal (the delete confirmation is open). */
  const [removing, setRemoving] = useState<Candidate | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The photo editor, while it's open. */
  const [editor, setEditor] = useState<PhotoEditorRequest | null>(null);
  const editorRuns = useRef(0);
  /** The candidate as last saved from here (a new portrait is saved as soon as the editor closes). */
  const [savedCandidate, setSavedCandidate] = useState<Candidate | null>(null);
  /** Link rows playing their exit before they are removed. */
  const { leaving: leavingLinks, leave: leaveLink } = useLeaving();

  // Start from the target each time the dialog opens for something new.
  const [openedFor, setOpenedFor] = useState(target);
  if (target !== openedFor) {
    setOpenedFor(target);
    if (target) {
      setForm(initialForm(target));
      setErrors({});
      setPortrait(null);
      setRemoving(null);
      setError(null);
      setEditor(null);
      setSavedCandidate(null);
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

  function updateLink(key: string, patch: Partial<LinkDraft>) {
    update({ links: form.links.map((l) => (l.key === key ? { ...l, ...patch } : l)) });
  }

  async function save() {
    const found = validateCandidate(form, known, takenBy, editing?.id ?? null);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy("save");
    setError(null);
    try {
      const input = {
        studentId: form.studentId.trim(),
        positionId: form.positionId!,
        electionId,
        partylistId: form.partylistId,
        motto: form.motto.trim() || null,
        socialLinks: linksToSave(form.links),
      };
      const saved = editing ? await updateCandidate(editing.id, input, portrait?.file) : await createCandidate(input, portrait?.file);
      onSaved(saved, !editing);
      onClose();
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  function openEditor(photo: File | string | null) {
    editorRuns.current += 1;
    setError(null);
    setEditor({ id: editorRuns.current, photo });
  }

  /**
   * The edited portrait from the photo editor. An existing candidate's portrait is
   * replaced in the database right away (with their saved details, so unsaved form
   * changes aren't sent along); a new candidate's is uploaded on Create.
   */
  async function savePortrait(file: File) {
    if (editing) {
      const base = savedCandidate ?? editing;
      let saved: Candidate;
      try {
        saved = await updateCandidate(
          base.id,
          { studentId: base.studentId, positionId: base.positionId, electionId, partylistId: base.partylistId, motto: base.motto, socialLinks: base.socialLinks },
          file,
        );
      } catch (cause) {
        throw new Error(getApiErrorMessage(cause));
      }
      setSavedCandidate(saved);
      setPortrait(null);
      onPortraitSaved(saved);
    } else {
      setPortrait({ file, url: URL.createObjectURL(file) });
    }
    setEditor(null);
  }

  /** Runs from the delete confirmation; a failure is shown there. */
  async function remove(candidate: Candidate) {
    try {
      await deleteCandidate(candidate.id);
    } catch (cause) {
      throw new Error(getApiErrorMessage(cause));
    }
    onRemoved(candidate);
    onClose();
  }

  const portraitUrl = portrait?.url ?? (savedCandidate ?? editing)?.portraitUrl ?? null;
  const position = positions.find((p) => p.id === form.positionId);
  const party = parties.find((p) => p.id === form.partylistId) ?? null;
  const shownId = editing?.studentId ?? form.studentId;

  return (
    <DialogFrame open={target !== null} onOpenChange={(open) => !open && onClose()} locked={busy !== null} widthClassName="w-[min(45rem,calc(100vw-2rem))]">
      {shown ? (
        <>
          <DialogHeading
            eyebrow={shownId ? `Candidate · ${shownId}` : "Candidate"}
            title={editing ? "Edit candidate" : "Create candidate"}
            srDescription="Pick the student, their position and party list, and add a portrait, motto and links."
            closeDisabled={busy !== null}
          />

          <div className="grid max-h-[calc(100dvh-12rem)] grid-cols-1 gap-5 overflow-y-auto px-6 py-5 sm:grid-cols-[16rem_minmax(0,1fr)]">
            <div>
              <p className={cn(fieldLabelClassName, "mb-3")}>Portrait</p>
              <PortraitPicker
                url={portraitUrl}
                picked={portrait !== null}
                onEdit={() => openEditor(portrait?.file ?? portraitUrl)}
                onOpen={(file) => openEditor(file)}
                onUndo={() => setPortrait(null)}
              />
            </div>

            <div className="min-w-0 space-y-3.5">
              {editing || studentMatched ? (
                <div key="student" className={swapInClassName}>
                  <p className={fieldLabelClassName}>Student</p>
                  <StudentCard student={student} studentId={form.studentId} onClear={editing ? undefined : () => update({ studentId: "" })} />
                </div>
              ) : (
                <div key="student-id" className={swapInClassName}>
                  <label htmlFor="candidate-student-id" className={fieldLabelClassName}>
                    Student ID
                  </label>
                  <div className="relative">
                    <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
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
                      className={cn(inputClassName, "h-10.5 rounded-lg pl-9.5 tabular-nums")}
                    />
                  </div>
                  <p id="candidate-student-id-hint" className={cn(errors.studentId || liveStudentProblem ? errorClassName : hintClassName)}>
                    {liveStudentProblem ??
                      errors.studentId ??
                      (students
                        ? "11 digits · e.g. 02000334567. The student’s name appears once it matches."
                        : "11 digits · e.g. 02000334567. The student list couldn't be loaded, so names won't show.")}
                  </p>
                </div>
              )}

              <div>
                <p className={fieldLabelClassName}>Position</p>
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
                <p className={fieldLabelClassName}>Party list</p>
                <OptionMenu<string>
                  label="Party list"
                  value={form.partylistId ?? PARTY_INDEPENDENT}
                  options={[...parties.map((p) => ({ value: p.id, label: p.name })), { value: PARTY_INDEPENDENT, label: "Independent" }]}
                  onChange={(value) => update({ partylistId: !value || value === PARTY_INDEPENDENT ? null : value })}
                  triggerClassName="block w-full cursor-pointer rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-brand-blue/25"
                >
                  <PartyCard key={party?.id ?? "independent"} party={party} />
                </OptionMenu>
              </div>

              <div>
                <label htmlFor="candidate-motto" className={fieldLabelClassName}>
                  Motto
                </label>
                <input
                  id="candidate-motto"
                  value={form.motto}
                  onChange={(e) => update({ motto: e.target.value })}
                  placeholder="e.g. Transparent minutes posted every week"
                  maxLength={200}
                  className={inputClassName}
                />
              </div>

              <LinksField
                links={form.links}
                errors={errors.links}
                onChange={(key, patch) => updateLink(key, patch)}
                leaving={leavingLinks}
                onRemove={(key) =>
                  leaveLink([key], () => {
                    setForm((current) => ({ ...current, links: current.links.filter((l) => l.key !== key) }));
                    setError(null);
                  })
                }
                onAdd={() => update({ links: [...form.links, newLinkDraft({ platform: nextPlatform(form.links) })] })}
              />

              {error ? (
                <p role="alert" className="rounded-md bg-destructive/8 px-3 py-2 text-[0.8125rem] text-destructive">
                  {error}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2.5 border-t border-border px-6 py-4">
            {editing ? (
              <button type="button" onClick={() => setRemoving(editing)} disabled={busy !== null} className={cn(dialogDangerLinkClassName, "text-[0.8125rem]")}>
                Remove candidate
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2.5">
              <DialogCancel disabled={busy !== null} />
              <button type="button" onClick={() => void save()} disabled={busy !== null} className={cn(dialogPrimaryClassName, "inline-flex items-center gap-2")}>
                {busy === "save" ? <LoaderCircle aria-hidden className="size-3.5 animate-spin" /> : null}
                {editing ? "Save changes" : "Create"}
              </button>
            </div>
          </div>
        </>
      ) : null}

      <PhotoEditorDialog
        request={editor}
        onClose={() => setEditor(null)}
        onSave={savePortrait}
        title={editing ? "Edit portrait" : "Candidate portrait"}
        saveLabel={editing ? "Save portrait" : "Use photo"}
        preview={{
          name: student ? `${student.firstName} ${student.lastName}`.trim() : "Candidate",
          detail: `${position?.title ?? "Position"} · ${party?.name ?? "Independent"}`,
        }}
      />

      <ConfirmDeleteDialog
        item={removing}
        getKey={(c) => c.id}
        title={() => `Remove ${student ? `${student.firstName} ${student.lastName}`.trim() : "this candidate"}?`}
        description={() => "They're taken off the ballot. This can't be undone."}
        summary={(c) => (student ? `${c.studentId} · ${formatStudentName(student)}` : c.studentId)}
        confirmLabel="Remove candidate"
        onClose={() => setRemoving(null)}
        onConfirm={remove}
      />
    </DialogFrame>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Pieces                                   */
/* -------------------------------------------------------------------------- */

interface PortraitPickerProps {
  url: string | null;
  /** The shown photo was made here and isn't saved yet (new candidate). */
  picked: boolean;
  /** Opens the photo editor with the current photo. */
  onEdit: () => void;
  /** Opens the photo editor with a chosen or dropped file. */
  onOpen: (file: File) => void;
  onUndo: () => void;
}

/** The portrait, or a drop zone. Every photo goes through the photo editor before it's used. */
function PortraitPicker({ url, picked, onEdit, onOpen, onUndo }: PortraitPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const dropProps = {
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) onOpen(file);
    },
  };

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept={IMAGE_TYPES.join(",")}
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={(e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (file) onOpen(file);
      }}
    />
  );

  if (url) {
    return (
      <div {...dropProps} className="flex h-80 justify-center rounded-[0.875rem] bg-background">
        <div
          key={url}
          className={cn(
            swapInClassName,
            "group/portrait relative h-full w-58.5 max-w-full overflow-hidden rounded-[0.875rem] border-2 bg-muted bg-cover bg-top transition-colors duration-200",
            dragging ? "border-brand-blue/60" : "border-[#e4e8f0] dark:border-border",
          )}
          style={{ backgroundImage: `url("${url}")` }}
        >
          <button
            type="button"
            onClick={onEdit}
            aria-label="Edit the photo in the photo editor"
            className="absolute inset-0 cursor-pointer outline-none focus-visible:ring-3 focus-visible:ring-brand-blue/30 focus-visible:ring-inset"
          />
          <div className="absolute top-3.5 right-3 flex gap-1.5">
            {picked ? (
              <button type="button" onClick={onUndo} aria-label="Remove the new photo" title="Remove" className="flex size-6.5 cursor-pointer items-center justify-center rounded-lg bg-white text-brand-muted shadow-sm outline-none hover:text-brand-navy focus-visible:ring-2 focus-visible:ring-brand-blue/40">
                <X aria-hidden className="size-4" />
              </button>
            ) : null}
            <button type="button" onClick={onEdit} aria-label="Edit the photo" title="Edit photo" className="flex size-6.5 cursor-pointer items-center justify-center rounded-lg bg-white text-brand-muted shadow-sm outline-none hover:text-brand-navy focus-visible:ring-2 focus-visible:ring-brand-blue/40">
              <Pencil aria-hidden className="size-4" strokeWidth={1.75} />
            </button>
          </div>
          {dragging ? (
            <span className="pointer-events-none absolute inset-x-3 bottom-3 rounded-full bg-white px-3 py-1.5 text-center text-[0.75rem] font-semibold text-brand-blue shadow-sm">Drop to edit this photo</span>
          ) : null}
        </div>
        {fileInput}
      </div>
    );
  }

  return (
    <div
      {...dropProps}
      className={cn(
        "group/drop flex h-80 flex-col items-center justify-center gap-3 rounded-[0.875rem] border-[1.5px] border-dashed px-6 py-5 text-center transition-[border-color,background-color] duration-200 hover:border-brand-blue/35",
        dragging ? "border-brand-blue/60 bg-brand-blue/4" : "border-[#e4e8f0] dark:border-white/15",
      )}
    >
      <span className={cn("flex size-11 items-center justify-center rounded-[0.875rem] bg-brand-blue/10 text-brand-blue transition-transform duration-300 ease-out group-hover/drop:-translate-y-0.5 motion-reduce:transition-none dark:text-[#7aa7e6]", dragging && "-translate-y-1 scale-110")}>
        <Upload aria-hidden className="size-5" strokeWidth={1.75} />
      </span>
      <p className="mt-3 text-[0.875rem] leading-5 font-semibold text-foreground">Drag and drop a photo</p>
      <p className="text-[0.75rem] leading-5 text-muted-foreground">
        or choose a file · JPG/PNG/WebP
        <br />
        4:5 · framed in the photo editor
      </p>
      <button type="button" onClick={() => inputRef.current?.click()} className={cn(dialogPrimaryClassName, "mt-3 h-8.5 px-4 text-[0.8125rem]")}>
        Choose photo
      </button>
      {fileInput}
    </div>
  );
}

function StudentCard({ student, studentId, onClear }: { student: Student | null; studentId: string; onClear?: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[#e4e8f0] py-2.5 pr-3.5 pl-3 dark:border-border">
      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[#e4e8f0] bg-background text-[0.75rem] font-medium text-muted-foreground dark:border-border">
        {student ? getStudentInitials(student) : "?"}
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate text-[0.875rem] font-medium text-foreground">{student ? formatStudentName(student) : "Student"}</p>
        <p className="truncate text-[0.75rem] text-muted-foreground">
          {studentId}
          {student?.email ? ` · ${student.email}` : ""}
        </p>
        <p className="truncate text-[0.6875rem] leading-3.5 text-muted-foreground">
          Career: {student?.careerCode ?? "—"}
          <span aria-hidden>{"  ·  "}</span>
          Program: {student?.program ?? "—"}
          <span aria-hidden>{"  ·  "}</span>
          Level: {formatYear(student?.year ?? null)}
        </p>
      </div>
      <span role="img" aria-label="Student found" className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#34c759] text-white">
        <Check aria-hidden className="size-3" strokeWidth={3} />
      </span>
      {onClear ? (
        <button type="button" onClick={onClear} aria-label="Enter another student ID" title="Change student" className="-mr-1.5 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand-blue/30">
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
      <span className={cn("flex min-h-17.5 items-center justify-between gap-3 rounded-lg border border-[#e4e8f0] p-3.5 transition-colors duration-200 hover:bg-muted/50 dark:border-border", swapInClassName)}>
        <span className="text-[0.875rem] font-medium text-foreground">Independent</span>
        <span className="flex items-center gap-1 text-[0.78125rem] font-medium text-foreground">
          Change <Caret className="text-current" />
        </span>
      </span>
    );
  }
  const style = partyColorStyle(party.color);
  const motto = mottoText(party.motto);
  return (
    <span
      className={cn(
        "flex min-h-17.5 items-center gap-2.5 rounded-lg p-3.5 transition-[filter,box-shadow] duration-200 hover:brightness-[1.04] hover:shadow-[0_10px_24px_-16px_rgb(15_23_42/0.5)]",
        swapInClassName,
        !style && partyColorFallbackClassName,
      )}
      style={style}
    >
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white bg-cover bg-center text-[1.125rem] font-semibold text-[#334155]"
        style={party.logoUrl ? { backgroundImage: `url("${party.logoUrl}")` } : undefined}
      >
        {party.logoUrl ? null : partyInitial(party.name)}
      </span>
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="block truncate text-[1.125rem] leading-5.5 font-semibold">{party.name}</span>
        {motto ? <span className="block truncate text-[0.75rem]">“{motto}”</span> : null}
      </span>
      <span className="flex shrink-0 items-center gap-1 text-[0.78125rem] font-medium">
        Change <Caret className="text-current" />
      </span>
    </span>
  );
}

interface LinksFieldProps {
  links: readonly LinkDraft[];
  errors: Record<string, string> | undefined;
  /** Rows playing their exit animation. */
  leaving: ReadonlySet<string>;
  onChange: (key: string, patch: Partial<LinkDraft>) => void;
  onRemove: (key: string) => void;
  onAdd: () => void;
}

/** Platform + URL rows with a remove button each, then "+ Add link". */
function LinksField({ links, errors, leaving, onChange, onRemove, onAdd }: LinksFieldProps) {
  return (
    <div role="group" aria-labelledby="candidate-links-label" className="space-y-3">
      <div className="space-y-1">
        <p id="candidate-links-label" className="text-[0.6875rem] leading-4 font-semibold text-foreground">
          Links
        </p>
        <p className="text-[0.6875rem] leading-4 text-muted-foreground">Choose a platform and paste the full URL.</p>
      </div>

      {links.map((link) => {
        const problem = errors?.[link.key];
        const urlId = `candidate-link-${link.key}`;
        const name = PLATFORM_LABELS[link.platform];
        return (
          <div key={link.key} className={cn(swapInClassName, leaving.has(link.key) && motionStyles.rowOut)}>
            <div className="grid grid-cols-[6.875rem_minmax(0,1fr)_1.25rem] items-end gap-2">
              <div>
                <p className={fieldLabelClassName}>Platform</p>
                <OptionMenu<SocialPlatform>
                  label="Platform"
                  value={link.platform}
                  options={platformOptions}
                  onChange={(value) => value && onChange(link.key, { platform: value })}
                  triggerClassName={cn(inputClassName, "cursor-pointer gap-1 text-[0.75rem]")}
                >
                  <span className="truncate">{name}</span>
                  <Caret />
                </OptionMenu>
              </div>
              <div className="min-w-0">
                <label htmlFor={urlId} className={fieldLabelClassName}>
                  URL
                </label>
                <input
                  id={urlId}
                  type="url"
                  value={link.url}
                  onChange={(e) => onChange(link.key, { url: e.target.value })}
                  placeholder={link.platform === "website" ? "https://" : `https://${link.platform === "x" ? "x" : link.platform}.com/…`}
                  maxLength={500}
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={!!problem || undefined}
                  aria-describedby={problem ? `${urlId}-error` : undefined}
                  className={cn(inputClassName, "text-[0.75rem]")}
                />
              </div>
              <button
                type="button"
                onClick={() => onRemove(link.key)}
                aria-label={`Remove the ${name} link`}
                title="Remove link"
                className="flex h-10 cursor-pointer items-center justify-center rounded-md text-brand-muted outline-none transition-colors hover:text-destructive focus-visible:ring-2 focus-visible:ring-brand-blue/30"
              >
                <Trash2 aria-hidden className="size-5" strokeWidth={1.75} />
              </button>
            </div>
            {problem ? (
              <p id={`${urlId}-error`} className={cn(errorClassName, "ml-29")}>
                {problem}
              </p>
            ) : null}
          </div>
        );
      })}

      {links.length < MAX_LINKS ? (
        <button type="button" onClick={onAdd} className={secondaryButtonClassName}>
          <Plus aria-hidden className="size-3.5" strokeWidth={2.2} />
          Add link
        </button>
      ) : (
        <p className="text-[0.6875rem] text-muted-foreground">Up to {MAX_LINKS} links.</p>
      )}
    </div>
  );
}
