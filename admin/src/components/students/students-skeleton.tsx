import { Funnel, Plus, Search } from "lucide-react";

import {
  Skeleton,
  SkeletonCheckbox,
  SkeletonField,
  SkeletonLine,
  SkeletonRegion,
  SkeletonSparkline,
  pickWidth,
  skeletonDelay,
  skeletonHeadRowClassName,
} from "@/components/shared/skeleton";
import { cn } from "@/lib/utils";

import { primaryButtonClassName, toolbarButtonClassName } from "./student-toolbar-styles";

/** Same cell dividers as StudentStats. */
const CELL_BORDERS = [
  "border-b sm:border-r xl:border-b-0",
  "border-b xl:border-b-0 xl:border-r",
  "border-b sm:border-b-0 sm:border-r",
  "xl:border-r",
];

const STATS = [
  { label: "w-24", detail: "w-20", trend: "up", tone: "blue" },
  { label: "w-28", detail: "w-16", trend: "up", tone: "blue" },
  { label: "w-22", detail: "w-24", trend: "down", tone: "gold" },
  { label: "w-26", detail: "w-22", trend: "down", tone: "gold" },
] as const;

const NAME_WIDTHS = ["w-[46%]", "w-[54%]", "w-[62%]", "w-[42%]", "w-[58%]", "w-[66%]", "w-[50%]"];
const EMAIL_WIDTHS = ["w-[62%]", "w-[70%]", "w-[58%]", "w-[66%]", "w-[74%]", "w-[60%]", "w-[68%]"];

