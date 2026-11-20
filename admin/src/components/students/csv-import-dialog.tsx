"use client";

import { useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { ArrowRight, Check, Link2, LoaderCircle, Paperclip, Sparkles, TriangleAlert, Upload, X } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import {
  CSV_COLUMNS,
  CSV_MAX_BYTES,
  analyzeCsvImport,
  buildCsvTemplate,
  buildSampleCsv,
  planImport,
  type ChangeChoice,
  type ImportAnalysis,
  type ImportField,
  type ImportKind,
  type ImportRow,
} from "@/lib/student-import";
import { cn } from "@/lib/utils";
import type { Student, StudentCatalog } from "@/types/student.types";

import { AnimatedNumber } from "./animated-number";
import { useStudentCatalog } from "./student-catalog";
import { primaryButtonClassName, toolbarButtonClassName } from "./student-toolbar-styles";

/* -------------------------------------------------------------------------- */
/*                                    Types                                   */
/* -------------------------------------------------------------------------- */

/** What the page reports back after saving. */
export interface ImportOutcome {
  added: number;
  updated: number;
  failed: number;
  /** The first failure's message, when any failed. */
  firstError: string | null;
}

interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: readonly Student[];
  /** Saves the plan through the Web API, reporting progress (done / total) as it goes. */
  onApply: (plan: { added: Student[]; updated: Student[] }, onProgress: (done: number, total: number) => void) => Promise<ImportOutcome>;
  /** Opens straight on the review of this file (e.g. one converted with AI). Read on mount, so remount (`key`) to change it. */
  initialFile?: { name: string; text: string } | null;
  /** Shows "Convert it with AI" on the upload step. */
  onConvertWithAi?: () => void;
}

interface LoadedFile {
  name: string;
  size: number;
}

type Step =
  | { name: "upload"; error: string | null }
  | { name: "review"; file: LoadedFile; analysis: ImportAnalysis }
  | { name: "done"; file: LoadedFile; term: string | null; outcome: ImportOutcome; unchanged: number };

type Tab = "all" | ImportKind;

const STEPS = ["Upload file", "Review rows", "Done"] as const;

/** Width per step; the popup eases between them. */
const WIDTHS = {
  upload: "w-[min(45rem,calc(100vw-2rem))]",
  review: "w-[min(65rem,calc(100vw-2rem))]",
  done: "w-[min(40rem,calc(100vw-2rem))]",
} as const;

/** Rows drawn in the review table (the counts above cover the rest). */
const TABLE_LIMIT = 100;

export const settle = "animate-in fade-in duration-300 ease-out motion-reduce:animate-none";
export const secondaryButtonClassName = cn(toolbarButtonClassName, "h-9.5 px-4 text-[0.875rem] font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50");
export const ctaClassName = cn(primaryButtonClassName, "h-9.5 gap-2 px-4.5 text-[0.875rem] disabled:pointer-events-none disabled:opacity-45");

