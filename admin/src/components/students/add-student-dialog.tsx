"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

import { DialogCancel, DialogFrame, DialogHeading, dialogPrimaryClassName } from "@/components/shared/dialog-frame";
import { fieldClassName, labelClassName } from "@/components/shared/form-styles";
import { careerForProgram, careerLevels } from "@/lib/student-import";
import { EMAIL_DOMAIN, STUDENT_NO_PATTERN, buildStudentEmail, formatYear } from "@/lib/students";
import { cn } from "@/lib/utils";
import type { CareerOption, Student, YearLevel } from "@/types/student.types";

import { Caret, OptionMenu } from "./option-menu";
import { useStudentCatalog } from "./student-catalog";
import styles from "./students.module.css";

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Program picker value: a program code, or `@JHS` for a career without programs. */
type Placement = string;

interface FormValues {
  studentNo: string;
  email: string;
  firstName: string;
  lastName: string;
  placement: Placement | null;
  year: YearLevel | null;
}

const EMPTY: FormValues = { studentNo: "", email: "", firstName: "", lastName: "", placement: null, year: null };

type Errors = Partial<Record<"studentNo" | "email" | "firstName" | "lastName" | "placement", string>>;

interface AddStudentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingStudentNos: ReadonlySet<string>;
  /** Lowercased emails already on the roster (emails must be unique). */
  existingEmails: ReadonlySet<string>;
  /** Saves the student; rejects with a user-facing message when the API refuses it. */
  onAdd: (student: Student) => Promise<void>;
}

