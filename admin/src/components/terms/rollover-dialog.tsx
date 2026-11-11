"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";

import { DialogCancel, DialogFrame, DialogHeading, dialogPrimaryClassName } from "@/components/shared/dialog-frame";
import { fieldClassName, labelClassName } from "@/components/shared/form-styles";
import styles from "@/components/shared/motion.module.css";
import { Caret, OptionMenu } from "@/components/students/option-menu";
import { formatAcadYear, sortTerms } from "@/lib/terms";
import { cn } from "@/lib/utils";
import type { EnrollmentSummary, Term } from "@/types/term.types";

interface RolloverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  terms: readonly Term[];
  /** `null` when the enrollments couldn't be loaded. */
  enrollments: readonly EnrollmentSummary[] | null;
  currentTerm: Term | null;
  /** Moves the students; rejects with a user-facing message. */
  onRollover: (from: Term, to: Term, studentIds: string[]) => Promise<void>;
}

/**
 * Moves the students who are active in one term into another (usually the new
 * term). The backend keeps one enrollment per student, so this updates it.
 */
export function RolloverDialog({ open, onOpenChange, terms, enrollments, currentTerm, onRollover }: RolloverDialogProps) {
  const [saving, setSaving] = useState(false);

  return (
    <DialogFrame open={open} onOpenChange={onOpenChange} locked={saving} widthClassName="w-[min(33rem,calc(100vw-2rem))]">
      {/* The popup unmounts after closing, so the form starts fresh each time it opens. */}
      <RolloverForm
        terms={terms}
        enrollments={enrollments}
        currentTerm={currentTerm}
        saving={saving}
        setSaving={setSaving}
        onRollover={onRollover}
        onDone={() => onOpenChange(false)}
      />
    </DialogFrame>
  );
}

interface RolloverFormProps {
  terms: readonly Term[];
  enrollments: readonly EnrollmentSummary[] | null;
  currentTerm: Term | null;
  saving: boolean;
  setSaving: (saving: boolean) => void;
  onRollover: RolloverDialogProps["onRollover"];
  onDone: () => void;
}

function RolloverForm({ terms, enrollments, currentTerm, saving, setSaving, onRollover, onDone }: RolloverFormProps) {
  const sorted = sortTerms(terms);
  const activeIn = (termId: string) =>
    (enrollments ?? []).filter((e) => e.termId === termId && e.status.toLowerCase() === "active").map((e) => e.studentId);

  // Default: into the current term (else the newest), from the newest other term that has active students.
  const defaultTo = currentTerm ?? sorted[0] ?? null;
  const defaultFrom = sorted.find((t) => t.id !== defaultTo?.id && activeIn(t.id).length > 0) ?? sorted.find((t) => t.id !== defaultTo?.id) ?? null;

  const [fromId, setFromId] = useState<string | null>(defaultFrom?.id ?? null);
  const [toId, setToId] = useState<string | null>(defaultTo?.id ?? null);
  const [error, setError] = useState<string | null>(null);

  const from = terms.find((t) => t.id === fromId) ?? null;
  const to = terms.find((t) => t.id === toId) ?? null;
  const students = from ? activeIn(from.id) : [];
  const options = sorted.map((t) => ({
    value: t.id,
    label: t.id,
    hint: `${formatAcadYear(t.acadYear)} T${t.termNumber} · ${activeIn(t.id).length}`,
  }));

  const problem =
    enrollments === null
      ? "The enrollments couldn't be loaded. Reload the page and try again."
      : !from || !to
        ? "Pick both terms."
        : from.id === to.id
          ? "Pick two different terms."
          : students.length === 0
            ? `No active students are enrolled in ${from.id}.`
            : null;

  async function confirm() {
    if (!from || !to || problem || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onRollover(from, to, students);
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The roll-over failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const termSelect = (label: string, value: string | null, onChange: (v: string | null) => void, align: "start" | "end") => (
    <div className="min-w-0 flex-1">
      <p className={labelClassName}>{label}</p>
      <OptionMenu<string> label={label} value={value} options={options} onChange={onChange} align={align} triggerClassName={cn(fieldClassName, "cursor-pointer gap-1")}>
        <span className={cn("min-w-0 truncate font-mono text-[0.8125rem]", !value && "text-muted-foreground")}>{value ?? "Pick a term"}</span>
        <Caret className="ml-auto" />
      </OptionMenu>
    </div>
  );

  return (
    <>
      <DialogHeading
        eyebrow="Enrollment"
        title="Roll over enrollment"
        description="Moves students who are active in one term into another. Year levels stay the same; update them on the Students page."
        closeDisabled={saving}
      />

      <div className="px-6 py-5">
        <div className="flex items-end gap-3">
          {termSelect("From term", fromId, setFromId, "start")}
          <ArrowRight aria-hidden className="mb-3 size-4 shrink-0 text-muted-foreground" />
          {termSelect("Into term", toId, setToId, "end")}
        </div>

        <p
          key={`${fromId}-${toId}`}
          aria-live="polite"
          className={cn(
            "mt-4 rounded-md px-3 py-2.5 text-[0.8125rem] leading-5",
            styles.fieldError,
            problem ? "bg-muted/60 text-muted-foreground" : "bg-brand-blue/6 text-foreground dark:bg-white/5",
          )}
        >
          {problem ?? (
            <>
              <span className="font-semibold tabular-nums">{students.length}</span> active student{students.length === 1 ? "" : "s"} in{" "}
              <span className="font-mono">{from?.id}</span> will move to <span className="font-mono">{to?.id}</span>.
            </>
          )}
        </p>

        {error ? (
          <p role="alert" className={cn("mt-3 rounded-md bg-destructive/8 px-3 py-2 text-[0.8125rem] text-destructive", styles.fieldError)}>
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex justify-end gap-2.5 border-t border-border px-6 py-4">
        <DialogCancel disabled={saving} />
        <button type="button" disabled={!!problem || saving} onClick={() => void confirm()} className={dialogPrimaryClassName}>
          {saving ? "Moving…" : students.length && !problem ? `Move ${students.length} student${students.length === 1 ? "" : "s"}` : "Move students"}
        </button>
      </div>
    </>
  );
}
