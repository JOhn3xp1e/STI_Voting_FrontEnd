"use client";

import { useState } from "react";

import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import {
  DialogCancel,
  DialogFrame,
  DialogHeading,
  dialogDangerLinkClassName,
  dialogPrimaryClassName,
  useLastValue,
} from "@/components/shared/dialog-frame";
import { errorClassName, labelClassName } from "@/components/shared/form-styles";
import { LockedField } from "@/components/shared/locked-field";
import styles from "@/components/shared/motion.module.css";
import { addDays, type IsoDate } from "@/lib/dates";
import { formatAcadYear, getTermStatus, validateTerm, type TermFieldErrors } from "@/lib/terms";
import { cn } from "@/lib/utils";
import type { Term, TermUsage } from "@/types/term.types";

import { DatePicker } from "./date-picker";

const STATUS_LABEL = { current: "Current", upcoming: "Upcoming", ended: "Ended" } as const;

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
  const shown = useLastValue(term);
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

  return (
    <form
      noValidate
      aria-busy={saving}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <DialogHeading
        eyebrow={`Term · ${term.id}`}
        title="Edit term"
        srDescription={`Change the start and end dates of ${formatAcadYear(term.acadYear)} term ${term.termNumber}.`}
        closeDisabled={saving}
      />

      <div className="grid grid-cols-1 gap-x-3 gap-y-4 px-6 py-5 sm:grid-cols-2">
        <LockedField id="edit-term-acadYear" label="Academic year" value={formatAcadYear(term.acadYear)} />
        <LockedField id="edit-term-number" label="Term no." value={String(term.termNumber)} />
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
        <button type="button" disabled={saving} onClick={() => onRequestDelete(term)} className={dialogDangerLinkClassName}>
          Delete term
        </button>
        <div className="flex gap-2.5">
          <DialogCancel disabled={saving} />
          <button type="submit" disabled={saving} className={dialogPrimaryClassName}>
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
  const inUse = usage !== null && usage.enrollments + usage.elections > 0;
  const uses = usage
    ? [usage.enrollments && plural(usage.enrollments, "enrollment"), usage.elections && plural(usage.elections, "election")].filter(Boolean).join(" and ")
    : "";

  return (
    <ConfirmDeleteDialog
      item={term}
      getKey={(t) => t.id}
      title={(t) => `Delete ${t.id}?`}
      description={() =>
        `Only terms with no enrollments or elections can be deleted. ${
          usage === null ? "If this one is still in use, it won't be deleted." : inUse ? `This one has ${uses}, so it can't be deleted.` : "This one has none."
        }`
      }
      summary={(t) => `${t.id} · ${t.acadYear} · Term ${t.termNumber} · ${STATUS_LABEL[getTermStatus(t, today)]}`}
      blocked={() => inUse}
      confirmLabel="Delete term"
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
