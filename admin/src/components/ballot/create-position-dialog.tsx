"use client";

import { useState, type FormEvent } from "react";

import { DialogCancel, DialogFrame, DialogHeading, dialogPrimaryClassName } from "@/components/shared/dialog-frame";
import { errorClassName, fieldClassName, labelClassName } from "@/components/shared/form-styles";
import { MAX_SEATS, validatePosition, type PositionErrors, type PositionForm } from "@/lib/ballot";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/services/api/error-message";
import { createPosition } from "@/services/ballot/ballot.service";
import type { Position } from "@/types/ballot.types";

const EMPTY_FORM: PositionForm = { title: "", seats: "1" };

interface CreatePositionDialogProps {
  open: boolean;
  electionId: string;
  /** The election's positions, to catch a repeated title before the API does. */
  positions: readonly Position[];
  onClose: () => void;
  onCreated: (position: Position) => void;
}

/** "Create position": a name and how many seats it has. Candidates are added to it afterwards. */
export function CreatePositionDialog({ open, electionId, positions, onClose, onCreated }: CreatePositionDialogProps) {
  const [form, setForm] = useState<PositionForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<PositionErrors>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start empty each time the dialog opens.
  const [openedFor, setOpenedFor] = useState(open);
  if (open !== openedFor) {
    setOpenedFor(open);
    if (open) {
      setForm(EMPTY_FORM);
      setErrors({});
      setError(null);
    }
  }

  function update(patch: Partial<PositionForm>) {
    const next = { ...form, ...patch };
    setForm(next);
    if (Object.keys(errors).length) setErrors(validatePosition(next, positions));
    setError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found = validatePosition(form, positions);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createPosition({ title: form.title, maxVotes: Number(form.seats), electionId });
      onCreated(created);
      onClose();
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogFrame open={open} onOpenChange={(next) => !next && onClose()} locked={saving} widthClassName="w-[min(26rem,calc(100vw-2rem))]">
      <form onSubmit={(e) => void submit(e)} noValidate>
        <DialogHeading eyebrow="Ballot" title="Create position" description="Create a position before assigning candidates." closeDisabled={saving} />
        <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3 px-6 pt-5 pb-5">
          <div>
            <label htmlFor="position-title" className={labelClassName}>
              Position name
            </label>
            <input
              id="position-title"
              autoFocus
              value={form.title}
              onChange={(e) => update({ title: e.target.value })}
              placeholder="e.g. Vice President"
              maxLength={100}
              aria-invalid={!!errors.title || undefined}
              aria-describedby={errors.title ? "position-title-error" : undefined}
              className={fieldClassName}
            />
            {errors.title ? (
              <p id="position-title-error" className={errorClassName}>
                {errors.title}
              </p>
            ) : null}
          </div>
          <div>
            <label htmlFor="position-seats" className={labelClassName}>
              Seats
            </label>
            <input
              id="position-seats"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_SEATS}
              value={form.seats}
              onChange={(e) => update({ seats: e.target.value })}
              aria-invalid={!!errors.seats || undefined}
              aria-describedby={errors.seats ? "position-seats-error" : "position-seats-hint"}
              className={cn(fieldClassName, "tabular-nums")}
            />
          </div>
          <p id={errors.seats ? "position-seats-error" : "position-seats-hint"} className={cn("col-span-2 -mt-1.5", errors.seats ? errorClassName : "text-[0.6875rem] leading-4 text-muted-foreground")}>
            {errors.seats ?? "Seats: how many candidates each voter can pick for this position."}
          </p>
          {error ? (
            <p role="alert" className="col-span-2 rounded-md bg-destructive/8 px-3 py-2 text-[0.8125rem] text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex justify-end gap-2.5 border-t border-border px-6 py-4">
          <DialogCancel disabled={saving} />
          <button type="submit" disabled={saving} className={dialogPrimaryClassName}>
            {saving ? "Creating…" : "Create position"}
          </button>
        </div>
      </form>
    </DialogFrame>
  );
}
