"use client";

import { useState, type FormEvent, type ReactNode, type Ref } from "react";

import { STUDENT_NO_PATTERN, buildStudentEmail, formatYear } from "@/lib/students";
import { cn } from "@/lib/utils";
import type { ProgramCode, Student, YearLevel } from "@/types/student.types";

import { Caret, OptionMenu } from "./option-menu";
import { useStudentCatalog } from "./student-catalog";
import styles from "./students.module.css";

/** Example values shown as placeholders (the reference's sample student). */
const EXAMPLE = { studentNo: "02000799331", lastName: "Acosta", firstName: "Angelina Kate", middleName: "Millena" };

interface FormValues {
  studentNo: string;
  lastName: string;
  firstName: string;
  middleName: string;
  career: string | null;
  program: ProgramCode | null;
  year: YearLevel | null;
  term: string | null;
}

const EMPTY: FormValues = {
  studentNo: "",
  lastName: "",
  firstName: "",
  middleName: "",
  career: null,
  program: null,
  year: null,
  term: null,
};

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
  /** Lowercased emails already on the roster (emails must be unique). */
  existingEmails: ReadonlySet<string>;
  /** Saves the student; rejects with a user-facing message when the API refuses it. */
  onAdd: (student: Student) => Promise<void>;
  /** First field, focused by the toolbar's "+ Add student". */
  firstFieldRef?: Ref<HTMLInputElement>;
  className?: string;
}

