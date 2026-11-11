"use client";

import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { ArrowRight, X } from "lucide-react";

import { Caret, OptionMenu } from "@/components/students/option-menu";
import { toolbarButtonClassName } from "@/components/students/student-toolbar-styles";
import { formatAcadYear, sortTerms } from "@/lib/terms";
import { cn } from "@/lib/utils";
import type { EnrollmentSummary, Term } from "@/types/term.types";

import { fieldClassName, labelClassName } from "./form-styles";
import styles from "./terms.module.css";

interface RolloverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  terms: readonly Term[];
  /** `null` when the enrollments couldn't be loaded. */
  enrollments: readonly EnrollmentSummary[] | null;
  currentTerm: Term | null;
  /** Moves the students; resolves with how many changed. */
  onRollover: (from: Term, to: Term, studentIds: string[]) => Promise<void>;
}

/**
 * Moves the students who are active in one term into another (usually the new
 * term). The backend keeps one enrollment per student, so this updates it.
 */
export function RolloverDialog({ open, onOpenChange, terms, enrollments, currentTerm, onRollover }: RolloverDialogProps) {
  const [saving, setSaving] = useState(false);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && saving) return;
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop
          data-themed
          className="fixed inset-0 z-50 bg-brand-background/45 backdrop-blur-[1.5px] transition-opacity duration-250 ease-out data-ending-style:opacity-0 data-starting-style:opacity-0"
        />
        <Dialog.Popup
          data-themed
          className={cn(
            "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[min(33rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto",
            "rounded-xl border border-border bg-popover text-popover-foreground shadow-[0_28px_70px_-22px_rgb(11_18_32/0.5)] outline-none",
            "transition-[opacity,scale,translate] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)]",
            "data-starting-style:translate-y-[calc(-50%+8px)] data-starting-style:scale-[0.96] data-starting-style:opacity-0",
            "data-ending-style:translate-y-[calc(-50%+4px)] data-ending-style:scale-[0.97] data-ending-style:opacity-0",
            "motion-reduce:transition-opacity",
          )}
        >
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

        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
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

  const termSelect = (id: string, label: string, value: string | null, onChange: (v: string | null) => void, align: "start" | "end") => (
    <div className="min-w-0 flex-1">
      <p id={`${id}-label`} className={labelClassName}>
        {label}
      </p>
      <OptionMenu<string> label={label} value={value} options={options} onChange={onChange} align={align} triggerClassName={cn(fieldClassName, "cursor-pointer gap-1")}>
        <span className={cn("min-w-0 truncate font-mono text-[0.8125rem]", !value && "text-muted-foreground")}>{value ?? "Pick a term"}</span>
        <Caret className="ml-auto" />
      </OptionMenu>
    </div>
  );

  return (
    <>
      <div className="flex items-start justify-between gap-4 border-b border-border px-6 pt-5 pb-4.5">
        <div>
          <p className="font-mono text-[0.6875rem] tracking-[0.12em] text-muted-foreground uppercase">Enrollment</p>
          <Dialog.Title className="mt-1 text-[1.375rem] leading-7 font-semibold tracking-tight text-foreground">Roll over enrollment</Dialog.Title>
          <Dialog.Description className="mt-1.5 text-[0.8125rem] leading-5 text-muted-foreground">
            Moves students who are active in one term into another. Year levels stay the same; update them on the Students page.
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

      <div className="px-6 py-5">
        <div className="flex items-end gap-3">
          {termSelect("rollover-from", "From term", fromId, setFromId, "start")}
          <ArrowRight aria-hidden className="mb-3 size-4 shrink-0 text-muted-foreground" />
          {termSelect("rollover-to", "Into term", toId, setToId, "end")}
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
        <Dialog.Close disabled={saving} className={cn(toolbarButtonClassName, "h-9 px-4 text-[0.875rem] font-medium text-foreground")}>
          Cancel
        </Dialog.Close>
        <button
          type="button"
          disabled={!!problem || saving}
          onClick={() => void confirm()}
          className="h-9 cursor-pointer rounded-md bg-primary px-4 text-[0.875rem] font-semibold text-primary-foreground outline-none transition-[background-color,opacity] duration-200 hover:bg-[color-mix(in_oklab,var(--color-brand-navy)_86%,var(--color-brand-blue))] focus-visible:ring-3 focus-visible:ring-brand-blue/30 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/90"
        >
          {saving ? "Moving…" : students.length && !problem ? `Move ${students.length} student${students.length === 1 ? "" : "s"}` : "Move students"}
        </button>
      </div>
    </>
  );
}
