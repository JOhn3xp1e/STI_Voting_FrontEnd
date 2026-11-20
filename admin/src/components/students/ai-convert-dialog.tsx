"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { ArrowRight, Check, Download, LoaderCircle, Plus, Sparkles, TriangleAlert, Upload, X } from "lucide-react";

import {
  CONVERT_FILE_PATTERN,
  CONVERT_MAX_BYTES,
  applySpec,
  changeExamples,
  convertContext,
  csvBlob,
  givenNamesToSplit,
  outputName,
  profileColumns,
  readSheet,
  sampleRows,
  xlsxBlob,
  type ConvertResult,
  type ConvertedRow,
  type OutputFormat,
  type SheetData,
} from "@/lib/ai-convert";
import { LIMITS, type ConversionSpec, type NameSplit, type TemplateField } from "@/lib/ai-convert-spec";
import { CSV_COLUMNS, careerForProgram } from "@/lib/student-import";
import { EMAIL_DOMAIN } from "@/lib/students";
import { cn } from "@/lib/utils";
import { fetchConvertReady, requestConversionSpec, requestNameSplits } from "@/services/students/convert.service";
import type { Student, StudentCatalog } from "@/types/student.types";

import { AnimatedNumber } from "./animated-number";
import { Stepper, ctaClassName, secondaryButtonClassName, settle } from "./csv-import-dialog";
import { useStudentCatalog } from "./student-catalog";
import { primaryButtonClassName } from "./student-toolbar-styles";

/* -------------------------------------------------------------------------- */
/*                                    Types                                   */
/* -------------------------------------------------------------------------- */

interface AiConvertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: readonly Student[];
  /** Hands the converted file (stiVote template CSV) to the import review. */
  onImport: (file: { name: string; text: string }) => void;
}

type Step =
  | { name: "upload"; error: string | null }
  | { name: "describe"; sheet: SheetData; error: string | null }
  | { name: "review"; sheet: SheetData; spec: ConversionSpec; result: ConvertResult; notice: string | null; error: string | null };

/** 0 reading · 1 asking Groq · 2 splitting names · 3 checking rows. */
interface Progress {
  stage: 0 | 1 | 2 | 3;
  names?: { done: number; total: number };
}

type Tab = "all" | "blank" | "check" | "error";

const STEPS = ["Upload file", "Describe conversion", "Review result"] as const;

const WIDTHS = {
  upload: "w-[min(45rem,calc(100vw-2rem))]",
  describe: "w-[min(45rem,calc(100vw-2rem))]",
  review: "w-[min(65rem,calc(100vw-2rem))]",
} as const;

const TABLE_LIMIT = 100;