/** "Add student": creates the student and enrolls them in the current term. */
export function AddStudentDialog({ open, onOpenChange, existingStudentNos, existingEmails, onAdd }: AddStudentDialogProps) {
  const { careers, programs, programNames, currentTerm, yearLevels } = useStudentCatalog();
  const [values, setValues] = useState<FormValues>(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Start empty each time it opens.
  const [openedFor, setOpenedFor] = useState(open);
  if (open !== openedFor) {
    setOpenedFor(open);
    if (open) {
      setValues(EMPTY);
      setSubmitted(false);
      setServerError(null);
    }
  }

  /** Every program (with its career), then careers that have no programs (e.g. JHS). */
  const placements = useMemo(() => {
    const options: { value: Placement; label: string; hint: string; career: CareerOption | null; program: string | null }[] = [];
    for (const program of programs) {
      const career = careerForProgram(program, careers) ?? (careers.length === 1 ? careers[0] : null);
      const name = programNames[program];
      options.push({ value: program, label: name ? `${program} · ${name}` : program, hint: career?.code ?? "", career, program });
    }
    for (const career of careers.filter((c) => c.programs.length === 0)) {
      options.push({ value: `@${career.code}`, label: `${career.code} · ${career.name}`, hint: "no program", career, program: null });
    }
    return options;
  }, [programs, programNames, careers]);

  const placement = placements.find((p) => p.value === values.placement) ?? placements.find((p) => p.value === "BSIT") ?? placements[0] ?? null;
  const levels = careerLevels(placement?.career ?? null, yearLevels);
  const year = values.year !== null && levels.includes(values.year) ? values.year : (levels[0] ?? null);

  const studentNo = values.studentNo.trim();
  const firstName = values.firstName.trim();
  const lastName = values.lastName.trim();
  const generatedEmail = lastName && studentNo.length >= 6 ? buildStudentEmail(lastName, studentNo) : null;
  const email = (values.email.trim() || generatedEmail || "").toLowerCase();

  const errors: Errors = {};
  if (submitted) {
    if (!studentNo) errors.studentNo = "Enter the student ID.";
    else if (!STUDENT_NO_PATTERN.test(studentNo)) errors.studentNo = "Student ID must be 11 digits.";
    else if (existingStudentNos.has(studentNo)) errors.studentNo = "This student is already on the roster.";
    if (!firstName) errors.firstName = "Required.";
    else if (firstName.length < 2) errors.firstName = "At least 2 letters.";
    if (!lastName) errors.lastName = "Required.";
    else if (lastName.length < 2) errors.lastName = "At least 2 letters.";
    if (email && !EMAIL_PATTERN.test(email)) errors.email = "Enter a valid email.";
    else if (email && existingEmails.has(email)) errors.email = "Another student already uses this email.";
    if (!placement?.career) errors.placement = placement ? `${placement.program} isn't listed under a career yet.` : "Add a program first.";
  }

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setServerError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSubmitted(true);
    setServerError(null);
    const form = event.currentTarget;

    const valid =
      STUDENT_NO_PATTERN.test(studentNo) &&
      !existingStudentNos.has(studentNo) &&
      firstName.length >= 2 &&
      lastName.length >= 2 &&
      EMAIL_PATTERN.test(email) &&
      !existingEmails.has(email) &&
      !!placement?.career;
    if (!valid) {
      requestAnimationFrame(() => form.querySelector<HTMLElement>("[aria-invalid=true]")?.focus());
      return;
    }
    if (!currentTerm || year === null) {
      setServerError("Add a term on the Terms page first, then try again.");
      return;
    }

    setSaving(true);
    try {
      await onAdd({
        studentNo,
        lastName,
        firstName,
        email,
        careerCode: placement!.career!.code,
        program: placement!.program,
        year,
        term: currentTerm.id,
        enrollmentStatus: "Active",
      });
      onOpenChange(false);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Couldn't add the student. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const invalid = (key: keyof Errors) => (errors[key] ? { "aria-invalid": true as const, "aria-describedby": `add-${key}-error` } : {});
  const inputClassName = cn(fieldClassName, "border-[#e4e8f0] dark:border-border");

  return (
    <DialogFrame open={open} onOpenChange={(next) => onOpenChange(next)} locked={saving} widthClassName="w-[min(32.5rem,calc(100vw-2rem))]">
      <form noValidate onSubmit={(e) => void submit(e)} aria-busy={saving}>
        <DialogHeading eyebrow="New student" title="Add student" srDescription="Adds the student and enrolls them in the current term." closeDisabled={saving} />

        <div className="grid grid-cols-1 gap-x-3 gap-y-3.5 px-6 pt-5 pb-5 sm:grid-cols-2">
          <Field id="add-studentNo" label="Student ID" error={errors.studentNo} index={0}>
            <input
              id="add-studentNo"
              autoFocus
              inputMode="numeric"
              autoComplete="off"
              maxLength={11}
              placeholder="e.g. 02000398588"
              value={values.studentNo}
              onChange={(e) => set("studentNo", e.target.value.replace(/\D/g, ""))}
              className={cn(inputClassName, "tabular-nums")}
              {...invalid("studentNo")}
            />
          </Field>
          <Field id="add-email" label="Email" error={errors.email} index={1}>
            <input
              id="add-email"
              type="email"
              autoComplete="off"
              spellCheck={false}
              placeholder={generatedEmail ?? `name@${EMAIL_DOMAIN}`}
              value={values.email}
              onChange={(e) => set("email", e.target.value)}
              className={cn(inputClassName, "placeholder:transition-colors", generatedEmail && "placeholder:text-foreground/55")}
              {...invalid("email")}
            />
          </Field>
          <Field id="add-firstName" label="First name" error={errors.firstName} index={2}>
            <input id="add-firstName" autoComplete="off" placeholder="e.g. Juan" value={values.firstName} onChange={(e) => set("firstName", e.target.value)} className={inputClassName} {...invalid("firstName")} />
          </Field>
          <Field id="add-lastName" label="Last name" error={errors.lastName} index={3}>
            <input id="add-lastName" autoComplete="off" placeholder="e.g. Dela Cruz" value={values.lastName} onChange={(e) => set("lastName", e.target.value)} className={inputClassName} {...invalid("lastName")} />
          </Field>
          <Field id="add-placement" label="Program" error={errors.placement} index={4}>
            <OptionMenu<Placement>
              id="add-placement"
              label="Program"
              value={placement?.value ?? null}
              options={placements.map(({ value, label, hint }) => ({ value, label, hint }))}
              onChange={(value) => value && set("placement", value)}
              invalid={!!errors.placement}
              triggerClassName={cn(inputClassName, "cursor-pointer gap-1")}
            >
              <span className={cn("min-w-0 truncate", !placement && "text-muted-foreground")}>{placement?.label ?? "No programs yet"}</span>
              <Caret />
            </OptionMenu>
          </Field>
          <Field id="add-year" label="Year level" index={5}>
            <OptionMenu<YearLevel>
              id="add-year"
              label="Year level"
              value={year}
              options={levels.map((y) => ({ value: y, label: y <= 4 ? `${formatYear(y)} year` : `Grade ${y}` }))}
              onChange={(value) => value !== null && set("year", value)}
              triggerClassName={cn(inputClassName, "cursor-pointer gap-1")}
            >
              <span key={year ?? "none"} className="min-w-0 truncate animate-in fade-in duration-200 motion-reduce:animate-none">
                {year === null ? "—" : year <= 4 ? `${formatYear(year)} year` : `Grade ${year}`}
              </span>
              <Caret />
            </OptionMenu>
          </Field>

          <div
            className="flex h-10 items-center justify-between gap-3 rounded-md border border-[#e4e8f0] px-3 text-[0.8125rem] animate-in fade-in slide-in-from-bottom-1 duration-300 fill-mode-both motion-reduce:animate-none sm:col-span-2 dark:border-border"
            style={{ animationDelay: "240ms" }}
          >
            <span className="text-muted-foreground">Enrolled in · current term</span>
            {currentTerm ? (
              <span className="font-mono text-[0.75rem] text-foreground">{currentTerm.id}</span>
            ) : (
              <span className="text-[0.75rem] text-destructive">No term yet</span>
            )}
          </div>

          {serverError ? (
            <p role="alert" className={cn("rounded-md bg-destructive/8 px-3 py-2 text-[0.8125rem] leading-5 text-destructive sm:col-span-2", styles.fieldError)}>
              {serverError}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2.5 border-t border-border px-6 py-4">
          <DialogCancel disabled={saving} />
          <button type="submit" disabled={saving} className={cn(dialogPrimaryClassName, "inline-flex items-center gap-2")}>
            {saving ? <LoaderCircle aria-hidden className="size-3.5 animate-spin" /> : null}
            {saving ? "Adding…" : "Add student"}
          </button>
        </div>
      </form>
    </DialogFrame>
  );
}

/** Label + control + error; fields settle in one after another when the dialog opens. */
function Field({ id, label, error, index, children }: { id: string; label: string; error?: string; index: number; children: ReactNode }) {
  return (
    <div className="min-w-0 animate-in fade-in slide-in-from-bottom-1 duration-300 fill-mode-both motion-reduce:animate-none" style={{ animationDelay: `${60 + index * 30}ms` }}>
      <label htmlFor={id} className={labelClassName}>
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
