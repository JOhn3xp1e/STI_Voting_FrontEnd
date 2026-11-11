"use client";

import { useState, type FormEvent, type ReactNode, type Ref } from "react";

import { CURRENT_TERM, PROGRAMS, TERMS, TERM_LABELS, YEAR_LEVELS, buildStudentEmail } from "@/lib/mock/students.mock";
import { STUDENT_NO_PATTERN, formatYear } from "@/lib/students";
import { cn } from "@/lib/utils";
import type { ProgramCode, Student, YearLevel } from "@/types/student.types";

import { Caret, OptionMenu } from "./option-menu";
import styles from "./students.module.css";

/** Example values shown as placeholders (the reference's sample student). */
const EXAMPLE = { studentNo: "02000799331", lastName: "Acosta", firstName: "Angelina Kate", middleName: "Millena" };
/** Defaults used when a dropdown is left untouched (shown as its placeholder). */
const DEFAULTS = { program: "BSIT" as ProgramCode, year: 1 as YearLevel, term: CURRENT_TERM };

const PROGRAM_OPTIONS = PROGRAMS.map((p) => ({ value: p, label: p }));
const YEAR_OPTIONS = YEAR_LEVELS.map((y) => ({ value: y, label: formatYear(y) }));
const TERM_OPTIONS = TERMS.map((t) => ({ value: t, label: t, hint: TERM_LABELS[t] }));

interface FormValues {
  studentNo: string;
  lastName: string;
  firstName: string;
  middleName: string;
  program: ProgramCode | null;
  year: YearLevel | null;
  term: string | null;
}

const EMPTY: FormValues = { studentNo: "", lastName: "", firstName: "", middleName: "", program: null, year: null, term: null };

type Errors = Partial<Record<"studentNo" | "lastName" | "firstName", string>>;

const inputClassName = cn(
  "h-10 w-full rounded-md border border-border bg-background px-3 text-[0.875rem] text-foreground outline-none placeholder:text-muted-foreground/90",
  "transition-[border-color,box-shadow] duration-200 hover:border-[color-mix(in_oklab,var(--color-brand-muted)_38%,transparent)]",
  "focus:border-brand-blue/60 focus:ring-3 focus:ring-brand-blue/15",
  "aria-invalid:border-destructive/60 aria-invalid:focus:ring-destructive/15",
);

const selectClassName = cn(
  inputClassName,
  "flex cursor-pointer items-center gap-0.5 pr-1 pl-2.5 text-left text-[0.8125rem] tracking-[-0.01em] data-popup-open:border-brand-blue/60 data-popup-open:ring-3 data-popup-open:ring-brand-blue/15",
);

