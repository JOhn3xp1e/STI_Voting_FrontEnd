"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { LoaderCircle, X } from "lucide-react";

import { dialogPrimaryClassName, dialogSecondaryClassName } from "@/components/shared/dialog-frame";
import { fieldClassName, labelClassName } from "@/components/shared/form-styles";
import { textOn } from "@/lib/programs";
import { formatStudentName, formatYear, getStudentInitials, getStudentStatus } from "@/lib/students";
import { formatStamp, formatStampLong } from "@/lib/voters";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/services/api/error-message";
import { fetchEnrollmentModifiedAt, fetchStudentElections, type StudentElection } from "@/services/students/student-detail.service";
import type { EnrollmentStatus, Student, StudentStatus } from "@/types/student.types";

import { useStudentCatalog } from "./student-catalog";

interface StudentDrawerProps {
  /** The student shown, or `null` when the drawer is closed. */
  student: Student | null;
  onClose: () => void;
  /** Saves a name change; rejects with the reason. */
  onRename: (student: Student, name: { firstName: string; lastName: string; middleName?: string }) => Promise<void>;
  /** Moves the enrollment to the current term as active; rejects with the reason. */
  onEnrollCurrent: (student: Student) => Promise<void>;
  /** Sets or lifts LOA on the enrollment; rejects with the reason. */
  onSetLoa: (student: Student, loa: boolean) => Promise<void>;
  /** Archives the student; rejects with the reason. */
  onRemove: (student: Student) => Promise<void>;
}

