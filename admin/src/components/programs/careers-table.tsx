"use client";

import styles from "@/components/shared/motion.module.css";
import { formatLevels, textOn } from "@/lib/programs";
import { cn } from "@/lib/utils";
import type { Career } from "@/types/program.types";

interface CareersTableProps {
  careers: readonly Career[];
  /** Careers to flash (just created / edited). */
  flashed: ReadonlySet<string>;
  /** Replays the entrance when the list is re-filtered. */
  resultKey: string;
  onEdit: (career: Career) => void;
  /** The career's display color (its own, else a stable fallback). */
  colorOf: (career: Career) => string;
  emptyText: string;
}

/** Bordered careers list: code pill, name, grade levels, Edit. */
export function CareersTable({ careers, flashed, resultKey, onEdit, colorOf, emptyText }: CareersTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-background scrollbar-thin">
      <table className="w-full min-w-140 table-fixed border-separate border-spacing-0 text-left">
        <caption className="sr-only">Careers</caption>
        <colgroup>
          <col className="w-27.5" />
          <col />
          <col className="w-24 min-[90rem]:w-28" />
          <col className="w-18" />
        </colgroup>
        <thead>
          <tr className="h-8.5 font-mono text-[0.625rem] tracking-[0.08em] text-muted-foreground uppercase">
            <th scope="col" className="border-b border-border pl-3.5 font-normal">Code</th>
            <th scope="col" className="border-b border-border font-normal">Name</th>
            <th scope="col" className="border-b border-border font-normal">Levels</th>
            <th scope="col" className="border-b border-border font-normal">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody key={resultKey}>
          {careers.length === 0 ? (
            <tr className={styles.rowIn}>
              <td colSpan={4} className="h-14 text-center text-[0.8125rem] text-muted-foreground">
                {emptyText}
              </td>
            </tr>
          ) : (
            careers.map((career, index) => (
              <tr
                key={career.code}
                onClick={() => onEdit(career)}
                style={{ animationDelay: `${index * 40}ms` }}
                className={cn(
                  "group/row h-9.5 cursor-pointer transition-colors duration-200 hover:bg-muted/55 dark:hover:bg-white/3",
                  "[&:not(:last-child)>td]:border-b [&>td]:border-border",
                  styles.rowIn,
                  flashed.has(career.code) && styles.rowFlash,
                )}
              >
                <td className="pl-3.5">
                  <CareerCode code={career.code} color={colorOf(career)} />
                </td>
                <td className="truncate pr-3 text-[0.875rem] font-medium text-foreground">{career.name}</td>
                <td className="text-[0.8125rem] text-foreground/85 tabular-nums">{formatLevels(career)}</td>
                <td className="pr-3.5 text-right">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(career);
                    }}
                    aria-label={`Edit ${career.name}`}
                    className="cursor-pointer rounded-sm px-1 text-[0.8125rem] text-brand-blue outline-none transition-colors hover:text-[color-mix(in_oklab,var(--color-brand-blue)_75%,black)] hover:underline focus-visible:ring-2 focus-visible:ring-brand-blue/30 dark:text-[#7aa7e6]"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/** "TER" pill filled with the career's color. */
export function CareerCode({ code, color }: { code: string; color: string }) {
  return (
    <span
      className="inline-flex h-5.5 items-center rounded-md px-2 font-mono text-[0.65625rem] leading-none font-medium tracking-[0.04em]"
      style={{ backgroundColor: color, color: textOn(color) }}
    >
      {code}
    </span>
  );
}