function Field({ id, label, error, children, className }: { id: string; label: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-[0.75rem] leading-4 font-semibold text-foreground">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className={cn("mt-1 text-[0.6875rem] leading-4 text-destructive", styles.fieldError)}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface AddStudentFormProps {
  existingStudentNos: ReadonlySet<string>;
  onAdd: (student: Student) => void;
  /** First field, focused by the toolbar's "+ Add student". */
  firstFieldRef?: Ref<HTMLInputElement>;
  className?: string;
}

/** "Add student" card: validates locally and adds the student to the page's local list only. */
export function AddStudentForm({ existingStudentNos, onAdd, firstFieldRef, className }: AddStudentFormProps) {
  const [values, setValues] = useState<FormValues>(EMPTY);
  const [submitted, setSubmitted] = useState(false);

  const studentNo = values.studentNo.trim();
  const lastName = values.lastName.trim();
  const firstName = values.firstName.trim();

  const errors: Errors = {};
  if (submitted) {
    if (!studentNo) errors.studentNo = "Enter the student number.";
    else if (!STUDENT_NO_PATTERN.test(studentNo)) errors.studentNo = "Student No. must be 11 digits.";
    else if (existingStudentNos.has(studentNo)) errors.studentNo = "This student is already on the roster.";
    if (!lastName) errors.lastName = "Required.";
    if (!firstName) errors.firstName = "Required.";
  }

  // Email preview follows what's typed; falls back to the example while incomplete.
  const emailReady = lastName.length > 0 && studentNo.length >= 6;
  const email = emailReady ? buildStudentEmail(lastName, studentNo) : buildStudentEmail(EXAMPLE.lastName, EXAMPLE.studentNo);

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);

    const valid =
      STUDENT_NO_PATTERN.test(studentNo) && !existingStudentNos.has(studentNo) && lastName.length > 0 && firstName.length > 0;
    if (!valid) {
      const form = event.currentTarget;
      requestAnimationFrame(() => form.querySelector<HTMLElement>("[aria-invalid=true]")?.focus());
      return;
    }

    onAdd({
      studentNo,
      lastName,
      firstName,
      middleName: values.middleName.trim() || undefined,
      email: buildStudentEmail(lastName, studentNo),
      program: values.program ?? DEFAULTS.program,
      year: values.year ?? DEFAULTS.year,
      term: values.term ?? DEFAULTS.term,
      inactive: false,
    });
    setValues(EMPTY);
    setSubmitted(false);
    event.currentTarget.querySelector<HTMLInputElement>("#add-studentNo")?.focus();
  }

  const describedBy = (key: keyof Errors) => (errors[key] ? `add-${key}-error` : undefined);

  return (
    <section
      aria-labelledby="add-student-title"
      className={cn(
        "rounded-xl border border-border bg-card shadow-[0_1px_2px_rgb(15_23_42/0.04),0_8px_24px_-18px_rgb(15_23_42/0.25)] transition-shadow duration-300 focus-within:shadow-[0_1px_2px_rgb(15_23_42/0.05),0_14px_32px_-18px_rgb(15_23_42/0.35)] dark:shadow-none",
        className,
      )}
    >
      <h2
        id="add-student-title"
        className="flex h-11.75 items-center border-b border-border px-5 font-mono text-[0.6875rem] font-semibold tracking-[0.14em] text-foreground uppercase"
      >
        Add student
      </h2>

      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-2.75 px-5 pt-4 pb-5">
        <Field id="add-studentNo" label="Student No." error={errors.studentNo}>
          <input
            ref={firstFieldRef}
            id="add-studentNo"
            inputMode="numeric"
            autoComplete="off"
            maxLength={11}
            placeholder={EXAMPLE.studentNo}
            value={values.studentNo}
            onChange={(e) => set("studentNo", e.target.value.replace(/\D/g, ""))}
            aria-invalid={errors.studentNo ? true : undefined}
            aria-describedby={describedBy("studentNo")}
            className={cn(inputClassName, "tabular-nums")}
          />
        </Field>

        <div className="grid grid-cols-2 gap-2.5">
          <Field id="add-lastName" label="Last name" error={errors.lastName}>
            <input
              id="add-lastName"
              autoComplete="off"
              placeholder={EXAMPLE.lastName}
              value={values.lastName}
              onChange={(e) => set("lastName", e.target.value)}
              aria-invalid={errors.lastName ? true : undefined}
              aria-describedby={describedBy("lastName")}
              className={inputClassName}
            />
          </Field>
          <Field id="add-firstName" label="First name" error={errors.firstName}>
            <input
              id="add-firstName"
              autoComplete="off"
              placeholder={EXAMPLE.firstName}
              value={values.firstName}
              onChange={(e) => set("firstName", e.target.value)}
              aria-invalid={errors.firstName ? true : undefined}
              aria-describedby={describedBy("firstName")}
              className={inputClassName}
            />
          </Field>
        </div>

        <Field id="add-middleName" label="Middle name (optional)">
          <input
            id="add-middleName"
            autoComplete="off"
            placeholder={EXAMPLE.middleName}
            value={values.middleName}
            onChange={(e) => set("middleName", e.target.value)}
            className={inputClassName}
          />
        </Field>

        <div>
          <p className="text-[0.75rem] leading-4 font-semibold text-foreground">Email · auto-generated</p>
          <p className="mt-1 flex items-baseline justify-between gap-3 leading-4" aria-live="polite">
            <span
              className={cn(
                "min-w-0 truncate font-mono text-[0.78125rem] transition-colors duration-200",
                emailReady ? "text-foreground" : "text-foreground/75",
              )}
            >
              {email}
            </span>
            <span className="shrink-0 font-mono text-[0.6875rem] text-brand-blue dark:text-[#7aa7e6]">auto</span>
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <div>
            <p className="mb-1 text-[0.75rem] leading-4 font-semibold text-foreground">Program</p>
            <OptionMenu<ProgramCode>
              label="Program"
              value={values.program}
              options={PROGRAM_OPTIONS}
              onChange={(v) => set("program", v)}
              triggerClassName={selectClassName}
            >
              <span className={cn("min-w-0 truncate", !values.program && "text-muted-foreground")}>{values.program ?? DEFAULTS.program}</span>
              <Caret />
            </OptionMenu>
          </div>
          <div>
            <p className="mb-1 text-[0.75rem] leading-4 font-semibold text-foreground">Year</p>
            <OptionMenu<YearLevel>
              label="Year"
              value={values.year}
              options={YEAR_OPTIONS}
              onChange={(v) => set("year", v)}
              triggerClassName={selectClassName}
            >
              <span className={cn("min-w-0 truncate", !values.year && "text-muted-foreground")}>
                {formatYear(values.year ?? DEFAULTS.year)}
              </span>
              <Caret />
            </OptionMenu>
          </div>
          <div>
            <p className="mb-1 text-[0.75rem] leading-4 font-semibold text-foreground">Term</p>
            <OptionMenu<string>
              label="Term"
              value={values.term}
              options={TERM_OPTIONS}
              onChange={(v) => set("term", v)}
              align="end"
              triggerClassName={selectClassName}
            >
              <span className={cn("min-w-0 truncate", !values.term && "text-muted-foreground")}>{values.term ?? DEFAULTS.term}</span>
              <Caret />
            </OptionMenu>
          </div>
        </div>

        <button
          type="submit"
          className={cn(
            "h-8.5 w-full cursor-pointer rounded-md bg-primary text-[0.8125rem] font-semibold text-primary-foreground outline-none",
            "transition-[background-color,box-shadow,translate] duration-200 ease-out",
            "hover:-translate-y-px hover:bg-[color-mix(in_oklab,var(--color-brand-navy)_86%,var(--color-brand-blue))] hover:shadow-[0_10px_22px_-12px_var(--color-brand-blue)]",
            "focus-visible:ring-3 focus-visible:ring-brand-blue/30 active:translate-y-0 motion-reduce:hover:translate-y-0 dark:hover:bg-white/90",
          )}
        >
          Add student &amp; enroll
        </button>
      </form>
    </section>
  );
}
