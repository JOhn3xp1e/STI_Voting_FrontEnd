"use client";

import { useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Download, FileSpreadsheet, Upload, X } from "lucide-react";

import { CSV_COLUMNS, buildSampleCsv, previewCsvImport, type ImportRowResult } from "@/lib/students";
import { cn } from "@/lib/utils";
import type { Student } from "@/types/student.types";

import { useStudentCatalog } from "./student-catalog";
import { toolbarButtonClassName } from "./student-toolbar-styles";

const MAX_BYTES = 2 * 1024 * 1024;

interface Preview {
  fileName: string;
  results: ImportRowResult[];
  error?: string;
}

interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: readonly Student[];
  /** Saves the valid rows through the Web API: new rows are created, existing ones get their enrollment updated. */
  onApply: (rows: { added: Student[]; updated: Student[] }) => Promise<void>;
}

const ACTION_BADGE = {
  new: "bg-brand-blue/10 text-brand-blue dark:bg-white/10 dark:text-[#9dbdeb]",
  update: "bg-brand-gold/25 text-brand-navy dark:bg-brand-gold/20 dark:text-brand-gold",
  error: "bg-destructive/10 text-destructive",
} as const;

/** CSV upsert: pick or drop a file, preview matches by student no., then save through the Web API. */
export function CsvImportDialog({ open, onOpenChange, students, onApply }: CsvImportDialogProps) {
  const catalog = useStudentCatalog();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function readFile(file: File) {
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      setPreview({ fileName: file.name, results: [], error: "Choose a .csv file." });
      return;
    }
    if (file.size > MAX_BYTES) {
      setPreview({ fileName: file.name, results: [], error: "This file is larger than 2 MB." });
      return;
    }
    const { results, error } = previewCsvImport(await file.text(), students, catalog);
    setPreview({ fileName: file.name, results, error });
    setSaveError(null);
  }

  function downloadSample() {
    const url = URL.createObjectURL(new Blob([buildSampleCsv(catalog)], { type: "text/csv" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: "students-sample.csv" });
    link.click();
    URL.revokeObjectURL(url);
  }

  const valid = preview?.results.filter((r): r is Extract<ImportRowResult, { student: Student }> => r.action !== "error") ?? [];
  const added = valid.filter((r) => r.action === "new").length;
  const updated = valid.length - added;
  const errors = (preview?.results.length ?? 0) - valid.length;

  async function apply() {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onApply({
        added: valid.filter((r) => r.action === "new").map((r) => r.student),
        updated: valid.filter((r) => r.action === "update").map((r) => r.student),
      });
      onOpenChange(false);
      setPreview(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "The import failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && saving) return; // keep the dialog open until the import finishes
        onOpenChange(next);
        if (!next) {
          setPreview(null);
          setDragging(false);
          setSaveError(null);
        }
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
                Rows are matched by student no. Existing students get their term &amp; year updated; new ones are added
                and enrolled. Nothing is saved until you confirm.
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X aria-hidden className="size-4" />
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <button
              type="button"
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
                if (file) void readFile(file);
              }}
              className={cn(
                "flex w-full cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed border-border px-4 py-6 text-center outline-none",
                "transition-[background-color,border-color] duration-200 hover:border-brand-blue/40 hover:bg-brand-blue/3 focus-visible:border-brand-blue/60 focus-visible:ring-3 focus-visible:ring-brand-blue/15",
                dragging && "border-brand-blue/60 bg-brand-blue/5",
              )}
            >
              <Upload aria-hidden className="size-5 text-brand-blue dark:text-[#7aa7e6]" strokeWidth={1.75} />
              <span className="text-[0.8125rem] font-medium text-foreground">
                {preview ? "Choose another file" : "Choose a CSV file"}{" "}
                <span className="font-normal text-muted-foreground">or drop it here</span>
              </span>
              <span className="font-mono text-[0.6875rem] text-muted-foreground">{CSV_COLUMNS.join(", ")}</span>
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

            {preview ? (
              <div className="mt-4" aria-live="polite">
                <p className="flex items-center gap-2 text-[0.8125rem] font-medium text-foreground">
                  <FileSpreadsheet aria-hidden className="size-4 text-muted-foreground" />
                  <span className="truncate">{preview.fileName}</span>
                </p>
                {preview.error ? (
                  <p role="alert" className="mt-2 rounded-md bg-destructive/8 px-3 py-2 text-[0.8125rem] text-destructive">
                    {preview.error}
                  </p>
                ) : (
                  <>
                    <p className="mt-1 font-mono text-[0.6875rem] text-muted-foreground">
                      {preview.results.length} rows · {added} new · {updated} updates{errors ? ` · ${errors} skipped` : ""}
                    </p>
                    <div className="mt-3 max-h-56 overflow-auto rounded-lg border border-border [scrollbar-width:thin]">
                      <table className="w-full text-left text-[0.75rem]">
                        <thead className="sticky top-0 bg-popover font-mono text-[0.625rem] tracking-[0.08em] text-muted-foreground uppercase">
                          <tr>
                            <th className="border-b border-border px-3 py-2 font-normal">Line</th>
                            <th className="border-b border-border px-3 py-2 font-normal">Student no.</th>
                            <th className="border-b border-border px-3 py-2 font-normal">Name / issue</th>
                            <th className="border-b border-border px-3 py-2 font-normal">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.results.map((row) => (
                            <tr key={row.line} className="transition-colors hover:bg-muted/50">
                              <td className="border-b border-border px-3 py-2 font-mono text-muted-foreground">{row.line}</td>
                              <td className="border-b border-border px-3 py-2 font-mono">
                                {row.action === "error" ? row.studentNo || "—" : row.student.studentNo}
                              </td>
                              <td
                                className="max-w-48 truncate border-b border-border px-3 py-2"
                                title={row.action === "error" ? row.reason : row.student.email}
                              >
                                {row.action === "error" ? (
                                  <span className="text-destructive">{row.reason}</span>
                                ) : (
                                  `${row.student.lastName}, ${row.student.firstName} · ${row.student.term}`
                                )}
                              </td>
                              <td className="border-b border-border px-3 py-2">
                                <span
                                  className={cn(
                                    "rounded-[3px] px-1.5 py-0.5 font-mono text-[0.59375rem] font-semibold tracking-[0.06em] uppercase",
                                    ACTION_BADGE[row.action],
                                  )}
                                >
                                  {row.action === "error" ? "skip" : row.action}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            ) : null}

            {saveError ? (
              <p role="alert" className="mt-3 rounded-md bg-destructive/8 px-3 py-2 text-[0.8125rem] text-destructive">
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
              <Dialog.Close className={cn(toolbarButtonClassName, "h-8 text-[0.8125rem]")}>Cancel</Dialog.Close>
              <button
                type="button"
                disabled={valid.length === 0 || saving}
                onClick={() => void apply()}
                className="h-8 cursor-pointer rounded-md bg-primary px-3.5 text-[0.8125rem] font-semibold text-primary-foreground transition-[background-color,opacity] duration-200 hover:bg-[color-mix(in_oklab,var(--color-brand-navy)_86%,var(--color-brand-blue))] disabled:cursor-not-allowed disabled:opacity-45 dark:hover:bg-white/90"
              >
                {saving ? "Importing…" : `Import ${valid.length ? `${valid.length} row${valid.length > 1 ? "s" : ""}` : ""}`.trim()}
              </button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
