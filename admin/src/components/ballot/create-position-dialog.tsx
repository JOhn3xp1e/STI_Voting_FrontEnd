"use client";

import { useRef, useState, type FormEvent } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { LoaderCircle, Minus, Plus, X } from "lucide-react";

import { DialogFrame, dialogPrimaryClassName } from "@/components/shared/dialog-frame";
import { errorClassName, fieldClassName, labelClassName } from "@/components/shared/form-styles";
import { toolbarButtonClassName } from "@/components/students/student-toolbar-styles";
import { MAX_SEATS, validatePosition, type PositionErrors, type PositionForm } from "@/lib/ballot";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/services/api/error-message";
import { createPosition } from "@/services/ballot/ballot.service";
import type { Position } from "@/types/ballot.types";

const EMPTY_FORM: PositionForm = { title: "", seats: "1" };

const inputClassName = cn(fieldClassName, "rounded-lg border-[#e4e8f0] dark:border-border");

/** The square − / + beside the seat number. */
const stepButtonClassName = cn(
  toolbarButtonClassName,
  "size-10 shrink-0 justify-center rounded-lg px-0 text-foreground active:scale-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100",
  "transition-[background-color,border-color,color,scale] motion-reduce:active:scale-100",
);

interface CreatePositionDialogProps {
  open: boolean;
  electionId: string;
  /** The election's positions, to catch a repeated title before the API does. */
  positions: readonly Position[];
  onClose: () => void;
  onCreated: (position: Position) => void;
}

/** "1 · Create position": a name and how many seats it has. Candidates are added to it afterwards. */
export function CreatePositionDialog({ open, electionId, positions, onClose, onCreated }: CreatePositionDialogProps) {
  const [form, setForm] = useState<PositionForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<PositionErrors>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seatsRef = useRef<HTMLInputElement>(null);

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

  const seats = Number(form.seats);
  const seatsValid = Number.isInteger(seats);

  /** − / +: steps the seat number within 1…MAX_SEATS, with a small nudge on the number. */
  function step(delta: 1 | -1) {
    const next = Math.min(MAX_SEATS, Math.max(1, (seatsValid ? seats : 1) + delta));
    update({ seats: String(next) });
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      seatsRef.current?.animate(
        [{ transform: `translateY(${delta > 0 ? -3 : 3}px)`, opacity: 0.55 }, { transform: "translateY(0)", opacity: 1 }],
        { duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      );
    }
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
    <DialogFrame open={open} onOpenChange={(next) => !next && onClose()} locked={saving} widthClassName="w-[min(22.5rem,calc(100vw-2rem))]">
      <form onSubmit={(e) => void submit(e)} noValidate>
        <div className="flex h-12.5 items-center justify-between gap-3 border-b border-[#e4e8f0] pr-3 pl-5 dark:border-border">
          <Dialog.Title className="font-mono text-[0.75rem] font-medium tracking-[0.14em] text-foreground uppercase">1 · Create position</Dialog.Title>
          <Dialog.Close
            aria-label="Close"
            disabled={saving}
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-wait disabled:opacity-50"
          >
            <X aria-hidden className="size-4" />
          </Dialog.Close>
        </div>

        <div className="space-y-3.5 px-5 pt-4 pb-5">
          <Dialog.Description className="text-[0.8125rem] leading-5 text-foreground/85">Create a position before assigning candidates.</Dialog.Description>

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
              className={inputClassName}
            />
            {errors.title ? (
              <p id="position-title-error" className={cn(errorClassName, "animate-in duration-200 fade-in slide-in-from-top-0.5 motion-reduce:animate-none")}>
                {errors.title}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="position-seats" className={labelClassName}>
              Seat number
            </label>
            <div className="flex items-center gap-2.5">
              <input
                ref={seatsRef}
                id="position-seats"
                type="text"
                inputMode="numeric"
                value={form.seats}
                onChange={(e) => update({ seats: e.target.value.replace(/\D/g, "").slice(0, 2) })}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                    e.preventDefault();
                    step(e.key === "ArrowUp" ? 1 : -1);
                  }
                }}
                aria-invalid={!!errors.seats || undefined}
                aria-describedby={errors.seats ? "position-seats-error" : "position-seats-hint"}
                className={cn(inputClassName, "min-w-0 flex-1 tabular-nums")}
              />
              <button type="button" onClick={() => step(-1)} disabled={seatsValid && seats <= 1} aria-label="One seat fewer" className={stepButtonClassName}>
                <Minus aria-hidden className="size-4" strokeWidth={2} />
              </button>
              <button type="button" onClick={() => step(1)} disabled={seatsValid && seats >= MAX_SEATS} aria-label="One seat more" className={stepButtonClassName}>
                <Plus aria-hidden className="size-4" strokeWidth={2} />
              </button>
            </div>
            <p
              id={errors.seats ? "position-seats-error" : "position-seats-hint"}
              className={errors.seats ? cn(errorClassName, "animate-in duration-200 fade-in motion-reduce:animate-none") : "mt-1.5 text-[0.6875rem] leading-4 text-muted-foreground"}
            >
              {errors.seats ?? "How many candidates each voter can pick for this position."}
            </p>
          </div>

          {error ? (
            <p role="alert" className="animate-in rounded-md bg-destructive/8 px-3 py-2 text-[0.8125rem] text-destructive duration-200 fade-in motion-reduce:animate-none">
              {error}
            </p>
          ) : null}

          <button type="submit" disabled={saving} className={cn(dialogPrimaryClassName, "inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg")}>
            {saving ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}
            {saving ? "Creating…" : "Create position"}
          </button>
        </div>
      </form>
    </DialogFrame>
  );
}
