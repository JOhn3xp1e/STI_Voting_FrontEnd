"use client";

import { useRef, useState, type ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Lock, Trash2, X } from "lucide-react";

import { toolbarButtonClassName } from "@/components/students/student-toolbar-styles";
import { addDays, type IsoDate } from "@/lib/dates";
import { formatAcadYear, getTermStatus, validateTerm, type TermFieldErrors } from "@/lib/terms";
import { cn } from "@/lib/utils";
import type { Term, TermUsage } from "@/types/term.types";

import { DatePicker } from "./date-picker";
import { errorClassName, fieldClassName, labelClassName } from "./form-styles";
import styles from "./terms.module.css";

/* -------------------------------------------------------------------------- */
/*                                Shared frame                                */
/* -------------------------------------------------------------------------- */

const STATUS_LABEL = { current: "Current", upcoming: "Upcoming", ended: "Ended" } as const;

const primaryClassName = cn(
  "h-9 cursor-pointer rounded-md bg-primary px-4 text-[0.875rem] font-semibold text-primary-foreground outline-none",
  "transition-[background-color,opacity,translate] duration-200 hover:bg-[color-mix(in_oklab,var(--color-brand-navy)_86%,var(--color-brand-blue))]",
  "focus-visible:ring-3 focus-visible:ring-brand-blue/30 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/90",
);

const secondaryClassName = cn(toolbarButtonClassName, "h-9 px-4 text-[0.875rem] font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-50");

interface FrameProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Blocks closing (Escape, backdrop, ×) while saving. */
  locked: boolean;
  widthClassName: string;
  children: ReactNode;
}

function DialogFrame({ open, onOpenChange, locked, widthClassName, children }: FrameProps) {
  // Focus the dialog itself on open (not the × button); Tab then reaches the fields.
  const popupRef = useRef<HTMLDivElement>(null);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && locked) return;
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop
          data-themed
          className="fixed inset-0 z-50 bg-brand-background/45 backdrop-blur-[1.5px] transition-opacity duration-250 ease-out data-ending-style:opacity-0 data-starting-style:opacity-0"
        />
        <Dialog.Popup
          ref={popupRef}
          data-themed
          initialFocus={popupRef}
          className={cn(
            "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto",
            "rounded-xl border border-border bg-popover text-popover-foreground shadow-[0_28px_70px_-22px_rgb(11_18_32/0.5)] outline-none",
            "transition-[opacity,scale,translate] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)]",
            "data-starting-style:translate-y-[calc(-50%+8px)] data-starting-style:scale-[0.96] data-starting-style:opacity-0",
            "data-ending-style:translate-y-[calc(-50%+4px)] data-ending-style:scale-[0.97] data-ending-style:opacity-0",
            "motion-reduce:transition-opacity",
            widthClassName,
          )}
        >
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Keeps showing the last term while a dialog animates closed. */
function useLastTerm(term: Term | null) {
  const [last, setLast] = useState(term);
  if (term && term !== last) setLast(term);
  return term ?? last;
}

/* -------------------------------------------------------------------------- */
/*                                  Edit term                                 */
/* -------------------------------------------------------------------------- */

interface EditTermDialogProps {
  term: Term | null;
  terms: readonly Term[];
  today: IsoDate;
  onClose: () => void;
  /** Saves new dates; rejects with a user-facing message. */
  onSave: (term: Term, startDate: IsoDate, endDate: IsoDate) => Promise<void>;
  onRequestDelete: (term: Term) => void;
}

export function EditTermDialog({ term, terms, today, onClose, onSave, onRequestDelete }: EditTermDialogProps) {
  const shown = useLastTerm(term);
  const [saving, setSaving] = useState(false);

  return (
    <DialogFrame open={term !== null} onOpenChange={(open) => !open && onClose()} locked={saving} widthClassName="w-[min(35rem,calc(100vw-2rem))]">
      {shown ? (
        <EditTermForm
          key={shown.id}
          term={shown}
          terms={terms}
          today={today}
          saving={saving}
          setSaving={setSaving}
          onSave={onSave}
          onClose={onClose}
          onRequestDelete={onRequestDelete}
        />
      ) : null}
    </DialogFrame>
  );
}