const sizeFormat = (bytes: number) => (bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`);
const count = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, one: string, many = `${one}s`) => `${count(n)} ${n === 1 ? one : many}`;
const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/** The turning brand ring, as classes (holds still under reduced motion). */
const turning = "ai-gradient motion-safe:animate-[ai-turn_3s_linear_infinite]";

/* -------------------------------------------------------------------------- */
/*                                   Dialog                                   */
/* -------------------------------------------------------------------------- */

/**
 * Convert with AI: upload a class list in any layout → tell Groq how to map it
 * → review the converted rows → hand them to the import review. Groq only sees
 * the column names, a few sample rows and given names; every row is converted
 * in the browser.
 */
export function AiConvertDialog({ open, onOpenChange, students, onImport }: AiConvertDialogProps) {
  const catalog = useStudentCatalog();
  const [step, setStep] = useState<Step>({ name: "upload", error: null });
  const [direction, setDirection] = useState<1 | -1>(1);
  const [reading, setReading] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [format, setFormat] = useState<OutputFormat>("csv");
  const [adjust, setAdjust] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [downloading, setDownloading] = useState(false);
  /** Bumped per conversion, so the result replays its entrance. */
  const [revision, setRevision] = useState(0);
  const [ready, setReady] = useState<boolean | null>(null);
  const splitsRef = useRef<Record<string, NameSplit>>({});
  const abortRef = useRef<AbortController | null>(null);

  // Is Groq set up? (Asked each time the dialog opens; cheap.)
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void fetchConvertReady(controller.signal).then((value) => {
      if (!controller.signal.aborted) setReady(value);
    });
    return () => controller.abort();
  }, [open]);

  function cancelWork() {
    abortRef.current?.abort();
    abortRef.current = null;
    setProgress(null);
  }

  function reset() {
    cancelWork();
    setDirection(-1);
    setStep({ name: "upload", error: null });
    setAdjust("");
    setTab("all");
    splitsRef.current = {};
  }

  async function load(file: File) {
    if (!CONVERT_FILE_PATTERN.test(file.name)) {
      setStep({ name: "upload", error: `"${file.name}" isn't an .xls, .xlsx or .csv file.` });
      return;
    }
    if (file.size > CONVERT_MAX_BYTES) {
      setStep({ name: "upload", error: `"${file.name}" is larger than 5 MB.` });
      return;
    }
    setReading(true);
    try {
      const sheet = await readSheet(file);
      splitsRef.current = {};
      setDirection(1);
      setStep({ name: "describe", sheet, error: null });
    } catch (error) {
      setStep({ name: "upload", error: errorText(error, "That file couldn't be read. Try saving it again from Excel.") });
    } finally {
      setReading(false);
    }
  }

  /** Asks Groq for the rules (or adjusts them), splits given names, then converts and checks every row. */
  async function convert(sheet: SheetData, rerun?: { spec: ConversionSpec; adjustment: string }) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;
    setProgress({ stage: rerun ? 1 : 0 });

    try {
      if (!rerun) await pause(450, signal); // long enough to read "Reading 451 rows"
      setProgress({ stage: 1 });
      const spec = await requestConversionSpec(
        {
          fileName: sheet.fileName,
          columns: sheet.columns.slice(0, LIMITS.columns),
          profiles: profileColumns(sheet).slice(0, LIMITS.columns),
          sample: sampleRows(sheet),
          instruction: instruction.trim(),
          context: convertContext(catalog),
          previous: rerun?.spec ?? null,
          adjustment: rerun?.adjustment,
        },
        signal,
      );

      let notice: string | null = null;
      const names = givenNamesToSplit(sheet, spec, splitsRef.current);
      if (names.length) {
        setProgress({ stage: 2, names: { done: 0, total: names.length } });
        try {
          const splits = await requestNameSplits(names, (done) => setProgress({ stage: 2, names: { done, total: names.length } }), signal);
          splitsRef.current = { ...splitsRef.current, ...splits };
        } catch (error) {
          if (signal.aborted) throw error;
          notice = `Groq couldn't split middle names (${errorText(error, "no answer")}). Names with two given names are marked to check.`;
        }
      }

      setProgress({ stage: 3 });
      const result = applySpec(sheet, spec, catalog, students, splitsRef.current);
      await pause(350, signal);

      setDirection(1);
      setTab("all");
      setRevision((r) => r + 1);
      setAdjust("");
      setStep({ name: "review", sheet, spec, result, notice, error: null });
    } catch (error) {
      if (signal.aborted) return;
      const message = errorText(error, "Groq couldn't convert the file. Try again.");
      setStep((current) => (rerun && current.name === "review" ? { ...current, error: message } : { name: "describe", sheet, error: message }));
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setProgress(null);
      }
    }
  }

  async function download(sheet: SheetData, result: ConvertResult) {
    setDownloading(true);
    try {
      saveBlob(outputName(sheet.fileName, format), format === "csv" ? csvBlob(result.csv) : await xlsxBlob(result));
    } finally {
      setDownloading(false);
    }
  }

  const stepIndex = step.name === "upload" ? 0 : step.name === "describe" ? 1 : 2;
  const busy = progress !== null;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          cancelWork();
          setTimeout(reset, 250); // after the close animation
        }
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
          <Header step={step} format={format} />
          <Stepper current={stepIndex} steps={STEPS} lastIsDone={false} />

          <div key={step.name} className={cn("flex min-h-0 flex-1 flex-col", settle, direction > 0 ? "slide-in-from-right-3" : "slide-in-from-left-3")}>
            {step.name === "upload" ? (
              <UploadStep error={step.error} reading={reading} ready={ready} onFile={(file) => void load(file)} />
            ) : step.name === "describe" ? (
              <DescribeStep
                sheet={step.sheet}
                error={step.error}
                ready={ready}
                catalog={catalog}
                instruction={instruction}
                onInstruction={setInstruction}
                format={format}
                onFormat={setFormat}
                progress={progress}
                onCancel={() => {
                  if (busy) cancelWork();
                  else {
                    onOpenChange(false);
                    setTimeout(reset, 250);
                  }
                }}
                onConvert={() => void convert(step.sheet)}
              />
            ) : (
              <ReviewStep
                key={revision}
                step={step}
                format={format}
                tab={tab}
                onTab={setTab}
                adjust={adjust}
                onAdjust={setAdjust}
                progress={progress}
                downloading={downloading}
                onRerun={() => void convert(step.sheet, { spec: step.spec, adjustment: adjust.trim() })}
                onCancelRerun={cancelWork}
                onDownload={() => void download(step.sheet, step.result)}
                onBack={() => {
                  cancelWork();
                  setDirection(-1);
                  setStep({ name: "describe", sheet: step.sheet, error: null });
                }}
                onImport={() => {
                  onImport({ name: outputName(step.sheet.fileName, "csv"), text: step.result.csv });
                  setTimeout(reset, 300);
                }}
              />
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Cancelled", "AbortError"));
    });
  });
}

function saveBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* -------------------------------------------------------------------------- */
/*                                   Header                                   */
/* -------------------------------------------------------------------------- */

function GroqBadge() {
  return (
    <span className="inline-flex h-5.5 items-center gap-1 rounded-md border border-border px-1.5 text-[0.6875rem] font-medium text-muted-foreground">
      <Sparkles aria-hidden className="size-3 motion-safe:animate-[ai-twinkle_2.4s_ease-in-out_infinite]" strokeWidth={2} />
      Groq
    </span>
  );
}

function FileChip({ name, detail }: { name: string; detail: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[0.75rem] text-foreground/80">
      <Upload aria-hidden className="size-3.5 shrink-0" strokeWidth={1.75} />
      <span className="truncate">{name}</span>
      <span className="shrink-0 text-muted-foreground">· {detail}</span>
    </span>
  );
}

