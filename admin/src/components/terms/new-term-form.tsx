"use client";

import { useState, type FormEvent, type Ref } from "react";

import { Caret, OptionMenu } from "@/components/students/option-menu";
import { addDays, type IsoDate } from "@/lib/dates";
import { formatAcadYear, normalizeAcadYear, predictNextTermId, suggestNextTerm, validateTerm, type TermFieldErrors } from "@/lib/terms";
import { cn } from "@/lib/utils";
import type { NewTermInput, Term } from "@/types/term.types";

import { DatePicker } from "./date-picker";
import { errorClassName, eyebrowClassName, fieldClassName, labelClassName } from "@/components/shared/form-styles";
import styles from "@/components/shared/motion.module.css";

const TERM_NUMBER_OPTIONS = [1, 2, 3].map((n) => ({ value: n, label: String(n) }));

interface Values {
  acadYear: string;
  startDate: IsoDate | null;
  endDate: IsoDate | null;
  termNumber: number | null;
}

const EMPTY: Values = { acadYear: "", startDate: null, endDate: null, termNumber: null };

interface NewTermFormProps {
  terms: readonly Term[];
  today: IsoDate;
  /** Saves the term; rejects with a user-facing message when the API refuses it. */
  onCreate: (input: NewTermInput) => Promise<void>;
  firstFieldRef?: Ref<HTMLInputElement>;
  className?: string;
}

/**
 * "New term" card. Fields left empty use the suggestion shown as their
 * placeholder (the term after the newest one).
 */