/** Side sheet with one student's record: edit the name, see enrollment and elections, set LOA or remove. */
export function StudentDrawer({ student, onClose, ...actions }: StudentDrawerProps) {
  // Keep the last student while the sheet slides out.
  const [shown, setShown] = useState<Student | null>(student);
  if (student && student !== shown) setShown(student);
  const s = student ?? shown;

  return (
    <Dialog.Root open={student !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop
          data-themed
          className="fixed inset-0 z-50 bg-brand-background/40 backdrop-blur-[1.5px] transition-opacity duration-300 data-ending-style:opacity-0 data-starting-style:opacity-0"
        />
        <Dialog.Popup
          data-themed
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-[min(35rem,100vw)] flex-col bg-popover text-popover-foreground shadow-[-8px_0_32px_0_rgb(15_23_41/0.18)] outline-none",
            "transition-[translate,opacity] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] data-ending-style:translate-x-full data-starting-style:translate-x-full data-ending-style:duration-250",
            "motion-reduce:transition-opacity motion-reduce:data-ending-style:translate-x-0 motion-reduce:data-starting-style:translate-x-0 motion-reduce:data-ending-style:opacity-0 motion-reduce:data-starting-style:opacity-0",
          )}
        >
          {/* Keyed by student number (not object) so a save that replaces the row keeps the form mounted. */}
          {s ? <DrawerContent key={s.studentNo} student={s} onClose={onClose} {...actions} /> : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Pieces                                   */
/* -------------------------------------------------------------------------- */

type TagTone = "green" | "gray" | "red" | "slate" | "dark";

const TAG_TONE: Record<TagTone, string> = {
  green: "bg-[#16a34a] text-white",
  gray: "bg-[#f1f4f7] text-[#63738c] dark:bg-white/8 dark:text-muted-foreground",
  red: "bg-[#f25f5c] text-white dark:bg-[#d9524f]",
  slate: "bg-[#4b5563] text-white dark:bg-[#3f4652]",
  dark: "bg-[#0f1729] text-white dark:bg-white dark:text-[#0f1729]",
};

function Tag({ tone, children }: { tone: TagTone; children: ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.75 text-[0.6875rem] leading-none whitespace-nowrap", TAG_TONE[tone])}>{children}</span>;
}

const STUDENT_TAG: Record<StudentStatus, { label: string; tone: TagTone }> = {
  enrolled: { label: "ENROLLED", tone: "green" },
  "not-updated": { label: "NOT UPDATED", tone: "gray" },
  loa: { label: "LOA", tone: "red" },
  inactive: { label: "INACTIVE", tone: "slate" },
};

const ENROLLMENT_TAG: Record<EnrollmentStatus, { label: string; tone: TagTone }> = {
  Active: { label: "ENROLLED", tone: "green" },
  Loa: { label: "LOA", tone: "red" },
  Inactive: { label: "INACTIVE", tone: "slate" },
  Graduated: { label: "GRADUATED", tone: "dark" },
};

function CareerPill({ code, color }: { code: string; color: string | undefined }) {
  return (
    <span
      className="inline-flex items-center rounded-md bg-brand-gold px-2 py-0.75 text-[0.65625rem] leading-none whitespace-nowrap text-[#0f172a]"
      style={color ? { backgroundColor: color, color: textOn(color) } : undefined}
    >
      {code}
    </span>
  );
}

function Card({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="w-full shrink-0 overflow-hidden rounded-[0.625rem] border border-border bg-popover">
      <header className="flex min-h-11.75 items-center gap-2 border-b border-border px-5 py-2.5">
        <h3 className="text-[0.71875rem] font-medium tracking-[0.08em] text-foreground uppercase">{title}</h3>
        <span className="flex-1" />
        {aside}
      </header>
      {children}
    </section>
  );
}

/** A small table: header row, then rows with a top rule. `cols` are the fixed column widths (the last one fills). */
function MiniTable({ cols, head, children }: { cols: string[]; head: string[]; children: ReactNode }) {
  return (
    <div className="px-5 py-1">
      <div className="flex items-center gap-3.5 py-2.25 text-[0.6875rem] text-muted-foreground uppercase">
        {head.map((label, i) => (
          <span key={label} className={cn("shrink-0", i === head.length - 1 ? "min-w-0 flex-1" : cols[i])}>
            {label}
          </span>
        ))}
      </div>
      {children}
    </div>
  );
}

const outlineSmClassName = cn(dialogSecondaryClassName, "inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold");

/** "Do X" button that asks once before it acts, in place. */
function ConfirmAction({
  label,
  confirmLabel,
  danger,
  disabled,
  onConfirm,
}: {
  label: string;
  confirmLabel: string;
  danger?: boolean;
  disabled?: boolean;
  onConfirm: () => Promise<void>;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      setAsking(false);
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  const dangerClassName = "border-foreground text-destructive hover:border-destructive/60 hover:bg-destructive/6";

  return (
    <div className="space-y-1.5">
      {asking ? (
        <div className="flex flex-wrap items-center gap-2 animate-in fade-in duration-200 motion-reduce:animate-none">
          <button type="button" disabled={busy} onClick={() => void run()} className={cn(outlineSmClassName, danger ? dangerClassName : "border-foreground/70")}>
            {busy ? <LoaderCircle aria-hidden className="size-3.5 animate-spin" /> : null}
            {confirmLabel}
          </button>
          <button type="button" disabled={busy} onClick={() => setAsking(false)} className={cn(outlineSmClassName, "font-medium")}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" disabled={disabled} onClick={() => setAsking(true)} className={cn(outlineSmClassName, danger && dangerClassName)}>
          {label}
        </button>
      )}
      {error ? (
        <p role="alert" className="text-[0.75rem] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Content                                  */
/* -------------------------------------------------------------------------- */

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const ELECTION_STATE: Record<StudentElection["status"], string> = {
  Draft: "Draft",
  Upcoming: "Upcoming",
  Ongoing: "Live",
  Completed: "Ended",
  Cancelled: "Cancelled",
};

function VotedCell({ election }: { election: StudentElection }) {
  const { voter, status } = election;
  if (!voter) return <span className="text-[0.6875rem] text-muted-foreground">Not a voter</span>;
  if (voter.voted) {
    return (
      <>
        <Tag tone="green">VOTED</Tag>
        <span className="text-[0.6875rem] text-muted-foreground">{formatStamp(voter.votedAt)}</span>
      </>
    );
  }
  if (status === "Completed") {
    return (
      <>
        <Tag tone="gray">DIDN&apos;T VOTE</Tag>
        <span className="text-[0.6875rem] text-muted-foreground">Closed {shortDate(election.endsAt)}</span>
      </>
    );
  }
  if (status === "Cancelled") return <span className="text-[0.6875rem] text-muted-foreground">—</span>;
  return (
    <>
      <Tag tone="gray">NOT YET</Tag>
      <span className="text-[0.6875rem] text-muted-foreground">
        {!voter.active ? "Turned off" : status === "Ongoing" ? `Closes ${shortDate(election.endsAt)}` : `Opens ${shortDate(election.startsAt)}`}
      </span>
    </>
  );
}

function DrawerContent({ student, onClose, onRename, onEnrollCurrent, onSetLoa, onRemove }: Omit<StudentDrawerProps, "student"> & { student: Student }) {
  const { careers, currentTerm } = useStudentCatalog();
  const currentTermId = currentTerm?.id ?? null;
  const career = careers.find((c) => c.code === student.careerCode);

  const [name, setName] = useState({ lastName: student.lastName, firstName: student.firstName, middleName: student.middleName ?? "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [elections, setElections] = useState<StudentElection[] | null>(null);
  const [electionsError, setElectionsError] = useState<string | null>(null);
  const [modifiedAt, setModifiedAt] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    fetchStudentElections(student.studentNo, { signal })
      .then((list) => !signal.aborted && setElections(list))
      .catch((error: unknown) => {
        if (signal.aborted) return;
        setElections([]);
        setElectionsError(getApiErrorMessage(error));
      });
    fetchEnrollmentModifiedAt(student.studentNo, { signal }).then((at) => !signal.aborted && setModifiedAt(at));
    return () => controller.abort();
  }, [student.studentNo, student.term, student.enrollmentStatus]);

  const dirty =
    name.lastName.trim() !== student.lastName ||
    name.firstName.trim() !== student.firstName ||
    name.middleName.trim() !== (student.middleName ?? "");
  const missing = { lastName: !name.lastName.trim(), firstName: !name.firstName.trim() };

  async function save() {
    setSubmitted(true);
    if (missing.lastName || missing.firstName || !dirty) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onRename(student, { lastName: name.lastName.trim(), firstName: name.firstName.trim(), middleName: name.middleName.trim() || undefined });
      setSubmitted(false);
    } catch (error) {
      setSaveError(getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function enroll() {
    setEnrolling(true);
    setEnrollError(null);
    try {
      await onEnrollCurrent(student);
    } catch (error) {
      setEnrollError(getApiErrorMessage(error));
    } finally {
      setEnrolling(false);
    }
  }

  const status = getStudentStatus(student, currentTermId);
  const hasEnrollment = student.careerCode !== null && student.year !== null && student.term !== null;
  const onLoa = student.enrollmentStatus === "Loa";
  const inCurrentTerm = hasEnrollment && student.term === currentTermId && student.enrollmentStatus === "Active";
  const placement = [student.program, student.year !== null ? `${formatYear(student.year)}${student.year <= 4 ? " yr" : ""}` : null].filter(Boolean).join(" · ");
  const hasHistory = elections !== null && elections.some((e) => e.voter?.voted || e.candidacy !== null);
  const fullName = [formatStudentName(student), student.middleName].filter(Boolean).join(" ");

  const enrollBlocked = !currentTermId ? "Add a term first." : !hasEnrollment ? "This student has no enrollment to move." : null;

  return (
    <>
      {/* Header */}
      <header className="flex flex-col gap-3 border-b border-border px-6 py-5">
        <div className="flex items-center gap-2">
          <p className="flex-1 text-[0.75rem] font-medium text-[#63738c] dark:text-muted-foreground">Student details</p>
          <Dialog.Close
            aria-label="Close"
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border text-[#334054] outline-none transition-[background-color,rotate] duration-200 hover:rotate-90 hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand-blue/30 motion-reduce:hover:rotate-0 dark:text-foreground"
          >
            <X aria-hidden className="size-4.5" strokeWidth={1.75} />
          </Dialog.Close>
        </div>
        <div className="flex items-center gap-4">
          <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-full bg-brand-background text-[0.875rem] font-semibold text-white dark:bg-white/10">
            {getStudentInitials(student)}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Dialog.Title className="truncate text-[1.25rem] font-semibold text-foreground">{fullName}</Dialog.Title>
            <Dialog.Description className="truncate text-[0.6875rem] text-muted-foreground">
              {student.email} · {student.studentNo}
            </Dialog.Description>
            <div className="flex flex-wrap gap-1.5">
              <Tag tone={STUDENT_TAG[status].tone}>{STUDENT_TAG[status].label}</Tag>
              {student.careerCode ? <CareerPill code={student.careerCode} color={career?.color} /> : null}
              {placement ? (
                <span className="inline-flex items-center rounded-full bg-border px-2 py-0.75 text-[0.6875rem] leading-none whitespace-nowrap text-foreground">{placement}</span>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto bg-[#f8fafc] px-6 py-5 [scrollbar-width:thin] dark:bg-background">
        <Card title="Details" aside={<span className="text-[0.6875rem] text-muted-foreground">studentID {student.studentNo}</span>}>
          <form
            className="flex flex-col gap-3.5 px-5 py-4.5"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <NameField label="Last name" value={name.lastName} invalid={submitted && missing.lastName} onChange={(lastName) => setName((n) => ({ ...n, lastName }))} />
              <NameField label="First name" value={name.firstName} invalid={submitted && missing.firstName} onChange={(firstName) => setName((n) => ({ ...n, firstName }))} />
              <NameField label="Middle name" value={name.middleName} onChange={(middleName) => setName((n) => ({ ...n, middleName }))} />
              <div className="min-w-0">
                <label htmlFor="student-email" className={labelClassName}>
                  Email
                </label>
                <input id="student-email" value={student.email} readOnly disabled title="The email follows the student number and can't be changed." className={fieldClassName} />
              </div>
            </div>
            {/* Lets Enter save from any name field. */}
            <button type="submit" hidden aria-hidden tabIndex={-1} />
            <div className="grid grid-cols-2 gap-3.5 border-t border-[#e2e8f0] pt-3.5 text-[0.6875rem] dark:border-border">
              <div className="flex min-w-0 flex-col gap-0.75">
                <span className="text-muted-foreground">CREATED</span>
                <span className="text-foreground">{student.createdAt ? formatStampLong(student.createdAt) : "—"}</span>
              </div>
              <div className="flex min-w-0 flex-col gap-0.75">
                <span className="text-muted-foreground">ENROLLMENT UPDATED</span>
                <span className="text-foreground">{modifiedAt ? formatStampLong(modifiedAt) : "—"}</span>
              </div>
            </div>
          </form>
        </Card>

        <Card
          title="Enrollment history"
          aside={
            <button
              type="button"
              disabled={enrolling || inCurrentTerm || !!enrollBlocked}
              title={inCurrentTerm ? `Already enrolled in ${currentTermId}.` : (enrollBlocked ?? `Enroll as active in ${currentTermId}`)}
              onClick={() => void enroll()}
              className={outlineSmClassName}
            >
              {enrolling ? <LoaderCircle aria-hidden className="size-3.5 animate-spin" /> : null}+ Enroll in term
            </button>
          }
        >
          <MiniTable cols={["w-32.5", "w-27.5", "w-22.5"]} head={["Term", "Program", "Year", "Status"]}>
            {hasEnrollment ? (
              <div className="flex items-center gap-3.5 border-t border-border py-2.75">
                <span className="w-32.5 shrink-0 text-[0.6875rem] text-foreground">{student.term}</span>
                <span className="flex w-27.5 shrink-0 items-center gap-1.5">
                  <CareerPill code={student.careerCode!} color={career?.color} />
                  {student.program ? <span className="text-[0.8125rem] font-medium text-foreground">{student.program}</span> : null}
                </span>
                <span className="w-22.5 shrink-0 text-[0.8125rem] font-medium text-foreground">{formatYear(student.year)}</span>
                <span className="min-w-0 flex-1">
                  {student.enrollmentStatus ? <Tag tone={ENROLLMENT_TAG[student.enrollmentStatus].tone}>{ENROLLMENT_TAG[student.enrollmentStatus].label}</Tag> : null}
                </span>
              </div>
            ) : (
              <p className="border-t border-border py-3 text-[0.75rem] text-muted-foreground">No enrollment yet.</p>
            )}
          </MiniTable>
          {enrollError ? (
            <p role="alert" className="px-5 pb-3 text-[0.75rem] text-destructive">
              {enrollError}
            </p>
          ) : null}
        </Card>

        <Card title="Voting & candidacy">
          <MiniTable cols={["w-47.5", "w-27.5"]} head={["Election", "Voted", "Candidacy"]}>
            {elections === null ? (
              <p className="flex items-center gap-2 border-t border-border py-3 text-[0.75rem] text-muted-foreground">
                <LoaderCircle aria-hidden className="size-3.5 animate-spin" /> Loading…
              </p>
            ) : electionsError ? (
              <p role="alert" className="border-t border-border py-3 text-[0.75rem] text-destructive">
                Couldn&apos;t load elections. {electionsError}
              </p>
            ) : elections.length === 0 ? (
              <p className="border-t border-border py-3 text-[0.75rem] text-muted-foreground">Not in any election yet.</p>
            ) : (
              elections.map((e, index) => (
                <div
                  key={e.electionId}
                  style={{ animationDelay: `${index * 50}ms` }}
                  className="flex items-start gap-3.5 border-t border-border py-2.75 animate-in fade-in duration-300 fill-mode-both motion-reduce:animate-none"
                >
                  <span className="flex w-47.5 shrink-0 flex-col gap-1 text-[0.6875rem]">
                    <span className="truncate text-foreground">{e.title}</span>
                    <span className="text-muted-foreground">
                      {ELECTION_STATE[e.status]}
                      {e.status === "Upcoming" && e.voter?.active ? " · eligible" : ""}
                    </span>
                  </span>
                  <span className="flex w-27.5 shrink-0 flex-col items-start gap-1">
                    <VotedCell election={e} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col items-start gap-1 text-[0.6875rem]">
                    {e.candidacy ? (
                      <>
                        <Tag tone="dark">CANDIDATE</Tag>
                        <span className="text-foreground">{e.candidacy}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Not a candidate</span>
                    )}
                  </span>
                </div>
              ))
            )}
          </MiniTable>
        </Card>

        <Card title="Actions">
          <div className="flex flex-col gap-3.5 px-5 py-4.5">
            <div className="flex flex-col items-start gap-1.5">
              <p className="text-[0.8125rem] font-medium text-foreground">{onLoa ? "Lift leave of absence" : "Set leave of absence"}</p>
              <p className="text-[0.75rem] text-muted-foreground">
                {!hasEnrollment
                  ? "Enroll the student first."
                  : onLoa
                    ? `Marks the student active again for ${student.term}. They can vote this term.`
                    : `Marks the student LOA for ${student.term}. They can’t vote this term.`}
              </p>
              <ConfirmAction
                label={onLoa ? "Lift LOA" : "Set LOA"}
                confirmLabel={onLoa ? "Yes, lift LOA" : "Yes, set LOA"}
                disabled={!hasEnrollment}
                onConfirm={() => onSetLoa(student, !onLoa)}
              />
            </div>
            <div className="flex flex-col items-start gap-1.5">
              <p className="text-[0.8125rem] font-medium text-foreground">Remove student</p>
              <p className="text-[0.75rem] text-muted-foreground">
                {hasHistory ? "They have votes or a candidacy to keep, so they can’t be removed." : "Archives the student so they leave the roster. Only possible when they have no votes or candidacy to keep."}
              </p>
              <ConfirmAction label="Remove student" confirmLabel="Yes, remove" danger disabled={elections === null || electionsError !== null || hasHistory} onConfirm={() => onRemove(student)} />
            </div>
          </div>
        </Card>
      </div>

      {/* Footer */}
      <footer className="flex items-center gap-2 border-t border-border bg-popover px-6 py-4">
        {saveError ? (
          <p role="alert" className="min-w-0 flex-1 text-[0.75rem] leading-4 text-destructive">
            {saveError}
          </p>
        ) : (
          <span className="flex-1" />
        )}
        <button type="button" disabled={saving} onClick={onClose} className={dialogSecondaryClassName}>
          Discard
        </button>
        <button type="button" disabled={saving || !dirty} onClick={() => void save()} className={cn(dialogPrimaryClassName, "inline-flex items-center gap-2")}>
          {saving ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}
          Save changes
        </button>
      </footer>
    </>
  );
}

function NameField({ label, value, invalid, onChange }: { label: string; value: string; invalid?: boolean; onChange: (value: string) => void }) {
  const id = `student-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      <input id={id} value={value} aria-invalid={invalid || undefined} onChange={(event) => onChange(event.target.value)} className={fieldClassName} />
      {invalid ? <p className="mt-1 text-[0.6875rem] leading-4 text-destructive">Required</p> : null}
    </div>
  );
}
