"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Download, FileSpreadsheet, LoaderCircle, Upload, X } from "lucide-react";

import { IMPORT_COLUMNS, SAMPLE_IMPORT_CSV, findUnknownPrograms, readStudentImport } from "@/lib/students";
import { cn } from "@/lib/utils";
import {
  getStudentsErrorMessage,
  importStudents,
  previewStudentImport,
  type ExistingStudentsChoice,
  type StudentImportPreview,
  type StudentImportResult,
  type StudentImportRow,
} from "@/services/students/students.service";

import { useStudentCatalog } from "./student-catalog";
import { toolbarButtonClassName } from "./student-toolbar-styles";

const MAX_BYTES = 2 * 1024 * 1024;

type Step =
  | { kind: "idle" }
  | { kind: "checking"; fileName: string }
  | { kind: "invalid"; fileName: string; message: string }
  | {
      kind: "preview";
      fileName: string;
      rows: StudentImportRow[];
      preview: StudentImportPreview;
      unknownPrograms: { code: string; count: number }[];
    };

interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after the backend saved the import (e.g. to reload the roster). */
  onImported: (result: StudentImportResult) => Promise<void> | void;
}

/** UTF-8 first; files saved by Excel as "CSV (Comma delimited)" are Windows-1252 (ñ breaks otherwise). */
async function readText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(buffer) : utf8;
}

const CHOICES: { value: ExistingStudentsChoice; label: string; hint: string }[] = [
  { value: "replace", label: "Update them", hint: "Use the file's program, year and name" },
  { value: "keep", label: "Leave them as they are", hint: "Only add the new students" },
];

/**
 * Imports the school's student list through the Web API:
 * 1. the file is read here and checked by `/students/import/preview` (nothing saved),
 * 2. the admin reviews new / existing / invalid rows,
 * 3. `/students/import` saves everything at once and enrolls it in the current term.
 */