/** Students page placeholder: stats, toolbar, roster table and the Add student card. */
export function StudentsSkeleton() {
  return (
    <SkeletonRegion label="Loading students…" className="px-4 pt-0 pb-28 sm:px-6 lg:px-8">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        {STATS.map((stat, index) => (
          <div
            key={index}
            className={cn("flex min-w-0 items-center justify-between gap-3 border-border py-5 pr-5.5 pl-6", CELL_BORDERS[index])}
            style={skeletonDelay(index, 90)}
          >
            <div className="min-w-0 flex-1">
              <SkeletonLine lineClassName="h-4.5" className={stat.label} />
              <SkeletonLine lineClassName="mt-2 h-8" className={cn("h-6 rounded-md", index === 0 ? "w-20" : "w-14")} />
              <SkeletonLine lineClassName="mt-1.5 h-4" className={cn("h-2", stat.detail)} />
            </div>
            <div className="mb-0.5 self-end">
              <SkeletonSparkline trend={stat.trend} tone={stat.tone} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-1 items-start gap-x-6 gap-y-5.5 min-[85rem]:grid-cols-[minmax(0,1fr)_22.5rem]">
        {/* Toolbar (inert copy of StudentToolbar) */}
        <div className="flex flex-wrap items-center gap-2.5 min-[85rem]:col-start-1">
          <div className="relative min-w-0 flex-1 sm:w-60 sm:flex-none">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.25 size-4 -translate-y-1/2 text-muted-foreground" />
            <span className="flex h-8.5 w-full items-center rounded-md border border-border bg-background pl-8.75 text-[0.875rem] text-muted-foreground">
              Search name or student no.
            </span>
          </div>
          <span className={cn(toolbarButtonClassName, "gap-0 px-2.75")}>
            <Funnel aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
          </span>
          <div className="flex w-full items-center gap-2.5 sm:ml-auto sm:w-auto sm:gap-6">
            <span className={cn(toolbarButtonClassName, "gap-2 px-3.5")}>
              <Plus aria-hidden className="size-4" strokeWidth={1.75} />
              Import CSV (upsert)
            </span>
            <span className={primaryButtonClassName}>+ Add student</span>
          </div>
        </div>

        {/* Roster table */}
        <div className="min-w-0 min-[85rem]:col-start-1 min-[85rem]:row-start-2">
          <div className="overflow-hidden border-t border-border">
            <table className="w-full min-w-160 table-fixed border-separate border-spacing-0 text-left">
              <colgroup>
                <col className="w-9.5" />
                <col />
                <col className="w-28 min-[90rem]:w-31.5" />
                <col className="w-17 min-[90rem]:w-19.5" />
                <col className="w-14 min-[90rem]:w-15.5" />
                <col className="w-24 min-[90rem]:w-26.5" />
                <col className="w-25 min-[90rem]:w-28" />
              </colgroup>
              <thead>
                <tr className={skeletonHeadRowClassName}>
                  <th className="border-b border-border pl-2 font-normal">
                    <SkeletonCheckbox />
                  </th>
                  <th className="border-b border-border font-normal">Student</th>
                  <th className="border-b border-border font-normal">Student no.</th>
                  <th className="border-b border-border font-normal">Program</th>
                  <th className="border-b border-border font-normal">Year</th>
                  <th className="border-b border-border font-normal">Term</th>
                  <th className="border-b border-border font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 7 }, (_, index) => (
                  <tr key={index} className="h-14.5" style={skeletonDelay(index)}>
                    <td className="border-b border-border pl-2">
                      <SkeletonCheckbox />
                    </td>
                    <td className="border-b border-border pr-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Skeleton className="size-7" />
                        <div className="min-w-0 flex-1">
                          <SkeletonLine lineClassName="h-4.5" className={pickWidth(NAME_WIDTHS, index)} />
                          <SkeletonLine className={cn("h-2", pickWidth(EMAIL_WIDTHS, index))} />
                        </div>
                      </div>
                    </td>
                    <td className="border-b border-border pr-3">
                      <Skeleton className="h-2.5 w-[78%]" />
                    </td>
                    <td className="border-b border-border pr-3">
                      <Skeleton className={cn("h-2.5", index % 3 === 1 ? "w-[52%]" : "w-[64%]")} />
                    </td>
                    <td className="border-b border-border pr-3">
                      <Skeleton className="h-2.5 w-[58%]" />
                    </td>
                    <td className="border-b border-border pr-3">
                      <Skeleton className="h-2.5 w-[62%]" />
                    </td>
                    <td className="border-b border-border pr-3">
                      <Skeleton className={cn("h-4.75", index % 4 === 2 ? "w-[60%]" : "w-[78%]")} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <AddStudentCardSkeleton className="min-[85rem]:col-start-2 min-[85rem]:row-start-2" />
      </div>
    </SkeletonRegion>
  );
}

function FieldSkeleton({ label, className }: { label: string; className?: string }) {
  return (
    <div className={className}>
      <SkeletonLine lineClassName="mb-1 h-4" className={cn("h-2.5", label)} />
      <SkeletonField />
    </div>
  );
}

/** The Add student card: title bar, fields and the submit button. */
function AddStudentCardSkeleton({ className }: { className?: string }) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border bg-card shadow-[0_1px_2px_rgb(15_23_42/0.04),0_8px_24px_-18px_rgb(15_23_42/0.25)] dark:shadow-none",
        className,
      )}
      style={skeletonDelay(2)}
    >
      <h2 className="flex h-11.75 items-center border-b border-border px-5 font-mono text-[0.6875rem] font-semibold tracking-[0.14em] text-foreground uppercase">
        Add student
      </h2>
      <div className="flex flex-col gap-2.75 px-5 pt-4 pb-5">
        <FieldSkeleton label="w-20" />
        <div className="grid grid-cols-2 gap-2.5">
          <FieldSkeleton label="w-16" />
          <FieldSkeleton label="w-18" />
        </div>
        <FieldSkeleton label="w-28" />
        <div>
          <SkeletonLine className="h-2.5 w-32" />
          <SkeletonLine lineClassName="mt-1" className="h-2 w-44" />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <FieldSkeleton label="w-12" />
          <FieldSkeleton label="w-14" />
          <FieldSkeleton label="w-9" />
          <FieldSkeleton label="w-10" />
        </div>
        <Skeleton className="h-8.5 w-full rounded-md" />
      </div>
    </section>
  );
}