/** "Add student" card: validates locally, then creates the student and their enrollment through the Web API. */
export function AddStudentForm({ existingStudentNos, existingEmails, onAdd, firstFieldRef, className }: AddStudentFormProps) {
  const { careers, programs, terms, currentTerm, yearLevels } = useStudentCatalog();

  const [values, setValues] = useState<FormValues>(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Defaults used when a dropdown is left untouched (shown as its placeholder).
  const defaults = {
    career: careers[0]?.code ?? null,
    program: programs.includes("BSIT") ? "BSIT" : (programs[0] ?? null),
    year: yearLevels[0] ?? null,
    term: currentTerm?.id ?? null,
  };
  const career = values.career ?? defaults.career;
  const program = values.program ?? defaults.program;
  const year = values.year ?? defaults.year;
  const term = values.term ?? defaults.term;

  const missingSetup = [!careers.length && "careers", !programs.length && "programs", !terms.length && "terms"].filter(Boolean);

  const careerOptions = careers.map((c) => ({ value: c.code, label: c.code, hint: c.name }));
  const programOptions = programs.map((p) => ({ value: p, label: p }));
  const yearOptions = yearLevels.map((y) => ({ value: y, label: formatYear(y) }));
  const termOptions = terms.map((t) => ({ value: t.id, label: t.id, hint: t.label }));

  const studentNo = values.studentNo.trim();
  const lastName = values.lastName.trim();
  const firstName = values.firstName.trim();

  const errors: Errors = {};
  if (submitted) {
    if (!studentNo) errors.studentNo = "Enter the student number.";
    else if (!STUDENT_NO_PATTERN.test(studentNo)) errors.studentNo = "Student No. must be 11 digits.";
    else if (existingStudentNos.has(studentNo)) errors.studentNo = "This student is already on the roster.";
    if (!lastName) errors.lastName = "Required.";
    else if (lastName.length < 2) errors.lastName = "At least 2 letters.";
    if (!firstName) errors.firstName = "Required.";
    else if (firstName.length < 2) errors.firstName = "At least 2 letters.";
  }

  // Email preview follows what's typed; falls back to the example while incomplete.
  const emailReady = lastName.length > 0 && studentNo.length >= 6;
  const email = emailReady ? buildStudentEmail(lastName, studentNo) : buildStudentEmail(EXAMPLE.lastName, EXAMPLE.studentNo);
  const emailTaken = emailReady && STUDENT_NO_PATTERN.test(studentNo) && existingEmails.has(email.toLowerCase());

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setServerError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSubmitted(true);
    setServerError(null);

    const form = event.currentTarget;
    const valid =
      STUDENT_NO_PATTERN.test(studentNo) &&
      !existingStudentNos.has(studentNo) &&
      lastName.length >= 2 &&
      firstName.length >= 2 &&
      !emailTaken;
    if (!valid) {
      requestAnimationFrame(() => form.querySelector<HTMLElement>("[aria-invalid=true]")?.focus());
      return;
    }
    if (!career || !program || year === null || !term) {
      setServerError(`Add ${missingSetup.join(", ") || "the missing options"} first, then try again.`);
      return;
    }

    setSaving(true);
    try {
      await onAdd({
        studentNo,
        lastName,
        firstName,
        middleName: values.middleName.trim() || undefined,
        email: buildStudentEmail(lastName, studentNo),
        careerCode: career,
        program,
        year,
        term,
        enrollmentStatus: "Active",
      });
      setValues(EMPTY);
      setSubmitted(false);
      form.querySelector<HTMLInputElement>("#add-studentNo")?.focus();
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Couldn't add the student. Please try again.");
    } finally {
      setSaving(false);
    }
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

      <form noValidate onSubmit={handleSubmit} aria-busy={saving} className="flex flex-col gap-2.75 px-5 pt-4 pb-5">
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
          {emailTaken ? (
            <p role="alert" className={cn("mt-1 text-[0.6875rem] leading-4 text-destructive", styles.fieldError)}>
              Another student already uses this email.
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <p className="mb-1 text-[0.75rem] leading-4 font-semibold text-foreground">Career</p>
            <OptionMenu<string>
              label="Career"
              value={values.career}
              options={careerOptions}
              onChange={(v) => set("career", v)}
              triggerClassName={selectClassName}
            >
              <span className={cn("min-w-0 truncate", !values.career && "text-muted-foreground")}>{career ?? "—"}</span>
              <Caret />
            </OptionMenu>
          </div>
          <div>
            <p className="mb-1 text-[0.75rem] leading-4 font-semibold text-foreground">Program</p>
            <OptionMenu<ProgramCode>
              label="Program"
              value={values.program}
              options={programOptions}
              onChange={(v) => set("program", v)}
              align="end"
              triggerClassName={selectClassName}
            >
              <span className={cn("min-w-0 truncate", !values.program && "text-muted-foreground")}>{program ?? "—"}</span>
              <Caret />
            </OptionMenu>
          </div>
          <div>
            <p className="mb-1 text-[0.75rem] leading-4 font-semibold text-foreground">Year</p>
            <OptionMenu<YearLevel>
              label="Year"
              value={values.year}
              options={yearOptions}
              onChange={(v) => set("year", v)}
              triggerClassName={selectClassName}
            >
              <span className={cn("min-w-0 truncate", values.year === null && "text-muted-foreground")}>{formatYear(year)}</span>
              <Caret />
            </OptionMenu>
          </div>
          <div>
            <p className="mb-1 text-[0.75rem] leading-4 font-semibold text-foreground">Term</p>
            <OptionMenu<string>
              label="Term"
              value={values.term}
              options={termOptions}
              onChange={(v) => set("term", v)}
              align="end"
              triggerClassName={selectClassName}
            >
              <span className={cn("min-w-0 truncate", !values.term && "text-muted-foreground")}>{term ?? "—"}</span>
              <Caret />
            </OptionMenu>
          </div>
        </div>

        {missingSetup.length ? (
          <p className="text-[0.6875rem] leading-4 text-muted-foreground">
            No {missingSetup.join(", ")} yet. Add them first so students can be enrolled.
          </p>
        ) : null}

        {serverError ? (
          <p role="alert" className="rounded-md bg-destructive/8 px-3 py-2 text-[0.75rem] leading-4.5 text-destructive">
            {serverError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={saving}
          className={cn(
            "h-8.5 w-full cursor-pointer rounded-md bg-primary text-[0.8125rem] font-semibold text-primary-foreground outline-none",
            "transition-[background-color,box-shadow,translate,opacity] duration-200 ease-out",
            "hover:-translate-y-px hover:bg-[color-mix(in_oklab,var(--color-brand-navy)_86%,var(--color-brand-blue))] hover:shadow-[0_10px_22px_-12px_var(--color-brand-blue)]",
            "focus-visible:ring-3 focus-visible:ring-brand-blue/30 active:translate-y-0 motion-reduce:hover:translate-y-0 dark:hover:bg-white/90",
            "disabled:cursor-wait disabled:opacity-60 disabled:hover:translate-y-0",
          )}
        >
          {saving ? "Saving…" : "Add student & enroll"}
        </button>
      </form>
    </section>
  );
}