export function CsvImportDialog({ open, onOpenChange, onImported }: CsvImportDialogProps) {
  const { programs } = useStudentCatalog();
  const inputRef = useRef<HTMLInputElement>(null);
  const checkRef = useRef<AbortController | null>(null);

  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const [onExisting, setOnExisting] = useState<ExistingStudentsChoice | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Cancel a running check when the dialog unmounts.
  useEffect(() => () => checkRef.current?.abort(), []);

  function reset() {
    checkRef.current?.abort();
    setStep({ kind: "idle" });
    setDragging(false);
    setOnExisting(null);
    setSaveError(null);
  }

  async function readFile(file: File) {
    checkRef.current?.abort();
    setOnExisting(null);
    setSaveError(null);

    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      setStep({ kind: "invalid", fileName: file.name, message: "Choose a .csv file. In Excel: File → Save As → CSV UTF-8." });
      return;
    }
    if (file.size > MAX_BYTES) {
      setStep({ kind: "invalid", fileName: file.name, message: "This file is larger than 2 MB." });
      return;
    }

    const { rows, error } = readStudentImport(await readText(file));
    if (error) {
      setStep({ kind: "invalid", fileName: file.name, message: error });
      return;
    }

    const controller = new AbortController();
    checkRef.current = controller;
    setStep({ kind: "checking", fileName: file.name });
    try {
      const preview = await previewStudentImport(rows, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setStep({ kind: "preview", fileName: file.name, rows, preview, unknownPrograms: findUnknownPrograms(rows, programs) });
    } catch (cause) {
      if (controller.signal.aborted) return;
      setStep({ kind: "invalid", fileName: file.name, message: getStudentsErrorMessage(cause) });
    }
  }

  function downloadSample() {
    const url = URL.createObjectURL(new Blob([SAMPLE_IMPORT_CSV], { type: "text/csv" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: "students-sample.csv" });
    link.click();
    URL.revokeObjectURL(url);
  }

  const preview = step.kind === "preview" ? step.preview : null;
  const existingCount = preview?.existing.length ?? 0;
  const errorCount = preview?.errors.length ?? 0;
  const willSave = preview ? preview.new + (onExisting === "replace" ? existingCount : 0) : 0;
  const canImport = step.kind === "preview" && errorCount === 0 && (existingCount === 0 || onExisting !== null) && willSave + existingCount > 0;

  async function apply() {
    if (step.kind !== "preview" || !canImport || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await importStudents(step.rows, existingCount > 0 ? onExisting : null);
      await onImported(result);
      onOpenChange(false);
      reset();
    } catch (cause) {
      setSaveError(getStudentsErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  const fileName = step.kind === "idle" ? null : step.fileName;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && saving) return; // keep the dialog open until the import finishes
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop
          data-themed
          className="fixed inset-0 z-50 bg-brand-background/45 backdrop-blur-[1px] transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0"
        />
        <Dialog.Popup
          data-themed
          className={cn(
            "fixed top-1/2 left-1/2 z-50 flex max-h-[min(40rem,calc(100dvh-2rem))] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col",
            "rounded-xl border border-border bg-popover text-popover-foreground shadow-[0_24px_64px_-20px_rgb(11_18_32/0.45)] outline-none",
            "transition-[opacity,scale] duration-200 ease-out data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0",
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <Dialog.Title className="text-[0.9375rem] font-semibold text-foreground">Import CSV (upsert)</Dialog.Title>
              <Dialog.Description className="mt-1 text-[0.8125rem] leading-5 text-muted-foreground">
                Use the school&apos;s student list. Everyone is enrolled in the current term; the career comes from the
                level (1Y1 → 1st year). Nothing is saved until you confirm.
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              disabled={saving}
              className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-wait disabled:opacity-50"
            >
              <X aria-hidden className="size-4" />
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <button
              type="button"
              disabled={saving}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const file = e.dataTransfer.files[0];
                if (file && !saving) void readFile(file);
              }}
              className={cn(
                "flex w-full cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed border-border px-4 py-6 text-center outline-none",
                "transition-[background-color,border-color] duration-200 hover:border-brand-blue/40 hover:bg-brand-blue/3 focus-visible:border-brand-blue/60 focus-visible:ring-3 focus-visible:ring-brand-blue/15",
                "disabled:cursor-wait disabled:opacity-60",
                dragging && "border-brand-blue/60 bg-brand-blue/5",
              )}
            >
              <Upload aria-hidden className="size-5 text-brand-blue dark:text-[#7aa7e6]" strokeWidth={1.75} />
              <span className="text-[0.8125rem] font-medium text-foreground">
                {fileName ? "Choose another file" : "Choose a CSV file"}{" "}
                <span className="font-normal text-muted-foreground">or drop it here</span>
              </span>
              <span className="font-mono text-[0.6875rem] text-muted-foreground">{IMPORT_COLUMNS.join(", ")}</span>
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
                if (file) void readFile(file);
                e.target.value = "";
              }}
            />

            {fileName ? (
              <div className="mt-4" aria-live="polite">
                <p className="flex items-center gap-2 text-[0.8125rem] font-medium text-foreground">
                  <FileSpreadsheet aria-hidden className="size-4 text-muted-foreground" />
                  <span className="truncate">{fileName}</span>
                </p>

                {step.kind === "checking" ? (
                  <p className="mt-2 flex items-center gap-2 text-[0.8125rem] text-muted-foreground" role="status">
                    <LoaderCircle aria-hidden className="size-3.5 animate-spin motion-reduce:animate-none" />
                    Checking the rows…
                  </p>
                ) : null}

                {step.kind === "invalid" ? (
                  <p role="alert" className="mt-2 rounded-md bg-destructive/8 px-3 py-2 text-[0.8125rem] whitespace-pre-line text-destructive">
                    {step.message}
                  </p>
                ) : null}

                {step.kind === "preview" ? (
                  <>
                    <p className="mt-1 font-mono text-[0.6875rem] text-muted-foreground">
                      {step.preview.total} rows · {step.preview.new} new · {existingCount} already on the roster
                      {errorCount ? ` · ${errorCount} with problems` : ""} · term {step.preview.termId}
                    </p>

                    {errorCount ? (
                      <div role="alert" className="mt-3 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2.5">
                        <p className="text-[0.8125rem] font-medium text-destructive">
                          Fix {errorCount === 1 ? "this row" : `these ${errorCount} rows`} in the file, then choose it again.
                          Nothing can be imported until every row is valid.
                        </p>
                        <ul className="mt-1.5 max-h-36 overflow-y-auto font-mono text-[0.6875rem] leading-5 text-destructive/90 [scrollbar-width:thin]">
                          {step.preview.errors.map((error) => (
                            <li key={error}>{error}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {step.unknownPrograms.length ? (
                      <p className="mt-3 rounded-md bg-brand-gold/15 px-3 py-2 text-[0.8125rem] leading-5 text-foreground">
                        Not in the Programs list:{" "}
                        <span className="font-mono">
                          {step.unknownPrograms.map((p) => `${p.code} (${p.count})`).join(", ")}
                        </span>
                        . Add {step.unknownPrograms.length === 1 ? "it" : "them"} under Programs first, or the import may fail.
                      </p>
                    ) : null}

                    {existingCount ? (
                      <fieldset className="mt-3">
                        <legend className="text-[0.8125rem] font-medium text-foreground">
                          {existingCount} {existingCount === 1 ? "student is" : "students are"} already on the roster
                        </legend>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          {CHOICES.map((choice) => (
                            <label
                              key={choice.value}
                              className={cn(
                                "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors",
                                onExisting === choice.value
                                  ? "border-brand-blue/60 bg-brand-blue/5"
                                  : "border-border hover:bg-muted/50",
                              )}
                            >
                              <input
                                type="radio"
                                name="on-existing"
                                value={choice.value}
                                checked={onExisting === choice.value}
                                onChange={() => setOnExisting(choice.value)}
                                className="mt-0.5 accent-[var(--color-brand-blue)]"
                              />
                              <span>
                                <span className="block text-[0.8125rem] font-medium text-foreground">{choice.label}</span>
                                <span className="block text-[0.75rem] text-muted-foreground">{choice.hint}</span>
                              </span>
                            </label>
                          ))}
                        </div>
                        <ul className="mt-2 max-h-28 overflow-y-auto rounded-md border border-border px-3 py-1.5 font-mono text-[0.6875rem] leading-5 text-muted-foreground [scrollbar-width:thin]">
                          {step.preview.existing.map((s) => (
                            <li key={s.id}>
                              {s.id} · {s.name}
                            </li>
                          ))}
                        </ul>
                      </fieldset>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null}

            {saveError ? (
              <p role="alert" className="mt-3 rounded-md bg-destructive/8 px-3 py-2 text-[0.8125rem] whitespace-pre-line text-destructive">
                {saveError}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-border px-5 py-3.5">
            <button type="button" onClick={downloadSample} className={cn(toolbarButtonClassName, "h-8 gap-2 text-[0.8125rem]")}>
              <Download aria-hidden className="size-3.5" />
              Sample CSV
            </button>
            <div className="flex gap-2.5">
              <Dialog.Close disabled={saving} className={cn(toolbarButtonClassName, "h-8 text-[0.8125rem] disabled:cursor-wait disabled:opacity-50")}>
                Cancel
              </Dialog.Close>
              <button
                type="button"
                disabled={!canImport || saving}
                onClick={() => void apply()}
                className="h-8 cursor-pointer rounded-md bg-primary px-3.5 text-[0.8125rem] font-semibold text-primary-foreground transition-[background-color,opacity] duration-200 hover:bg-[color-mix(in_oklab,var(--color-brand-navy)_86%,var(--color-brand-blue))] disabled:cursor-not-allowed disabled:opacity-45 dark:hover:bg-white/90"
              >
                {saving ? "Importing…" : willSave > 0 ? `Import ${willSave} student${willSave === 1 ? "" : "s"}` : "Import"}
              </button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