function Header({ step, format }: { step: Step; format: OutputFormat }) {
  const csvSize = useMemo(() => (step.name === "review" ? csvBlob(step.result.csv).size : 0), [step]);
  return (
    <div className="flex shrink-0 items-start justify-between gap-4 px-6 pt-5.5 pb-4.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Dialog.Title className="text-[1.25rem] leading-7 font-semibold tracking-tight text-foreground">Convert with AI</Dialog.Title>
          <GroqBadge />
        </div>
        <div key={step.name} className={settle}>
          {step.name === "upload" ? (
            <Dialog.Description className="mt-0.5 text-[0.875rem] leading-5 text-muted-foreground">
              Turn a class list in any layout into the stiVote template. Nothing is saved until you import.
            </Dialog.Description>
          ) : (
            <Dialog.Description render={<div />} className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.875rem] text-muted-foreground">
              {step.name === "describe" ? (
                <>
                  <FileChip name={step.sheet.fileName} detail={plural(step.sheet.records.length, "row")} />
                  <span>
                    Converting to <span className="font-semibold text-foreground">stiVote template</span>
                  </span>
                </>
              ) : (
                <>
                  <FileChip name={outputName(step.sheet.fileName, format)} detail={format === "csv" ? sizeFormat(csvSize) : plural(step.result.rows.length, "row")} />
                  <span className="min-w-0 truncate">
                    From <span className="font-semibold text-foreground">{step.sheet.fileName}</span>
                  </span>
                </>
              )}
            </Dialog.Description>
          )}
        </div>
      </div>
      <Dialog.Close
        aria-label="Close"
        className={cn(
          "flex size-9.5 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-background text-foreground outline-none",
          "transition-[background-color,rotate,scale] duration-200 hover:rotate-90 hover:bg-muted active:scale-90 focus-visible:ring-3 focus-visible:ring-brand-blue/25 motion-reduce:hover:rotate-0",
        )}
      >
        <X aria-hidden className="size-4" strokeWidth={2} />
      </Dialog.Close>
    </div>
  );
}

function Alert({ children, tone = "error" }: { children: ReactNode; tone?: "error" | "warning" }) {
  return (
    <p
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-[0.8125rem] leading-5 animate-in fade-in slide-in-from-top-1 duration-300 motion-reduce:animate-none",
        tone === "error" ? "border-destructive/25 bg-destructive/6 text-destructive" : "border-[#fcd34d] bg-[#fffbeb] text-[#92400e] dark:border-brand-gold/30 dark:bg-brand-gold/8 dark:text-brand-gold",
      )}
    >
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