interface EditTermFormProps extends Omit<EditTermDialogProps, "term"> {
  term: Term;
  saving: boolean;
  setSaving: (saving: boolean) => void;
}

function EditTermForm({ term, terms, today, saving, setSaving, onSave, onClose, onRequestDelete }: EditTermFormProps) {
  const [startDate, setStartDate] = useState(term.startDate);
  const [endDate, setEndDate] = useState(term.endDate);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const input = { acadYear: term.acadYear, termNumber: term.termNumber, startDate, endDate };
  const errors: TermFieldErrors = submitted ? validateTerm(input, terms, term.id) : {};
  const changed = startDate !== term.startDate || endDate !== term.endDate;

  async function save() {
    setSubmitted(true);
    setServerError(null);
    if (Object.keys(validateTerm(input, terms, term.id)).length > 0) return;
    if (!changed) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await onSave(term, startDate, endDate);
      onClose();
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Couldn't save the term. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const locked = "Can't be changed after the term is created";

  return (
    <form
      noValidate
      aria-busy={saving}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="flex items-start justify-between gap-4 border-b border-border px-6 pt-5 pb-4.5">
        <div>
          <p className="font-mono text-[0.6875rem] tracking-[0.12em] text-muted-foreground uppercase">Term · {term.id}</p>
          <Dialog.Title className="mt-1 text-[1.375rem] leading-7 font-semibold tracking-tight text-foreground">Edit term</Dialog.Title>
          <Dialog.Description className="sr-only">
            Change the start and end dates of {formatAcadYear(term.acadYear)} term {term.termNumber}.
          </Dialog.Description>
        </div>
        <Dialog.Close
          aria-label="Close"
          disabled={saving}
          className="-mr-1.5 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-wait disabled:opacity-50"
        >
          <X aria-hidden className="size-4" />
        </Dialog.Close>
      </div>

      <div className="grid grid-cols-1 gap-x-3 gap-y-4 px-6 py-5 sm:grid-cols-2">
        <div>
          <label htmlFor="edit-term-acadYear" className={labelClassName}>
            Academic year
          </label>
          <div className="relative" title={locked}>
            <input id="edit-term-acadYear" value={formatAcadYear(term.acadYear)} disabled className={cn(fieldClassName, "pr-8")} />
            <Lock aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted-foreground/70" />
          </div>
        </div>
        <div>
          <label htmlFor="edit-term-number" className={labelClassName}>
            Term no.
          </label>
          <div className="relative" title={locked}>
            <button id="edit-term-number" type="button" disabled className={cn(fieldClassName, "gap-1 pr-8")}>
              {term.termNumber}
              <span aria-hidden className="text-[0.625rem] text-muted-foreground">
                ▾
              </span>
            </button>
            <Lock aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted-foreground/70" />
          </div>
        </div>
        <div>
          <label htmlFor="edit-term-startDate" className={labelClassName}>
            Start date
          </label>
          <DatePicker
            id="edit-term-startDate"
            label="Start date"
            value={startDate}
            onChange={(date) => {
              setStartDate(date);
              setServerError(null);
            }}
            today={today}
            max={addDays(endDate, -1)}
            rangeStart={startDate}
            rangeEnd={endDate}
            invalid={!!errors.startDate}
          />
        </div>
        <div>
          <label htmlFor="edit-term-endDate" className={labelClassName}>
            End date
          </label>
          <DatePicker
            id="edit-term-endDate"
            label="End date"
            value={endDate}
            onChange={(date) => {
              setEndDate(date);
              setServerError(null);
            }}
            today={today}
            min={addDays(startDate, 1)}
            rangeStart={startDate}
            rangeEnd={endDate}
            invalid={!!errors.endDate}
            describedBy={errors.endDate ? "edit-term-date-error" : undefined}
            align="end"
          />
        </div>
        {errors.startDate || errors.endDate ? (
          <p id="edit-term-date-error" role="alert" className={cn(errorClassName, "-mt-2 sm:col-span-2", styles.fieldError)}>
            {errors.startDate ?? errors.endDate}
          </p>
        ) : null}
        {serverError ? (
          <p role="alert" className={cn("rounded-md bg-destructive/8 px-3 py-2 text-[0.8125rem] text-destructive sm:col-span-2", styles.fieldError)}>
            {serverError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4">
        <button
          type="button"
          disabled={saving}
          onClick={() => onRequestDelete(term)}
          className="-ml-1 cursor-pointer rounded-md px-1 text-[0.875rem] font-medium text-destructive outline-none transition-colors hover:text-[color-mix(in_oklab,var(--color-destructive)_80%,black)] focus-visible:ring-2 focus-visible:ring-destructive/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Delete term
        </button>
        <div className="flex gap-2.5">
          <Dialog.Close disabled={saving} className={secondaryClassName}>
            Cancel
          </Dialog.Close>
          <button type="submit" disabled={saving} className={primaryClassName}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 Delete term                                */
/* -------------------------------------------------------------------------- */

interface DeleteTermDialogProps {
  term: Term | null;
  /** `null` when the counts couldn't be loaded (the backend still refuses a used term). */
  usage: TermUsage | null;
  today: IsoDate;
  onClose: () => void;
  onConfirm: (term: Term) => Promise<void>;
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function DeleteTermDialog({ term, usage, today, onClose, onConfirm }: DeleteTermDialogProps) {
  const shown = useLastTerm(term);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorFor, setErrorFor] = useState(term?.id);
  if (term && term.id !== errorFor) {
    setErrorFor(term.id);
    setError(null);
  }

  const inUse = usage !== null && usage.enrollments + usage.elections > 0;
  const uses = usage
    ? [usage.enrollments && plural(usage.enrollments, "enrollment"), usage.elections && plural(usage.elections, "election")].filter(Boolean).join(" and ")
    : "";

  async function confirm() {
    if (!shown || deleting || inUse) return;
    setDeleting(true);
    setError(null);
    try {
      await onConfirm(shown);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't delete the term. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <DialogFrame open={term !== null} onOpenChange={(open) => !open && onClose()} locked={deleting} widthClassName="w-[min(30rem,calc(100vw-2rem))]">
      {shown ? (
        <>
          <div className="px-6 pt-6 pb-5">
            <span className={cn("flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive", styles.trashIn)}>
              <Trash2 aria-hidden className="size-4.5" strokeWidth={1.9} />
            </span>
            <Dialog.Title className="mt-4 text-[1.375rem] leading-7 font-semibold tracking-tight text-foreground">
              Delete {shown.id}?
            </Dialog.Title>
            <Dialog.Description className="mt-2.5 text-[0.875rem] leading-5 text-muted-foreground">
              Only terms with no enrollments or elections can be deleted.{" "}
              {usage === null
                ? "If this one is still in use, it won't be deleted."
                : inUse
                  ? `This one has ${uses}, so it can't be deleted.`
                  : "This one has none."}
            </Dialog.Description>
            <p className="mt-4 rounded-md border border-border px-3 py-2.5 font-mono text-[0.75rem] text-foreground">
              {shown.id} · {shown.acadYear} · Term {shown.termNumber} · {STATUS_LABEL[getTermStatus(shown, today)]}
            </p>
            {error ? (
              <p role="alert" className={cn("mt-3 rounded-md bg-destructive/8 px-3 py-2 text-[0.8125rem] text-destructive", styles.fieldError)}>
                {error}
              </p>
            ) : null}
          </div>
          <div className="flex justify-end gap-2.5 border-t border-border px-6 py-4">
            <Dialog.Close disabled={deleting} className={secondaryClassName}>
              Cancel
            </Dialog.Close>
            <button
              type="button"
              disabled={deleting || inUse}
              onClick={() => void confirm()}
              className="h-9 cursor-pointer rounded-md bg-[#b42318] px-4 text-[0.875rem] font-semibold text-white outline-none transition-[background-color,opacity] duration-200 hover:bg-[#9a1d14] focus-visible:ring-3 focus-visible:ring-destructive/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete term"}
            </button>
          </div>
        </>
      ) : null}
    </DialogFrame>
  );
}