const sizeFormat = (bytes: number) => (bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`);
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/* -------------------------------------------------------------------------- */
/*                                   Dialog                                   */
/* -------------------------------------------------------------------------- */

/**
 * Import students: upload a CSV → review every row (new, already enrolled,
 * changed, errors) → done. Nothing is saved before "Import".
 */
export function CsvImportDialog({ open, onOpenChange, students, onApply, initialFile, onConvertWithAi }: CsvImportDialogProps) {
  const catalog = useStudentCatalog();
  const [initial] = useState(() => (initialFile ? openFile(initialFile, students, catalog) : null));
  const [step, setStep] = useState<Step>(initial?.step ?? { name: "upload", error: null });
  /** +1 moving forward, -1 going back (sets the slide direction). */
  const [direction, setDirection] = useState<1 | -1>(1);
  const [reading, setReading] = useState(false);
  const [choices, setChoices] = useState<Record<number, ChangeChoice>>({});
  const [skipErrors, setSkipErrors] = useState(false);
  const [tab, setTab] = useState<Tab>(initial?.tab ?? "new");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const saving = progress !== null;

  function reset() {
    setDirection(-1);
    setStep({ name: "upload", error: null });
    setChoices({});
    setSkipErrors(false);
    setProgress(null);
  }

  /** Reads and checks a file; on success moves to the review. */
  async function load(file: File | { name: string; text: string }) {
    const isFile = file instanceof File;
    if (isFile && !/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      setStep({ name: "upload", error: `"${file.name}" isn't a .csv file.` });
      return;
    }
    if (isFile && file.size > CSV_MAX_BYTES) {
      setStep({ name: "upload", error: `"${file.name}" is larger than 5 MB.` });
      return;
    }
    setReading(true);
    try {
      const text = isFile ? await file.text() : file.text;
      const next = openFile({ name: file.name, text, size: isFile ? file.size : undefined }, students, catalog);
      if (next.step.name === "upload") {
        setStep(next.step);
        return;
      }
      setChoices({});
      setSkipErrors(false);
      setTab(next.tab);
      setDirection(1);
      setStep(next.step);
    } catch {
      setStep({ name: "upload", error: "That file couldn't be read. Try saving it again as CSV." });
    } finally {
      setReading(false);
    }
  }

  async function runImport(analysis: ImportAnalysis, file: LoadedFile) {
    const plan = planImport(analysis.rows, choices);
    const total = plan.added.length + plan.updated.length;
    setProgress({ done: 0, total });
    try {
      const outcome = await onApply({ added: plan.added, updated: plan.updated }, (done, of) => setProgress({ done, total: of }));
      setDirection(1);
      setStep({ name: "done", file, term: analysis.term, outcome, unchanged: plan.counts.stays });
    } finally {
      setProgress(null);
    }
  }

  const stepIndex = step.name === "upload" ? 0 : step.name === "review" ? 1 : 2;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && saving) return; // keep it open until the import finishes
        onOpenChange(next);
        if (!next) setTimeout(reset, 250); // after the close animation
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
            "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden",
            "rounded-2xl border border-border bg-popover text-popover-foreground shadow-[0_32px_80px_-24px_rgb(11_18_32/0.55)] outline-none",
            "transition-[opacity,scale,translate,width] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)]",
            "data-starting-style:translate-y-[calc(-50%+10px)] data-starting-style:scale-[0.96] data-starting-style:opacity-0",
            "data-ending-style:translate-y-[calc(-50%+4px)] data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-ending-style:duration-200",
            "motion-reduce:transition-opacity",
            WIDTHS[step.name],
          )}
        >
          <Header step={step} closeDisabled={saving} />
          <Stepper current={stepIndex} />

          <div key={step.name} className={cn("flex min-h-0 flex-1 flex-col", settle, direction > 0 ? "slide-in-from-right-3" : "slide-in-from-left-3")}>
            {step.name === "upload" ? (
              <UploadStep
                error={step.error}
                reading={reading}
                onFile={(file) => void load(file)}
                onTemplate={() => download("students-template.csv", buildCsvTemplate(catalog))}
                onSample={(withErrors) =>
                  void load({ name: withErrors ? "students-sample-with-errors.csv" : "students-sample.csv", text: buildSampleCsv(catalog, students, withErrors) })
                }
                onConvertWithAi={onConvertWithAi}
              />
            ) : step.name === "review" ? (
              <ReviewStep
                analysis={step.analysis}
                choices={choices}
                onChoose={(lines, choice) => setChoices((current) => ({ ...current, ...Object.fromEntries(lines.map((l) => [l, choice])) }))}
                skipErrors={skipErrors}
                onSkipErrors={setSkipErrors}
                tab={tab}
                onTab={setTab}
                progress={progress}
                onBack={reset}
                onImport={() => void runImport(step.analysis, step.file)}
              />
            ) : (
              <DoneStep
                term={step.term}
                outcome={step.outcome}
                unchanged={step.unchanged}
                onAnother={reset}
                onClose={() => {
                  onOpenChange(false);
                  setTimeout(reset, 250);
                }}
              />
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Checks CSV text: the review step (and the tab to open on) when it has rows, else the upload step with the problem. */
function openFile(file: { name: string; text: string; size?: number }, students: readonly Student[], catalog: StudentCatalog): { step: Step; tab: Tab } {
  const analysis = analyzeCsvImport(file.text, students, catalog);
  if (analysis.error) return { step: { name: "upload", error: analysis.error }, tab: "new" };
  const counts = countKinds(analysis.rows);
  return {
    step: { name: "review", file: { name: file.name, size: file.size ?? new Blob([file.text]).size }, analysis },
    tab: counts.error ? "error" : counts.new ? "new" : "all",
  };
}

function countKinds(rows: readonly ImportRow[]): Record<ImportKind, number> {
  const counts: Record<ImportKind, number> = { new: 0, enrolled: 0, changed: 0, error: 0 };
  for (const row of rows) counts[row.kind]++;
  return counts;
}

/* -------------------------------------------------------------------------- */
/*                               Header / stepper                             */
/* -------------------------------------------------------------------------- */

function Header({ step, closeDisabled }: { step: Step; closeDisabled: boolean }) {
  return (
    <div className="flex shrink-0 items-start justify-between gap-4 px-6 pt-5.5 pb-4.5">
      <div key={step.name} className={cn("min-w-0", settle)}>
        <Dialog.Title className="text-[1.25rem] leading-7 font-semibold tracking-tight text-foreground">
          {step.name === "review" ? "Review import" : "Import students"}
        </Dialog.Title>
        {step.name === "upload" ? (
          <Dialog.Description className="mt-0.5 text-[0.875rem] leading-5 text-muted-foreground">
            Add or update students from a CSV file. Nothing is saved until you confirm.
          </Dialog.Description>
        ) : step.name === "review" ? (
          <Dialog.Description render={<div />} className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.8125rem] text-muted-foreground">
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[0.75rem] text-foreground/80">
              <Paperclip aria-hidden className="size-3.5 shrink-0" strokeWidth={1.75} />
              <span className="truncate">{step.file.name}</span>
              <span className="shrink-0 text-muted-foreground">· {sizeFormat(step.file.size)}</span>
            </span>
            {step.analysis.term ? (
              <span>
                Enrolling into <span className="font-medium text-foreground">{step.analysis.term}</span>
              </span>
            ) : null}
          </Dialog.Description>
        ) : (
          <Dialog.Description className="mt-0.5 truncate text-[0.875rem] text-muted-foreground">{step.file.name}</Dialog.Description>
        )}
      </div>
      <Dialog.Close
        aria-label="Close"
        disabled={closeDisabled}
        className={cn(
          "flex size-9.5 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-background text-foreground outline-none",
          "transition-[background-color,rotate,scale] duration-200 hover:rotate-90 hover:bg-muted active:scale-90 focus-visible:ring-3 focus-visible:ring-brand-blue/25",
          "disabled:cursor-wait disabled:opacity-50 disabled:hover:rotate-0 motion-reduce:hover:rotate-0",
        )}
      >
        <X aria-hidden className="size-4" strokeWidth={2} />
      </Dialog.Close>
    </div>
  );
}

/**
 * Upload file — Review rows — Done; done steps turn green and the line between fills in.
 * `lastIsDone`: reaching the last step marks every step done (a "Done" step).
 */
export function Stepper({ current, steps = STEPS, lastIsDone = true }: { current: number; steps?: readonly string[]; lastIsDone?: boolean }) {
  const allDone = lastIsDone && current === steps.length - 1;
  return (
    <ol aria-label="Import steps" className="flex shrink-0 items-center gap-3 overflow-x-auto border-y border-border px-6 py-3.5 [scrollbar-width:none]">
      {steps.map((label, index) => {
        const done = index < current || allDone;
        const active = index === current && !allDone;
        return (
          <li key={label} className="flex items-center gap-3" aria-current={active ? "step" : undefined}>
            {index > 0 ? (
              <span aria-hidden className="relative h-px w-8 overflow-hidden bg-border sm:w-11">
                <span
                  className={cn(
                    "absolute inset-0 origin-left bg-[#22c55e] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                    index <= current ? "scale-x-100" : "scale-x-0",
                  )}
                />
              </span>
            ) : null}
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className={cn(
                  "relative flex size-5.5 items-center justify-center rounded-full font-mono text-[0.6875rem] transition-[background-color,border-color,color,box-shadow] duration-300",
                  done
                    ? "bg-[#22c55e] text-white"
                    : active
                      ? "bg-brand-navy text-white shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-brand-navy)_10%,transparent)] dark:bg-white dark:text-brand-navy"
                      : "border border-muted-foreground/50 text-muted-foreground",
                )}
              >
                {done ? <Check key="done" className="size-3.5 animate-in zoom-in-50 duration-300 motion-reduce:animate-none" strokeWidth={3} /> : index + 1}
              </span>
              <span
                className={cn(
                  "text-[0.875rem] whitespace-nowrap transition-colors duration-300",
                  done ? "text-[#16a34a] dark:text-[#4ade80]" : active ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Step 1: upload                              */
/* -------------------------------------------------------------------------- */

interface UploadStepProps {
  error: string | null;
  reading: boolean;
  onFile: (file: File) => void;
  onTemplate: () => void;
  onSample: (withErrors: boolean) => void;
  onConvertWithAi?: () => void;
}

function UploadStep({ error, reading, onFile, onTemplate, onSample, onConvertWithAi }: UploadStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const linkClassName = "cursor-pointer rounded-sm font-medium text-brand-blue outline-none hover:underline hover:underline-offset-2 focus-visible:ring-2 focus-visible:ring-brand-blue/30 disabled:opacity-50 dark:text-[#7aa7e6]";

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-5 pb-6">
      <div
        onDragOver={(e: DragEvent) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e: DragEvent) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) onFile(file);
        }}
        className={cn(
          "group/drop relative flex flex-col items-center rounded-2xl border-[1.5px] border-dashed px-6 pt-9 pb-9 text-center",
          "transition-[border-color,background-color,box-shadow] duration-300 ease-out",
          dragging
            ? "border-brand-blue/70 bg-brand-blue/5 shadow-[inset_0_0_0_4px_color-mix(in_oklab,var(--color-brand-blue)_8%,transparent)]"
            : "border-[#d5dbe3] hover:border-brand-blue/40 hover:bg-[#f8fafc] dark:border-white/15 dark:hover:bg-white/2",
        )}
      >
        <span
          className={cn(
            "flex size-13 items-center justify-center rounded-xl bg-[#e8eef7] text-brand-blue transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] dark:bg-white/8 dark:text-[#7aa7e6]",
            "group-hover/drop:-translate-y-0.5 motion-reduce:transition-none",
            dragging && "-translate-y-1.5 scale-110",
          )}
        >
          {reading ? <LoaderCircle aria-hidden className="size-5.5 animate-spin" strokeWidth={1.75} /> : <Upload aria-hidden className="size-5.5" strokeWidth={1.75} />}
        </span>
        <p className="mt-4.5 text-[1rem] font-semibold text-foreground">{reading ? "Reading your file…" : dragging ? "Drop to upload" : "Drag and drop your CSV here"}</p>
        <p className="mt-1 text-[0.875rem] text-muted-foreground">or choose a file from your computer · .csv up to 5 MB</p>
        <button type="button" onClick={() => inputRef.current?.click()} disabled={reading} className={cn(primaryButtonClassName, "mt-4.5 h-9 px-4 text-[0.875rem] disabled:opacity-60")}>
          Choose file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          tabIndex={-1}
          aria-label="CSV file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onFile(file);
          }}
        />
      </div>

      {error ? (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/6 px-3.5 py-2.5 text-[0.8125rem] leading-5 text-destructive animate-in fade-in slide-in-from-top-1 duration-300 motion-reduce:animate-none">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border px-4.5 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-[0.875rem] font-semibold text-foreground">Required columns, in this order</p>
          <p className="mt-1 text-[0.8125rem] leading-5 text-muted-foreground">{CSV_COLUMNS.join(", ")}</p>
        </div>
        <button type="button" onClick={onTemplate} className={secondaryButtonClassName}>
          Download template
        </button>
      </div>

      <p className="mt-4 text-[0.875rem] text-muted-foreground">
        No file handy? Try the{" "}
        <button type="button" onClick={() => onSample(false)} disabled={reading} className={linkClassName}>
          sample file
        </button>{" "}
        or a{" "}
        <button type="button" onClick={() => onSample(true)} disabled={reading} className={linkClassName}>
          sample with an error
        </button>
        .
      </p>

      {onConvertWithAi ? (
        <p className="mt-2 flex items-center gap-1.5 text-[0.875rem] text-muted-foreground">
          <Sparkles aria-hidden className="size-3.5 text-brand-blue dark:text-[#7aa7e6]" strokeWidth={1.75} />
          Class list in another layout (.xls, .xlsx)?{" "}
          <button type="button" onClick={onConvertWithAi} disabled={reading} className={linkClassName}>
            Convert it with AI
          </button>
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Step 2: review                              */
/* -------------------------------------------------------------------------- */

const KIND_DOT: Record<Tab, string> = {
  all: "bg-foreground",
  new: "bg-[#22c55e]",
  enrolled: "bg-[#94a3b8]",
  changed: "bg-[#f59e0b]",
  error: "bg-[#ef4444]",
};

const TAB_TITLE: Record<Tab, string> = {
  all: "All rows",
  new: "New students",
  enrolled: "Already enrolled",
  changed: "Program or year changed",
  error: "Rows with errors",
};

/** Card labels: the reference uses "New students" next to "Program or year changed", else the short set. */
function cardLabel(tab: Tab, withChanges: boolean): string {
  if (tab === "new") return withChanges ? "New students" : "New";
  if (tab === "error") return "Errors";
  return TAB_TITLE[tab];
}

interface ReviewStepProps {
  analysis: ImportAnalysis;
  choices: Readonly<Record<number, ChangeChoice>>;
  onChoose: (lines: number[], choice: ChangeChoice) => void;
  skipErrors: boolean;
  onSkipErrors: (skip: boolean) => void;
  tab: Tab;
  onTab: (tab: Tab) => void;
  progress: { done: number; total: number } | null;
  onBack: () => void;
  onImport: () => void;
}

function ReviewStep({ analysis, choices, onChoose, skipErrors, onSkipErrors, tab, onTab, progress, onBack, onImport }: ReviewStepProps) {
  const { rows, term } = analysis;
  const counts = useMemo(() => countKinds(rows), [rows]);
  const plan = useMemo(() => planImport(rows, choices), [rows, choices]);
  const changed = useMemo(() => rows.filter((r) => r.kind === "changed"), [rows]);
  const blocked = counts.error > 0 && !skipErrors;
  const saving = progress !== null;
  const usable = rows.length - counts.error;

  const cards: { tab: Tab; count: number; detail: string }[] =
    counts.changed > 0
      ? [
          { tab: "new", count: counts.new, detail: "will be added" },
          { tab: "enrolled", count: counts.enrolled, detail: plan.counts.moved ? `same program & year · ${plan.counts.moved} move term` : "same program & year · skipped" },
          { tab: "changed", count: counts.changed, detail: "need your choice" },
          { tab: "error", count: counts.error, detail: counts.error ? (skipErrors ? "will be skipped" : "need fixing") : "none" },
        ]
      : [
          { tab: "all", count: rows.length, detail: "in the file" },
          { tab: "new", count: counts.new, detail: "will be added" },
          { tab: "enrolled", count: counts.enrolled, detail: plan.counts.moved ? `${plan.counts.moved} move to ${term}` : "same program & year" },
          { tab: "error", count: counts.error, detail: counts.error ? (skipErrors ? "will be skipped" : "need fixing") : "none" },
        ];

  const shown = tab === "all" ? rows : rows.filter((r) => r.kind === tab);

  const summary = blocked
    ? "Fix the errors, or skip those rows to continue."
    : [
        `${plan.counts.added.toLocaleString("en-US")} added`,
        counts.changed ? `${plan.counts.fromFile} updated from file` : null,
        counts.changed ? `${plan.counts.keptCurrent} kept as current` : null,
        plan.counts.moved ? `${plan.counts.moved} moved to ${term}` : null,
        counts.error ? `${plan.counts.skipped} skipped` : null,
        `${plan.counts.unchanged.toLocaleString("en-US")} unchanged`,
      ]
        .filter(Boolean)
        .join(" · ");

  const writes = plan.added.length + plan.updated.length;
  const importLabel = plan.added.length
    ? `Import ${plural(plan.added.length, "student")}`
    : plan.updated.length
      ? `Save ${plural(plan.updated.length, "change")}`
      : "Nothing to import";

  return (
    <>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pt-5 pb-6 [scrollbar-width:thin]">
        {counts.error > 0 ? (
          <>
            <div
              role={skipErrors ? undefined : "alert"}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-4 py-3 text-[0.875rem] transition-[background-color,border-color,color] duration-300",
                skipErrors ? "border-border bg-muted/70 text-foreground/80" : "border-[#fca5a5] bg-[#fef2f2] text-foreground dark:border-destructive/40 dark:bg-destructive/10",
              )}
            >
              <X aria-hidden className={cn("size-4.5 shrink-0 transition-colors duration-300", skipErrors ? "text-muted-foreground" : "text-[#ef4444]")} strokeWidth={2} />
              <p key={String(skipErrors)} className={settle}>
                {skipErrors ? (
                  <>
                    <span className="font-semibold">{plural(counts.error, "row")} will be skipped.</span> The other {usable.toLocaleString("en-US")} rows import normally.
                  </>
                ) : (
                  <>
                    <span className="font-semibold">{plural(counts.error, "row")} need fixing.</span> Fix them in your file and upload again, or skip them below.
                  </>
                )}
              </p>
            </div>

            <label
              className={cn(
                "flex cursor-pointer items-start gap-3.5 rounded-xl border px-4 py-3.5 transition-[border-color,box-shadow,background-color] duration-250",
                skipErrors ? "border-foreground shadow-[0_0_0_1px_var(--color-foreground)]" : "border-border hover:bg-muted/40",
              )}
            >
              <Checkbox checked={skipErrors} onCheckedChange={(checked) => onSkipErrors(checked)} className="mt-0.5 size-4.5 rounded-[5px] data-checked:border-brand-navy data-checked:bg-brand-navy data-checked:text-brand-gold" />
              <span className="min-w-0">
                <span className="block text-[0.875rem] font-semibold text-foreground">Skip the {plural(counts.error, "row")} with errors and import the rest</span>
                <span className="mt-0.5 block text-[0.8125rem] text-muted-foreground">Skipped rows aren&apos;t saved. Fix them in your file and upload just those rows later.</span>
              </span>
            </label>
          </>
        ) : null}

        {/* Counts, which double as tabs for the table below. */}
        <div role="tablist" aria-label="Rows to show" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map((card, index) => {
            const active = tab === card.tab;
            return (
              <button
                key={card.tab}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onTab(card.tab)}
                style={{ animationDelay: `${index * 55}ms` }}
                className={cn(
                  "group/card cursor-pointer rounded-xl border bg-card px-4 pt-3 pb-3 text-left outline-none fill-mode-both",
                  "transition-[border-color,box-shadow,translate] duration-250 ease-out hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-brand-blue/25 motion-reduce:hover:translate-y-0",
                  "animate-in fade-in slide-in-from-bottom-2 motion-reduce:animate-none",
                  active ? "border-foreground shadow-[0_0_0_1px_var(--color-foreground),0_12px_24px_-18px_rgb(15_23_42/0.5)]" : "border-border hover:border-[color-mix(in_oklab,var(--color-brand-muted)_45%,transparent)]",
                )}
              >
                <span className="flex items-center gap-2 text-[0.8125rem] text-muted-foreground">
                  <span aria-hidden className={cn("size-2 rounded-full", KIND_DOT[card.tab])} />
                  {cardLabel(card.tab, counts.changed > 0)}
                </span>
                <AnimatedNumber value={card.count} from={0} duration={800} delay={index * 55} className="mt-0.5 block text-[1.625rem] leading-8 font-medium tracking-tight text-foreground tabular-nums" />
                <span className="block truncate text-[0.75rem] text-muted-foreground">{card.detail}</span>
              </button>
            );
          })}
        </div>

        {changed.length > 0 ? <ChangesPanel rows={changed} choices={choices} onChoose={onChoose} /> : null}

        {tab !== "changed" || changed.length === 0 ? (
          <section key={tab} className={cn(settle, "slide-in-from-bottom-1")}>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h3 className="text-[0.875rem] font-semibold text-foreground">{TAB_TITLE[tab]}</h3>
              <span className="text-[0.75rem] text-muted-foreground">
                Showing {Math.min(shown.length, TABLE_LIMIT).toLocaleString("en-US")} of {shown.length.toLocaleString("en-US")}
              </span>
            </div>
            <RowsTable rows={shown.slice(0, TABLE_LIMIT)} term={term} skipErrors={skipErrors} choices={choices} />
          </section>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4">
        {saving ? (
          <div className="min-w-48 flex-1" aria-live="polite">
            <p className="text-[0.8125rem] text-muted-foreground tabular-nums">
              Saving {progress.done.toLocaleString("en-US")} of {progress.total.toLocaleString("en-US")}…
            </p>
            <div className="mt-1.5 h-1.5 max-w-80 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-brand-blue transition-[width] duration-300 ease-out dark:bg-[#7aa7e6]"
                style={{ width: `${progress.total ? Math.max(4, (progress.done / progress.total) * 100) : 100}%` }}
              />
            </div>
          </div>
        ) : (
          <p key={summary} className={cn("min-w-0 flex-1 text-[0.875rem] text-muted-foreground", settle)}>
            {summary}
          </p>
        )}
        <div className="flex items-center gap-2.5">
          <button type="button" onClick={onBack} disabled={saving} className={secondaryButtonClassName}>
            Upload a different file
          </button>
          <button type="button" onClick={onImport} disabled={blocked || saving || writes === 0} className={ctaClassName}>
            {saving ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}
            {saving ? "Importing…" : importLabel}
          </button>
        </div>
      </div>
    </>
  );
}

/** The yellow "different program or year" panel: one Keep current / Use file choice per student. */
function ChangesPanel({ rows, choices, onChoose }: { rows: readonly ImportRow[]; choices: Readonly<Record<number, ChangeChoice>>; onChoose: (lines: number[], choice: ChangeChoice) => void }) {
  const lines = rows.map((r) => r.line);
  const linkClassName = "cursor-pointer rounded-sm text-[0.8125rem] font-medium whitespace-nowrap text-brand-blue outline-none hover:underline hover:underline-offset-2 focus-visible:ring-2 focus-visible:ring-brand-blue/30 dark:text-[#7aa7e6]";
  return (
    <section className={cn("overflow-hidden rounded-xl border border-border", settle, "slide-in-from-bottom-1")}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-[#fffbeb] px-4 py-3 dark:bg-brand-gold/8">
        <Link2 aria-hidden className="size-4.5 shrink-0 text-foreground/80" strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <p className="text-[0.875rem] font-semibold text-foreground">
            {plural(rows.length, "student has", "students have")} a different program or year
          </p>
          <p className="text-[0.8125rem] text-muted-foreground">Matched by student no. Only program and year can change. Names, student numbers and emails are never overwritten.</p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => onChoose(lines, "current")} className={linkClassName}>
            Keep all current
          </button>
          <button type="button" onClick={() => onChoose(lines, "file")} className={linkClassName}>
            Use file for all
          </button>
        </div>
      </div>
      <ul className="max-h-72 divide-y divide-border overflow-y-auto [scrollbar-width:thin]">
        {rows.map((row, index) => {
          const choice = choices[row.line] ?? "current";
          return (
            <li
              key={row.line}
              style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
              className="grid grid-cols-1 items-center gap-x-6 gap-y-2 px-4 py-3 animate-in fade-in slide-in-from-bottom-1 duration-300 fill-mode-both motion-reduce:animate-none sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_auto]"
            >
              <div className="min-w-0">
                <p className="truncate text-[0.875rem] font-medium text-foreground">
                  {row.current!.lastName}, {row.current!.firstName}
                </p>
                <p className="font-mono text-[0.75rem] text-muted-foreground">{row.current!.studentNo}</p>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.8125rem] text-muted-foreground">
                {row.changes!.map((change) => (
                  <span key={change.field} className="inline-flex items-center gap-2">
                    {change.field === "program" ? "Program" : "Year"}
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 font-mono text-[0.75rem] transition-[opacity,background-color,color] duration-300",
                        "bg-[#fef2f2] text-[#dc2626] dark:bg-destructive/15",
                        choice === "file" && "line-through opacity-60",
                      )}
                    >
                      {change.from}
                    </span>
                    <ArrowRight aria-hidden className="size-3.5" />
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 font-mono text-[0.75rem] transition-[opacity,background-color,color] duration-300",
                        "bg-[#ecfdf3] text-[#16a34a] dark:bg-[#22c55e]/15 dark:text-[#4ade80]",
                        choice === "current" && "opacity-60",
                      )}
                    >
                      {change.to}
                    </span>
                  </span>
                ))}
              </div>
              <Segmented
                label={`Program and year for ${row.current!.lastName}, ${row.current!.firstName}`}
                value={choice}
                onChange={(next) => onChoose([row.line], next)}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Keep current | Use file, with a blue pill that slides to the choice. */
function Segmented({ label, value, onChange }: { label: string; value: ChangeChoice; onChange: (value: ChangeChoice) => void }) {
  const options: { value: ChangeChoice; label: string }[] = [
    { value: "current", label: "Keep current" },
    { value: "file", label: "Use file" },
  ];
  return (
    <div role="radiogroup" aria-label={label} className="relative grid w-max grid-cols-2 rounded-lg border border-border bg-background p-0.5 justify-self-start sm:justify-self-end">
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0.5 left-0.5 w-[calc(50%-0.125rem)] rounded-md bg-brand-blue shadow-[0_6px_14px_-8px_var(--color-brand-blue)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none dark:bg-[#3b6fb8]",
          value === "file" && "translate-x-full",
        )}
      />
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative z-10 h-8 cursor-pointer rounded-md px-3 text-[0.8125rem] font-medium whitespace-nowrap outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-brand-blue/30",
              checked ? "text-white" : "text-foreground hover:text-foreground/70",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

const STATUS_BADGE: Record<ImportKind | "skipped", { label: string; className: string }> = {
  new: { label: "New", className: "bg-[#ecfdf3] text-[#16a34a] dark:bg-[#22c55e]/15 dark:text-[#4ade80]" },
  enrolled: { label: "Enrolled", className: "bg-muted text-muted-foreground" },
  changed: { label: "Changed", className: "bg-[#fffbeb] text-[#b45309] dark:bg-brand-gold/15 dark:text-brand-gold" },
  error: { label: "Error", className: "bg-[#fef2f2] text-[#dc2626] dark:bg-destructive/15" },
  skipped: { label: "Skipped", className: "bg-muted text-muted-foreground" },
};

function RowsTable({ rows, term, skipErrors, choices }: { rows: readonly ImportRow[]; term: string | null; skipErrors: boolean; choices: Readonly<Record<number, ChangeChoice>> }) {
  const showNote = rows.some((r) => r.kind !== "new");
  const cellClassName = "border-b border-border px-3.5 py-3 group-last/row:border-b-0";

  if (rows.length === 0) {
    return <p className="rounded-xl border border-border px-4 py-8 text-center text-[0.875rem] text-muted-foreground">No rows here.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border [scrollbar-width:thin]">
      <table className="w-full min-w-170 border-separate border-spacing-0 text-left text-[0.875rem]">
        <thead className="font-mono text-[0.6875rem] tracking-[0.06em] text-muted-foreground uppercase">
          <tr>
            <th scope="col" className="w-16 border-b border-border px-3.5 py-2.5 font-normal">Line</th>
            <th scope="col" className="w-28 border-b border-border px-3.5 py-2.5 font-normal">Status</th>
            <th scope="col" className="border-b border-border px-3.5 py-2.5 font-normal">Student</th>
            <th scope="col" className="w-36 border-b border-border px-3.5 py-2.5 font-normal">Student no.</th>
            <th scope="col" className="w-24 border-b border-border px-3.5 py-2.5 font-normal">Program</th>
            <th scope="col" className="w-16 border-b border-border px-3.5 py-2.5 font-normal">Year</th>
            {showNote ? <th scope="col" className="border-b border-border px-3.5 py-2.5 font-normal">Note</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const isError = row.kind === "error";
            const skipped = isError && skipErrors;
            const badge = STATUS_BADGE[skipped ? "skipped" : row.kind];
            const bad = (field: ImportField) => isError && row.error!.field === field && "text-[#ef4444]";
            return (
              <tr
                key={row.line}
                style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
                className={cn(
                  "group/row transition-[background-color,opacity] duration-300 animate-in fade-in slide-in-from-bottom-1 fill-mode-both motion-reduce:animate-none",
                  isError && !skipped && "bg-[#fef2f2]/70 dark:bg-destructive/8",
                  skipped && "opacity-60",
                )}
              >
                <td className={cn(cellClassName, "font-mono text-[0.8125rem] text-muted-foreground")}>{row.line}</td>
                <td className={cellClassName}>
                  <span key={badge.label} className={cn("inline-flex h-5.5 min-w-21 items-center justify-center gap-1.5 rounded-full px-2.5 font-mono text-[0.625rem] font-medium tracking-[0.06em] uppercase animate-in zoom-in-90 duration-200 motion-reduce:animate-none", badge.className)}>
                    <span aria-hidden className="size-1.5 rounded-full bg-current" />
                    {badge.label}
                  </span>
                </td>
                <td className={cn(cellClassName, "whitespace-nowrap text-foreground", bad("name"))}>
                  {row.raw.lastName || row.raw.firstName ? `${row.raw.lastName}, ${row.raw.firstName}` : "—"}
                </td>
                <td className={cn(cellClassName, "font-mono text-[0.8125rem] text-foreground", bad("studentNo"))}>{row.raw.studentNo || "—"}</td>
                <td className={cn(cellClassName, "text-foreground", bad("program"), bad("career"))}>{row.raw.program || row.student?.program || "—"}</td>
                <td className={cn(cellClassName, "text-foreground tabular-nums", bad("year"))}>{row.raw.year || (row.student?.year ?? "—")}</td>
                {showNote ? <td className={cn(cellClassName, "text-[0.8125rem]", isError ? "text-[#ef4444]" : "text-muted-foreground")}>{noteFor(row, term, choices)}</td> : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function noteFor(row: ImportRow, term: string | null, choices: Readonly<Record<number, ChangeChoice>>): ReactNode {
  if (row.kind === "error") return row.error!.message;
  if (row.kind === "new") return "";
  if (row.kind === "changed") {
    const text = row.changes!.map((c) => `${c.field === "program" ? "Program" : "Year"} ${c.from} → ${c.to}`).join(" · ");
    return (choices[row.line] ?? "current") === "file" ? `Uses file: ${text}` : `Keeps current (${text})`;
  }
  return row.termMove ? `Moves to ${row.student?.term ?? term}` : "No change";
}

/* -------------------------------------------------------------------------- */
/*                                 Step 3: done                               */
/* -------------------------------------------------------------------------- */

function DoneStep({ term, outcome, unchanged, onAnother, onClose }: { term: string | null; outcome: ImportOutcome; unchanged: number; onAnother: () => void; onClose: () => void }) {
  const enrolled = outcome.added + outcome.updated + unchanged;
  const cards = [
    { label: "Added", value: outcome.added, dot: "bg-brand-blue dark:bg-[#7aa7e6]" },
    { label: "Updated", value: outcome.updated, dot: "bg-[#94a3b8]" },
    { label: "Unchanged", value: unchanged, dot: "bg-[#64748b]" },
    ...(outcome.failed ? [{ label: "Failed", value: outcome.failed, dot: "bg-[#ef4444]" }] : []),
  ];
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 pt-12 pb-9 text-center">
        <SuccessMark failed={outcome.failed > 0} />
        <p className="mt-5 text-[1.125rem] font-semibold text-foreground animate-in fade-in slide-in-from-bottom-1 duration-400 delay-150 fill-mode-both motion-reduce:animate-none">
          {outcome.failed ? "Import finished with problems" : "Import complete"}
        </p>
        <p className="mt-1 text-[0.875rem] text-muted-foreground animate-in fade-in duration-400 delay-200 fill-mode-both motion-reduce:animate-none">
          {plural(enrolled, "student is", "students are")} enrolled{term ? ` in ${term}` : ""}.
          {outcome.failed && outcome.firstError ? <span className="mt-1 block text-destructive">{outcome.firstError}</span> : null}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {cards.map((card, index) => (
            <div
              key={card.label}
              style={{ animationDelay: `${260 + index * 70}ms` }}
              className="w-38 rounded-xl border border-border px-4 pt-3 pb-3.5 text-left animate-in fade-in slide-in-from-bottom-2 duration-400 fill-mode-both motion-reduce:animate-none"
            >
              <span className="flex items-center gap-2 text-[0.8125rem] text-muted-foreground">
                <span aria-hidden className={cn("size-2 rounded-full", card.dot)} />
                {card.label}
              </span>
              <AnimatedNumber value={card.value} from={0} duration={900} delay={300 + index * 70} className="mt-0.5 block text-[1.625rem] leading-8 font-medium tracking-tight text-foreground tabular-nums" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 justify-end gap-2.5 border-t border-border px-6 py-4">
        <button type="button" onClick={onAnother} className={secondaryButtonClassName}>
          Import another file
        </button>
        <button type="button" onClick={onClose} className={ctaClassName}>
          View students
        </button>
      </div>
    </>
  );
}

/** Green disc that pops in, with a tick that draws itself and a soft ring that ripples out. */
function SuccessMark({ failed }: { failed: boolean }) {
  return (
    <span aria-hidden className="relative flex size-11 items-center justify-center">
      <span className={cn("absolute inset-0 rounded-full opacity-0 motion-safe:animate-[ripple_1s_cubic-bezier(0.22,1,0.36,1)_220ms_both]", failed ? "bg-brand-gold/45" : "bg-[#22c55e]/40")} />
      <span
        className={cn(
          "relative flex size-11 items-center justify-center rounded-full text-white shadow-[0_0_0_5px_color-mix(in_oklab,#22c55e_18%,transparent)] animate-in zoom-in-50 duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:animate-none",
          failed ? "bg-brand-gold text-brand-navy shadow-[0_0_0_5px_color-mix(in_oklab,var(--color-brand-gold)_22%,transparent)]" : "bg-[#22c55e]",
        )}
      >
        <svg viewBox="0 0 24 24" className="size-5.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} className="[stroke-dasharray:1] [stroke-dashoffset:1] motion-safe:animate-[draw-tick_420ms_cubic-bezier(0.65,0,0.35,1)_260ms_forwards] motion-reduce:[stroke-dashoffset:0]" />
        </svg>
      </span>
    </span>
  );
}