function SetupWarning() {
  return (
    <Alert tone="warning">
      The AI service isn&apos;t set up yet. Deploy the <code className="font-mono text-[0.75rem]">slvp-ai</code> worker and give it and this app the same{" "}
      <code className="font-mono text-[0.75rem]">AI_API_TOKEN</code> (locally: run <code className="font-mono text-[0.75rem]">npm run dev</code> in the ai folder), then reopen this dialog.
    </Alert>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Step 1: upload                              */
/* -------------------------------------------------------------------------- */

function UploadStep({ error, reading, ready, onFile }: { error: string | null; reading: boolean; ready: boolean | null; onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 pt-5 pb-6">
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
          "group/drop relative isolate flex flex-col items-center overflow-hidden rounded-2xl border-[1.5px] border-dashed px-6 pt-9 pb-9 text-center",
          "transition-[border-color,background-color,box-shadow] duration-300 ease-out",
          dragging
            ? "border-brand-blue/70 bg-brand-blue/5 shadow-[inset_0_0_0_4px_color-mix(in_oklab,var(--color-brand-blue)_8%,transparent)]"
            : "border-[#d5dbe3] hover:border-brand-blue/40 hover:bg-[#f8fafc] dark:border-white/15 dark:hover:bg-white/2",
        )}
      >
        {/* Soft aurora behind the icon. */}
        <span aria-hidden className={cn("absolute top-4 left-1/2 -z-10 size-28 -translate-x-1/2 rounded-full opacity-[0.13] blur-2xl transition-opacity duration-500 group-hover/drop:opacity-25", turning)} />
        <span
          className={cn(
            "relative flex size-13 items-center justify-center rounded-xl p-[1.5px] transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
            "group-hover/drop:-translate-y-0.5 motion-reduce:transition-none",
            turning,
            dragging && "-translate-y-1.5 scale-110",
          )}
        >
          <span className="flex size-full items-center justify-center rounded-[calc(0.75rem-1.5px)] bg-[#eef3fa] text-brand-blue dark:bg-[#141c2e] dark:text-[#7aa7e6]">
            {reading ? <LoaderCircle aria-hidden className="size-5.5 animate-spin" strokeWidth={1.75} /> : <Sparkles aria-hidden className="size-5.5 motion-safe:animate-[ai-twinkle_2.4s_ease-in-out_infinite]" strokeWidth={1.75} />}
          </span>
        </span>
        <p className="mt-4.5 text-[1rem] font-semibold text-foreground">{reading ? "Reading your file…" : dragging ? "Drop to upload" : "Drag and drop your class list here"}</p>
        <p className="mt-1 text-[0.875rem] text-muted-foreground">Any layout · .xls, .xlsx or .csv up to 5 MB</p>
        <button type="button" onClick={() => inputRef.current?.click()} disabled={reading} className={cn(primaryButtonClassName, "mt-4.5 h-9 px-4 text-[0.875rem] disabled:opacity-60")}>
          Choose file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".xls,.xlsx,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          tabIndex={-1}
          aria-label="Class list file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onFile(file);
          }}
        />
      </div>

      {error ? <Alert>{error}</Alert> : null}
      {ready === false ? <SetupWarning /> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { n: 1, title: "Groq reads the layout", body: "Only the column names and the first few rows." },
          { n: 2, title: "Rules run on every row", body: "In your browser, so the file stays here." },
          { n: 3, title: "You check, then import", body: "Rows go through the usual import review." },
        ].map((item, index) => (
          <div
            key={item.n}
            style={{ animationDelay: `${120 + index * 70}ms` }}
            className="rounded-xl border border-border px-4 py-3.5 animate-in fade-in slide-in-from-bottom-2 duration-400 fill-mode-both motion-reduce:animate-none"
          >
            <span className="font-mono text-[0.6875rem] text-muted-foreground">0{item.n}</span>
            <p className="mt-1 text-[0.8125rem] font-semibold text-foreground">{item.title}</p>
            <p className="mt-0.5 text-[0.75rem] leading-4.5 text-muted-foreground">{item.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                               Step 2: describe                             */
/* -------------------------------------------------------------------------- */

interface Suggestion {
  label: string;
  text: string;
}

/** Quick instructions that fit this file ("Year from 1Y1 format" only when a column looks like that). */
function suggestionsFor(sheet: SheetData, catalog: StudentCatalog): Suggestion[] {
  const out: Suggestion[] = [];
  const values = (j: number) => sheet.records.map((r) => r.cells[j]).filter(Boolean);
  const nameCol = sheet.columns.findIndex((c) => /name/i.test(c));
  if (nameCol >= 0 && sheet.columns.filter((c) => /name/i.test(c)).length === 1) {
    out.push({ label: "Split full names", text: `Split ${sheet.columns[nameCol]} into last name, first name and middle name.` });
  }
  for (let j = 0; j < sheet.columns.length; j++) {
    const list = values(j);
    const coded = list.filter((v) => /^\d{1,2}\s*[a-z]\s*\d{1,2}$/i.test(v));
    if (list.length && coded.length >= list.length * 0.6) {
      out.push({ label: `Year from ${coded[0]} format`, text: `${sheet.columns[j]} is year + term (e.g. ${coded[0]}), so use only the year.` });
      break;
    }
  }
  const emailCol = sheet.columns.findIndex((c) => /e-?mail/i.test(c));
  const placeholder = emailCol >= 0 ? values(emailCol).find((v) => !v.includes("@")) : undefined;
  out.push({
    label: "Generate school emails",
    text:
      emailCol >= 0
        ? `If ${sheet.columns[emailCol]} is ${placeholder ? placeholder : "blank"}, make lastname.last6digits@${EMAIL_DOMAIN}.`
        : `Make emails lastname.last6digits@${EMAIL_DOMAIN}.`,
  });
  const hasTerm = sheet.columns.some((c) => /term|sem/i.test(c));
  const hasCareer = sheet.columns.some((c) => /career/i.test(c));
  if (!hasTerm && catalog.currentTerm) {
    const programCol = sheet.columns.findIndex((c) => /program|course/i.test(c));
    const program = programCol >= 0 ? values(programCol)[0] : undefined;
    const career = !hasCareer && program ? careerForProgram(program, catalog.careers) : null;
    out.push(
      career
        ? { label: `${career.code} · ${catalog.currentTerm.id}`, text: `Career is ${career.code} and term is ${catalog.currentTerm.id}.` }
        : { label: `Term ${catalog.currentTerm.id}`, text: `Term is ${catalog.currentTerm.id}.` },
    );
  }
  out.push({ label: "Skip blank rows", text: "Skip blank rows." });
  return out;
}

interface DescribeStepProps {
  sheet: SheetData;
  error: string | null;
  ready: boolean | null;
  catalog: StudentCatalog;
  instruction: string;
  onInstruction: (value: string) => void;
  format: OutputFormat;
  onFormat: (format: OutputFormat) => void;
  progress: Progress | null;
  onCancel: () => void;
  onConvert: () => void;
}

function DescribeStep({ sheet, error, ready, catalog, instruction, onInstruction, format, onFormat, progress, onCancel, onConvert }: DescribeStepProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);
  const suggestions = useMemo(() => suggestionsFor(sheet, catalog), [sheet, catalog]);
  const busy = progress !== null;
  const canConvert = !busy && ready !== false;

  function addSuggestion(text: string) {
    const current = instruction.trim();
    onInstruction(current ? `${current}${/[.!?]$/.test(current) ? "" : "."} ${text}` : text);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }

  return (
    <>
      {busy ? (
        <div key="busy" className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto", settle, "zoom-in-[0.98]")}>
          <ConvertingPanel fileName={sheet.fileName} rows={sheet.records.length} progress={progress} />
        </div>
      ) : (
        <div key="form" className={cn("min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pt-5 pb-6 [scrollbar-width:thin]", settle)}>
          {/* Your columns → the template */}
          <div className="grid grid-cols-1 items-center gap-3 rounded-xl border border-border px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-5">
            <div className="min-w-0">
              <p className="text-[0.875rem] font-semibold text-foreground">Columns in your file</p>
              <p className="mt-0.5 text-[0.8125rem] leading-5 break-words text-muted-foreground">{sheet.columns.join(", ")}</p>
            </div>
            <ArrowRight aria-hidden className="hidden size-4 text-muted-foreground motion-safe:animate-[ai-nudge_1.8s_ease-in-out_infinite] sm:block" strokeWidth={1.75} />
            <div className="min-w-0">
              <p className="text-[0.875rem] font-semibold text-foreground">stiVote template · {CSV_COLUMNS.length} columns</p>
              <p className="mt-0.5 text-[0.8125rem] leading-5 text-muted-foreground">{CSV_COLUMNS.join(", ")}</p>
            </div>
          </div>

          {/* Instructions */}
          <section>
            <label htmlFor="ai-instruction" className="text-[0.875rem] font-semibold text-foreground">
              Tell Groq how to convert it
            </label>
            <div
              className={cn(
                "mt-2 rounded-xl p-[1.5px] transition-[background-color,box-shadow] duration-300",
                focused ? cn(turning, "shadow-[0_10px_30px_-18px_var(--color-brand-blue)]") : instruction ? "bg-foreground" : "bg-border",
              )}
            >
              <div className="rounded-[calc(0.75rem-1.5px)] bg-popover px-4 pt-3 pb-3">
                <textarea
                  ref={textareaRef}
                  id="ai-instruction"
                  value={instruction}
                  onChange={(e) => onInstruction(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canConvert) {
                      e.preventDefault();
                      onConvert();
                    }
                  }}
                  maxLength={LIMITS.instructionChars}
                  rows={2}
                  placeholder="e.g. Split NAME into last, first and middle name. LEVEL is year + term (1Y1), so use only the year."
                  className="block max-h-40 min-h-12 w-full resize-none bg-transparent text-[0.9375rem] leading-6 text-foreground outline-none [field-sizing:content] placeholder:text-muted-foreground"
                />
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {suggestions.map((s, index) => {
                    const used = instruction.includes(s.text);
                    return (
                      <button
                        key={s.label}
                        type="button"
                        disabled={used}
                        onClick={() => addSuggestion(s.text)}
                        style={{ animationDelay: `${index * 50}ms` }}
                        className={cn(
                          "inline-flex h-7 cursor-pointer items-center gap-1 rounded-full border px-2.5 text-[0.8125rem] whitespace-nowrap outline-none fill-mode-both",
                          "transition-[background-color,border-color,color,translate] duration-200 animate-in fade-in zoom-in-95 focus-visible:ring-2 focus-visible:ring-brand-blue/30 motion-reduce:animate-none",
                          used
                            ? "cursor-default border-[#22c55e]/40 bg-[#ecfdf3] text-[#16a34a] dark:bg-[#22c55e]/12 dark:text-[#4ade80]"
                            : "border-border text-muted-foreground hover:-translate-y-px hover:border-foreground/25 hover:text-foreground",
                        )}
                      >
                        {used ? <Check aria-hidden className="size-3.5 animate-in zoom-in-50 duration-200" strokeWidth={2.5} /> : <Plus aria-hidden className="size-3.5" strokeWidth={2} />}
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* Output */}
          <section>
            <p id="ai-output-label" className="text-[0.875rem] font-semibold text-foreground">
              Output file
            </p>
            <div role="radiogroup" aria-labelledby="ai-output-label" className="mt-2 grid gap-3 sm:grid-cols-2">
              {(
                [
                  { value: "csv", title: "CSV", body: "Ready to import into stiVote. Smallest file." },
                  { value: "xlsx", title: "Excel (.xlsx)", body: "Keeps Student ID as text. Easier to edit by hand." },
                ] as const
              ).map((option) => {
                const checked = format === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    onClick={() => onFormat(option.value)}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3.5 text-left outline-none",
                      "transition-[border-color,box-shadow,background-color] duration-250 focus-visible:ring-3 focus-visible:ring-brand-blue/25",
                      checked ? "border-foreground shadow-[0_0_0_1px_var(--color-foreground)]" : "border-border hover:bg-muted/40",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-200",
                        checked ? "border-foreground" : "border-muted-foreground/60",
                      )}
                    >
                      <span className={cn("size-2.25 rounded-full bg-foreground transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]", checked ? "scale-100" : "scale-0")} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[0.875rem] font-semibold text-foreground">{option.title}</span>
                      <span className="mt-0.5 block text-[0.8125rem] text-muted-foreground">{option.body}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {error ? <Alert>{error}</Alert> : null}
          {ready === false ? <SetupWarning /> : null}
        </div>
      )}

      <div className="flex shrink-0 items-center justify-end gap-2.5 border-t border-border px-6 py-4">
        <button type="button" onClick={onCancel} className={secondaryButtonClassName}>
          Cancel
        </button>
        <button type="button" onClick={onConvert} disabled={!canConvert} className={cn(ctaClassName, "min-w-24")}>
          {busy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}
          {busy ? "Converting…" : "Convert"}
        </button>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*                               Converting panel                             */
/* -------------------------------------------------------------------------- */

const STAGE_HINTS = [
  "Finding the header row and the data",
  "Groq reads the column names and a few sample rows",
  "Working out which word is the middle name",
  "Running the same checks as Import",
] as const;

/** The turning orb, the stage list and a progress bar with a sheen. */
function ConvertingPanel({ fileName, rows, progress, compact = false }: { fileName: string; rows: number; progress: Progress; compact?: boolean }) {
  const { stage, names } = progress;
  const labels = [
    `Reading ${plural(rows, "row")}`,
    "Asking Groq for the conversion rules",
    names ? `Splitting ${plural(names.total, "given name")}` : "Splitting given names",
    "Checking every row",
  ];
  const fraction = (stage + (stage === 2 && names?.total ? names.done / names.total : 0) + 0.35) / 4;

  return (
    <div aria-live="polite" className={cn("flex flex-1 flex-col items-center justify-center px-6 text-center", compact ? "py-6" : "py-10")}>
      <span className="relative flex size-16 items-center justify-center">
        <span aria-hidden className={cn("absolute -inset-3 rounded-[1.6rem] opacity-40 blur-xl", turning)} />
        <span className={cn("relative flex size-16 rounded-2xl p-[1.5px] animate-in zoom-in-75 duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:animate-none", turning)}>
          <span className="flex size-full items-center justify-center rounded-[calc(1rem-1.5px)] bg-popover">
            <Sparkles aria-hidden className="size-6.5 text-brand-blue motion-safe:animate-[ai-twinkle_1.6s_ease-in-out_infinite] dark:text-[#7aa7e6]" strokeWidth={1.75} />
          </span>
        </span>
      </span>

      <p className="mt-5 max-w-full truncate text-[1rem] font-semibold ai-text-shimmer motion-safe:animate-[ai-sweep_2.4s_linear_infinite] motion-reduce:text-foreground">
        Converting {fileName}
      </p>
      <p key={stage} className="mt-1 text-[0.8125rem] text-muted-foreground animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none">
        {STAGE_HINTS[stage]}
      </p>

      <ol className="mt-6 w-full max-w-sm space-y-2.5 text-left">
        {labels.map((label, index) => {
          const state = index < stage ? "done" : index === stage ? "active" : "todo";
          return (
            <li
              key={index}
              style={{ animationDelay: `${index * 70}ms` }}
              className="flex items-center gap-3 animate-in fade-in slide-in-from-bottom-1 duration-300 fill-mode-both motion-reduce:animate-none"
            >
              <span aria-hidden className="flex size-5 shrink-0 items-center justify-center">
                {state === "done" ? (
                  <span className="flex size-5 items-center justify-center rounded-full bg-[#22c55e] text-white animate-in zoom-in-50 duration-300 motion-reduce:animate-none">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                ) : state === "active" ? (
                  <LoaderCircle className="size-4.5 animate-spin text-brand-blue dark:text-[#7aa7e6]" strokeWidth={2} />
                ) : (
                  <span className="size-2 rounded-full bg-muted-foreground/30" />
                )}
              </span>
              <span className={cn("text-[0.875rem] transition-colors duration-300", state === "todo" ? "text-muted-foreground" : "text-foreground", state === "active" && "font-medium")}>
                {label}
                {state === "active" && index === 2 && names ? (
                  <span className="ml-1.5 font-mono text-[0.75rem] text-muted-foreground tabular-nums">
                    {count(names.done)}/{count(names.total)}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="relative mt-6 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-muted">
        <div className="relative h-full overflow-hidden rounded-full bg-brand-blue transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] dark:bg-[#7aa7e6]" style={{ width: `${Math.min(100, fraction * 100)}%` }}>
          <span aria-hidden className="absolute inset-y-0 left-0 w-1/3 bg-linear-to-r from-transparent via-white/60 to-transparent motion-safe:animate-[ai-sheen_1.3s_ease-in-out_infinite]" />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Step 3: review                              */
/* -------------------------------------------------------------------------- */

const STATUS_BADGE: Record<ConvertedRow["status"], { label: string; className: string }> = {
  ready: { label: "Ready", className: "bg-[#ecfdf3] text-[#16a34a] dark:bg-[#22c55e]/15 dark:text-[#4ade80]" },
  check: { label: "Check", className: "bg-[#fef3c7] text-[#b45309] dark:bg-brand-gold/15 dark:text-brand-gold" },
  error: { label: "Error", className: "bg-[#fef2f2] text-[#dc2626] dark:bg-destructive/15" },
};

const TAB_DOT: Record<Tab, string> = {
  all: "bg-[#22c55e]",
  blank: "bg-[#94a3b8]",
  check: "bg-[#f59e0b]",
  error: "bg-[#ef4444]",
};

const PREVIEW_COLUMNS: { field: TemplateField; label: string; className?: string }[] = [
  { field: "student_no", label: "Student no.", className: "w-32" },
  { field: "last_name", label: "Last name" },
  { field: "first_name", label: "First name" },
  { field: "middle_name", label: "Middle name" },
  { field: "program", label: "Program", className: "w-24" },
  { field: "year", label: "Year", className: "w-14" },
  { field: "email", label: "Email" },
];

interface ReviewStepProps {
  step: Extract<Step, { name: "review" }>;
  format: OutputFormat;
  tab: Tab;
  onTab: (tab: Tab) => void;
  adjust: string;
  onAdjust: (value: string) => void;
  progress: Progress | null;
  downloading: boolean;
  onRerun: () => void;
  onCancelRerun: () => void;
  onDownload: () => void;
  onBack: () => void;
  onImport: () => void;
}

function ReviewStep({ step, format, tab, onTab, adjust, onAdjust, progress, downloading, onRerun, onCancelRerun, onDownload, onBack, onImport }: ReviewStepProps) {
  const { sheet, spec, result } = step;
  const { counts } = result;
  const converted = counts.ready + counts.check;
  const examples = useMemo(() => changeExamples(sheet, spec, result), [sheet, spec, result]);
  const busy = progress !== null;

  const checkReason = useMemo(() => {
    const tally = new Map<string, number>();
    for (const r of result.rows) if (r.status === "check" && r.reason) tally.set(r.reason, (tally.get(r.reason) ?? 0) + 1);
    return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]?.toLowerCase() ?? null;
  }, [result]);

  const cards: { tab: Tab; label: string; value: number; detail: string }[] = [
    { tab: "all", label: "Rows converted", value: converted, detail: "ready to import" },
    { tab: "blank", label: "Blank rows", value: result.blankLines.length, detail: "removed" },
    { tab: "check", label: "Need a look", value: counts.check, detail: counts.check ? (checkReason ?? "check these") : "none" },
    { tab: "error", label: "Errors", value: counts.error, detail: counts.error ? "fix or skip on import" : "none" },
  ];

  const shown = tab === "all" ? result.rows : tab === "blank" ? [] : result.rows.filter((r) => r.status === tab);

  return (
    <>
      <div className="relative min-h-0 flex-1">
        <div className={cn("h-full space-y-4 overflow-y-auto px-6 pt-5 pb-6 [scrollbar-width:thin]", busy && "pointer-events-none select-none")} aria-hidden={busy || undefined}>
          {/* Counts, which double as tabs for the preview. */}
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
                  style={{ animationDelay: `${index * 60}ms` }}
                  className={cn(
                    "group/card cursor-pointer rounded-xl border bg-card px-4 pt-3 pb-3 text-left outline-none fill-mode-both",
                    "transition-[border-color,box-shadow,translate] duration-250 ease-out hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-brand-blue/25 motion-reduce:hover:translate-y-0",
                    "animate-in fade-in slide-in-from-bottom-2 duration-400 motion-reduce:animate-none",
                    active ? "border-foreground shadow-[0_0_0_1px_var(--color-foreground),0_12px_24px_-18px_rgb(15_23_42/0.5)]" : "border-border hover:border-[color-mix(in_oklab,var(--color-brand-muted)_45%,transparent)]",
                  )}
                >
                  <span className="flex items-center gap-2 text-[0.8125rem] text-muted-foreground">
                    <span aria-hidden className={cn("size-2 rounded-full", TAB_DOT[card.tab], card.tab === "all" && "motion-safe:animate-pulse")} />
                    {card.label}
                  </span>
                  <AnimatedNumber value={card.value} from={0} duration={900} delay={index * 60} className="mt-0.5 block text-[1.625rem] leading-8 font-medium tracking-tight text-foreground tabular-nums" />
                  <span className="block truncate text-[0.75rem] text-muted-foreground">{card.detail}</span>
                </button>
              );
            })}
          </div>

          {step.error ? <Alert>{step.error}</Alert> : null}
          {step.notice ? <Alert tone="warning">{step.notice}</Alert> : null}

          {/* What Groq changed */}
          <section className="overflow-hidden rounded-xl border border-border animate-in fade-in slide-in-from-bottom-2 duration-500 delay-150 fill-mode-both motion-reduce:animate-none">
            <div className="flex items-start gap-3 border-b border-border bg-[#fffbeb] px-4 py-3 dark:bg-brand-gold/8">
              <Sparkles aria-hidden className="mt-0.5 size-4.5 shrink-0 text-foreground/80 motion-safe:animate-[ai-twinkle_2.4s_ease-in-out_infinite]" strokeWidth={1.75} />
              <div className="min-w-0">
                <p className="text-[0.875rem] font-semibold text-foreground">What Groq changed</p>
                <p className="text-[0.8125rem] text-muted-foreground">{spec.summary || "Check these before importing."} You can ask Groq to adjust anything below.</p>
              </div>
            </div>
            {examples.length ? (
              <ul className="divide-y divide-border">
                {examples.map((example, index) => (
                  <li key={example.column} className="grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)] items-center gap-x-4 px-4 py-2.5 sm:grid-cols-[8rem_minmax(0,1fr)]">
                    <span className="truncate text-[0.8125rem] text-muted-foreground uppercase" title={example.column}>
                      {example.column}
                    </span>
                    <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                      <span
                        style={{ animationDelay: `${250 + index * 110}ms` }}
                        className="max-w-full truncate rounded px-1.5 py-0.5 text-[0.8125rem] bg-[#fef2f2] text-[#dc2626] animate-in fade-in duration-300 fill-mode-both dark:bg-destructive/15 motion-reduce:animate-none"
                      >
                        {example.before}
                      </span>
                      <ArrowRight aria-hidden style={{ animationDelay: `${330 + index * 110}ms` }} className="size-3.5 shrink-0 text-muted-foreground animate-in fade-in slide-in-from-left-1 duration-300 fill-mode-both motion-reduce:animate-none" />
                      <span
                        style={{ animationDelay: `${420 + index * 110}ms` }}
                        className="max-w-full truncate rounded px-1.5 py-0.5 text-[0.8125rem] bg-[#ecfdf3] text-[#16a34a] motion-safe:animate-[ai-blur-in_600ms_cubic-bezier(0.22,1,0.36,1)_both] dark:bg-[#22c55e]/15 dark:text-[#4ade80]"
                      >
                        {example.after}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-3 text-[0.8125rem] text-muted-foreground">Every column was copied as it is.</p>
            )}
          </section>

          {/* Preview */}
          <section className="animate-in fade-in duration-500 delay-200 fill-mode-both motion-reduce:animate-none">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h3 className="text-[0.875rem] font-semibold text-foreground">Preview</h3>
              {tab !== "blank" ? (
                <span className="text-[0.75rem] text-muted-foreground">
                  Showing {count(Math.min(shown.length, TABLE_LIMIT))} of {count(shown.length)}
                </span>
              ) : null}
            </div>
            {tab === "blank" ? (
              <p key="blank" className={cn("rounded-xl border border-border px-4 py-6 text-center text-[0.875rem] text-muted-foreground", settle)}>
                {result.blankLines.length
                  ? `${result.blankLines.length === 1 ? "Row" : "Rows"} ${result.blankLines.slice(0, 40).join(", ")}${result.blankLines.length > 40 ? "…" : ""} had no student no. or name and ${result.blankLines.length === 1 ? "was" : "were"} removed.`
                  : "No blank rows."}
              </p>
            ) : (
              <PreviewTable key={tab} rows={shown.slice(0, TABLE_LIMIT)} withNote={tab === "check" || tab === "error"} />
            )}
          </section>

          {/* Ask Groq to adjust */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (adjust.trim() && !busy) onRerun();
            }}
            className={cn("flex items-center gap-3 rounded-xl p-[1.5px] transition-colors duration-300", adjust.trim() ? turning : "bg-border")}
          >
            <div className="flex min-w-0 flex-1 items-center gap-3 rounded-[calc(0.75rem-1.5px)] bg-popover py-1.5 pr-1.5 pl-3.5">
              <Sparkles aria-hidden className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
              <input
                value={adjust}
                onChange={(e) => onAdjust(e.target.value)}
                maxLength={LIMITS.instructionChars}
                aria-label="Ask Groq to adjust the conversion"
                placeholder='Ask Groq to adjust… e.g. "Put suffixes like Jr. in the first name"'
                className="h-9 min-w-0 flex-1 bg-transparent text-[0.875rem] text-foreground outline-none placeholder:text-muted-foreground"
              />
              <button type="submit" disabled={!adjust.trim() || busy} className={cn(secondaryButtonClassName, "h-9")}>
                Re-run
              </button>
            </div>
          </form>
        </div>

        {busy ? (
          <div className="absolute inset-0 z-10 flex flex-col overflow-y-auto bg-popover/80 backdrop-blur-[3px] animate-in fade-in duration-300 motion-reduce:animate-none">
            <ConvertingPanel fileName={sheet.fileName} rows={sheet.records.length} progress={progress} compact />
            <div className="flex justify-center pb-6">
              <button type="button" onClick={onCancelRerun} className={secondaryButtonClassName}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4">
        <p className="min-w-0 flex-1 text-[0.875rem] text-muted-foreground">
          {plural(converted, "row")} · {CSV_COLUMNS.length} columns · {count(counts.check)} to check
          {counts.error ? ` · ${plural(counts.error, "error")}` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2.5">
          <button type="button" onClick={onDownload} disabled={busy || downloading} className={cn(secondaryButtonClassName, "gap-2")}>
            {downloading ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Download aria-hidden className="size-4" strokeWidth={2} />}
            Download {format === "csv" ? "CSV" : "Excel"}
          </button>
          <button type="button" onClick={onBack} disabled={busy} className={secondaryButtonClassName}>
            Back
          </button>
          <button type="button" onClick={onImport} disabled={busy || converted === 0} className={ctaClassName}>
            Import {plural(converted, "student")}
          </button>
        </div>
      </div>
    </>
  );
}

function PreviewTable({ rows, withNote }: { rows: readonly ConvertedRow[]; withNote: boolean }) {
  const cellClassName = "border-b border-border px-3.5 py-3 group-last/row:border-b-0";
  if (rows.length === 0) {
    return <p className={cn("rounded-xl border border-border px-4 py-8 text-center text-[0.875rem] text-muted-foreground", settle)}>No rows here.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border [scrollbar-width:thin]">
      <table className="w-full min-w-200 border-separate border-spacing-0 text-left text-[0.875rem]">
        <thead className="text-[0.75rem] tracking-[0.04em] text-muted-foreground uppercase">
          <tr>
            <th scope="col" className="w-28 border-b border-border px-3.5 py-2.5 font-normal">
              Status
            </th>
            {PREVIEW_COLUMNS.map((c) => (
              <th key={c.field} scope="col" className={cn("border-b border-border px-3.5 py-2.5 font-normal whitespace-nowrap", c.className)}>
                {c.label}
              </th>
            ))}
            {withNote ? (
              <th scope="col" className="border-b border-border px-3.5 py-2.5 font-normal">
                Note
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const badge = STATUS_BADGE[row.status];
            return (
              <tr
                key={row.line}
                style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
                title={row.reason ? `Row ${row.line}: ${row.reason}` : `Row ${row.line}`}
                className={cn(
                  "group/row transition-colors duration-300 animate-in fade-in slide-in-from-bottom-1 fill-mode-both motion-reduce:animate-none",
                  row.status === "check" && "bg-[#fffbeb] dark:bg-brand-gold/6",
                  row.status === "error" && "bg-[#fef2f2]/70 dark:bg-destructive/8",
                )}
              >
                <td className={cellClassName}>
                  <span className={cn("inline-flex h-5.5 min-w-21 items-center justify-center gap-1.5 rounded-full px-2.5 font-mono text-[0.625rem] font-medium tracking-[0.06em] uppercase", badge.className)}>
                    <span aria-hidden className="size-1.5 rounded-full bg-current" />
                    {badge.label}
                  </span>
                </td>
                {PREVIEW_COLUMNS.map((c) => {
                  const value = row.values[c.field];
                  const flagged = row.issue.includes(c.field);
                  return (
                    <td
                      key={c.field}
                      className={cn(
                        cellClassName,
                        "whitespace-nowrap",
                        c.field === "student_no" ? "font-mono text-[0.8125rem] text-foreground" : "text-foreground",
                        c.field === "year" && "tabular-nums",
                        !value && "text-muted-foreground",
                        flagged && (row.status === "error" ? "text-[#ef4444]" : "text-[#b45309] dark:text-brand-gold"),
                      )}
                    >
                      {value || "—"}
                    </td>
                  );
                })}
                {withNote ? <td className={cn(cellClassName, "text-[0.8125rem]", row.status === "error" ? "text-[#ef4444]" : "text-[#b45309] dark:text-brand-gold")}>{row.reason}</td> : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