export function NewTermForm({ terms, today, onCreate, firstFieldRef, className }: NewTermFormProps) {
  const [values, setValues] = useState<Values>(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const suggestion = suggestNextTerm(terms, today);
  const input: NewTermInput = {
    acadYear: values.acadYear.trim() ? normalizeAcadYear(values.acadYear) : suggestion.acadYear,
    termNumber: values.termNumber ?? suggestion.termNumber,
    startDate: values.startDate ?? suggestion.startDate,
    endDate: values.endDate ?? suggestion.endDate,
  };
  const errors: TermFieldErrors = submitted ? validateTerm(input, terms) : {};

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setServerError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSubmitted(true);
    setServerError(null);

    const form = event.currentTarget;
    if (Object.keys(validateTerm(input, terms)).length > 0) {
      requestAnimationFrame(() => form.querySelector<HTMLElement>("[aria-invalid=true]")?.focus());
      return;
    }

    setSaving(true);
    try {
      await onCreate(input);
      setValues(EMPTY);
      setSubmitted(false);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Couldn't create the term. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const describedBy = (key: keyof TermFieldErrors) => (errors[key] ? `new-term-${key}-error` : undefined);
  const fieldError = (key: keyof TermFieldErrors) =>
    errors[key] ? (
      <p id={`new-term-${key}-error`} className={cn(errorClassName, styles.fieldError)}>
        {errors[key]}
      </p>
    ) : null;

  return (
    <section
      aria-labelledby="new-term-title"
      className={cn(
        "rounded-xl border border-border bg-card shadow-[0_1px_2px_rgb(15_23_42/0.04),0_8px_24px_-18px_rgb(15_23_42/0.25)] transition-shadow duration-300 focus-within:shadow-[0_1px_2px_rgb(15_23_42/0.05),0_14px_32px_-18px_rgb(15_23_42/0.35)] dark:shadow-none",
        styles.riseIn,
        className,
      )}
      style={{ animationDelay: "120ms" }}
    >
      <h2 id="new-term-title" className={cn("flex h-11.75 items-center border-b border-border px-5", eyebrowClassName)}>
        New term
      </h2>

      <form noValidate onSubmit={handleSubmit} aria-busy={saving} className="flex flex-col gap-3.5 px-5 pt-5 pb-5">
        <div>
          <label htmlFor="new-term-acadYear" className={labelClassName}>
            Academic year
          </label>
          <input
            ref={firstFieldRef}
            id="new-term-acadYear"
            autoComplete="off"
            inputMode="numeric"
            maxLength={11}
            placeholder={formatAcadYear(suggestion.acadYear)}
            value={values.acadYear}
            onChange={(e) => set("acadYear", e.target.value)}
            aria-invalid={errors.acadYear ? true : undefined}
            aria-describedby={describedBy("acadYear")}
            className={cn(fieldClassName, "tabular-nums")}
          />
          {fieldError("acadYear")}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label htmlFor="new-term-startDate" className={labelClassName}>
              Start date
            </label>
            <DatePicker
              id="new-term-startDate"
              label="Start date"
              value={values.startDate}
              onChange={(date) => set("startDate", date)}
              today={today}
              placeholder={suggestion.startDate}
              max={values.endDate ? addDays(values.endDate, -1) : null}
              rangeStart={input.startDate}
              rangeEnd={input.endDate}
              invalid={!!errors.startDate}
              describedBy={describedBy("startDate")}
            />
            {fieldError("startDate")}
          </div>
          <div>
            <label htmlFor="new-term-endDate" className={labelClassName}>
              End date
            </label>
            <DatePicker
              id="new-term-endDate"
              label="End date"
              value={values.endDate}
              onChange={(date) => set("endDate", date)}
              today={today}
              placeholder={suggestion.endDate}
              min={addDays(input.startDate, 1)}
              rangeStart={input.startDate}
              rangeEnd={input.endDate}
              invalid={!!errors.endDate}
              describedBy={describedBy("endDate")}
              align="end"
            />
          </div>
        </div>
        {errors.endDate ? <div className="-mt-2.5">{fieldError("endDate")}</div> : null}

        <div>
          <p className={labelClassName}>Term no.</p>
          <OptionMenu<number>
            label="Term number"
            value={values.termNumber}
            options={TERM_NUMBER_OPTIONS}
            onChange={(n) => set("termNumber", n)}
            invalid={!!errors.termNumber}
            triggerClassName={cn(fieldClassName, "cursor-pointer gap-1")}
          >
            <span className={cn(values.termNumber === null && "text-muted-foreground")}>{input.termNumber}</span>
            <Caret />
          </OptionMenu>
          {fieldError("termNumber")}
        </div>

        <div>
          <p className="text-[0.75rem] leading-4 font-semibold text-foreground">Term ID · auto-generated</p>
          <p className="mt-1 flex items-baseline justify-between gap-3 leading-4">
            <span className="min-w-0 truncate font-mono text-[0.78125rem] text-foreground/75">
              {predictNextTermId(terms)} <span className="text-muted-foreground">· term ID</span>
            </span>
            <span className="shrink-0 font-mono text-[0.6875rem] text-brand-blue dark:text-[#7aa7e6]">auto</span>
          </p>
        </div>

        {serverError ? (
          <p role="alert" className={cn("rounded-md bg-destructive/8 px-3 py-2 text-[0.75rem] leading-4.5 text-destructive", styles.fieldError)}>
            {serverError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={saving}
          className={cn(
            "mt-0.5 h-9 w-full cursor-pointer rounded-md bg-primary text-[0.8125rem] font-semibold text-primary-foreground outline-none",
            "transition-[background-color,box-shadow,translate,opacity] duration-200 ease-out",
            "hover:-translate-y-px hover:bg-[color-mix(in_oklab,var(--color-brand-navy)_86%,var(--color-brand-blue))] hover:shadow-[0_10px_22px_-12px_var(--color-brand-blue)]",
            "focus-visible:ring-3 focus-visible:ring-brand-blue/30 active:translate-y-0 motion-reduce:hover:translate-y-0 dark:hover:bg-white/90",
            "disabled:cursor-wait disabled:opacity-60 disabled:hover:translate-y-0",
          )}
        >
          {saving ? "Creating…" : "Create term"}
        </button>
      </form>
    </section>
  );
}
