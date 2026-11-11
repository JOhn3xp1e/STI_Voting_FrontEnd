"use client";

import { useRef, useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";

import { DialogCancel, DialogFrame, DialogHeading, dialogPrimaryClassName } from "@/components/shared/dialog-frame";
import styles from "@/components/shared/motion.module.css";
import { toolbarButtonClassName } from "@/components/students/student-toolbar-styles";
import { PROGRAM_CSV_COLUMNS, SAMPLE_PROGRAMS_CSV, previewProgramImport, type ProgramImportRow } from "@/lib/programs";
import { cn } from "@/lib/utils";
import type { Program } from "@/types/program.types";

const MAX_BYTES = 1024 * 1024;

const ACTION_BADGE = {
  new: "bg-brand-blue/10 text-brand-blue dark:bg-white/10 dark:text-[#9dbdeb]",
  update: "bg-brand-gold/25 text-brand-navy dark:bg-brand-gold/20 dark:text-brand-gold",
  same: "bg-muted text-muted-foreground",
  error: "bg-destructive/10 text-destructive",
} as const;

interface ImportProgramsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  programs: readonly Program[];
  /** Saves the new / changed rows; rejects with a user-facing message when nothing could be saved. */
  onApply: (rows: Extract<ProgramImportRow, { name: string }>[]) => Promise<void>;
}

/** UTF-8 first; Excel's "CSV (Comma delimited)" is Windows-1252. */
async function readText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(buffer) : utf8;
}

export function ImportProgramsDialog({ open, onOpenChange, programs, onApply }: ImportProgramsDialogProps) {
  const [saving, setSaving] = useState(false);
  return (
    <DialogFrame open={open} onOpenChange={onOpenChange} locked={saving} widthClassName="w-[min(36rem,calc(100vw-2rem))]">
      <ImportForm programs={programs} saving={saving} setSaving={setSaving} onApply={onApply} onDone={() => onOpenChange(false)} />
    </DialogFrame>
  );
}

function ImportForm({
  programs,
  saving,
  setSaving,
  onApply,
  onDone,
}: Pick<ImportProgramsDialogProps, "programs" | "onApply"> & { saving: boolean; setSaving: (saving: boolean) => void; onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ fileName: string; rows: ProgramImportRow[]; error?: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function readFile(file: File) {
    setSaveError(null);
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      setPreview({ fileName: file.name, rows: [], error: "Choose a .csv file." });
      return;
    }
    if (file.size > MAX_BYTES) {
      setPreview({ fileName: file.name, rows: [], error: "This file is larger than 1 MB." });
      return;
    }
    setPreview({ fileName: file.name, ...previewProgramImport(await readText(file), programs) });
  }

  function downloadSample() {
    const url = URL.createObjectURL(new Blob([SAMPLE_PROGRAMS_CSV], { type: "text/csv" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: "programs-sample.csv" });
    link.click();
    URL.revokeObjectURL(url);
  }

  const rows = preview?.rows ?? [];
  const toSave = rows.filter((r): r is Extract<ProgramImportRow, { name: string }> => r.action === "new" || r.action === "update");
  const count = (action: ProgramImportRow["action"]) => rows.filter((r) => r.action === action).length;

  async function apply() {
    if (saving || toSave.length === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onApply(toSave);
      onDone();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "The import failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeading
        eyebrow="Programs"
        title="Import CSV"
        description="Rows are matched by code. New codes are added; existing ones get their name updated. Nothing is saved until you confirm."
        closeDisabled={saving}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
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
            {preview ? "Choose another file" : "Choose a CSV file"} <span className="font-normal text-muted-foreground">or drop it here</span>
          </span>
          <span className="font-mono text-[0.6875rem] text-muted-foreground">{PROGRAM_CSV_COLUMNS.join(", ")}</span>
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
          <div className={cn("mt-4", styles.fieldError)} aria-live="polite">
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
                  {rows.length} rows · {count("new")} new · {count("update")} updates · {count("same")} unchanged
                  {count("error") ? ` · ${count("error")} skipped` : ""}
                </p>
                <div className="mt-3 max-h-56 overflow-auto rounded-lg border border-border [scrollbar-width:thin]">
                  <table className="w-full text-left text-[0.75rem]">
                    <thead className="sticky top-0 bg-popover font-mono text-[0.625rem] tracking-[0.08em] text-muted-foreground uppercase">
                      <tr>
                        <th className="border-b border-border px-3 py-2 font-normal">Line</th>
                        <th className="border-b border-border px-3 py-2 font-normal">Code</th>
                        <th className="border-b border-border px-3 py-2 font-normal">Name / issue</th>
                        <th className="border-b border-border px-3 py-2 font-normal">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.line} className="transition-colors hover:bg-muted/50">
                          <td className="border-b border-border px-3 py-2 font-mono text-muted-foreground">{row.line}</td>
                          <td className="border-b border-border px-3 py-2 font-mono">{row.code || "—"}</td>
                          <td className="max-w-56 truncate border-b border-border px-3 py-2">
                            {row.action === "error" ? <span className="text-destructive">{row.reason}</span> : row.name}
                          </td>
                          <td className="border-b border-border px-3 py-2">
                            <span className={cn("rounded-[3px] px-1.5 py-0.5 font-mono text-[0.59375rem] font-semibold tracking-[0.06em] uppercase", ACTION_BADGE[row.action])}>
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
          <p role="alert" className={cn("mt-3 rounded-md bg-destructive/8 px-3 py-2 text-[0.8125rem] text-destructive", styles.fieldError)}>
            {saveError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-border px-6 py-4">
        <button type="button" onClick={downloadSample} className={cn(toolbarButtonClassName, "h-9 gap-2 text-[0.8125rem]")}>
          <Download aria-hidden className="size-3.5" />
          Sample CSV
        </button>
        <div className="flex gap-2.5">
          <DialogCancel disabled={saving} />
          <button type="button" disabled={toSave.length === 0 || saving} onClick={() => void apply()} className={dialogPrimaryClassName}>
            {saving ? "Importing…" : toSave.length ? `Import ${toSave.length} program${toSave.length === 1 ? "" : "s"}` : "Import"}
          </button>
        </div>
      </div>
    </>
  );
}
