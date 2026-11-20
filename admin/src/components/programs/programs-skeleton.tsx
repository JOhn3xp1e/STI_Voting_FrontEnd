import { Plus, RotateCw, Search } from "lucide-react";

import {
  Skeleton,
  SkeletonCheckbox,
  SkeletonLine,
  SkeletonRegion,
  SkeletonUnderlineTabs,
  pickWidth,
  skeletonDelay,
  skeletonHeadRowClassName,
} from "@/components/shared/skeleton";
import { Caret } from "@/components/students/option-menu";
import { toolbarButtonClassName } from "@/components/students/student-toolbar-styles";
import { cn } from "@/lib/utils";

function SectionHeadingSkeleton({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3">
      <h2 className="flex min-w-0 items-baseline gap-2">
        <span className="font-mono text-[0.75rem] font-semibold tracking-[0.14em] text-foreground uppercase">{title}</span>
        <span className="truncate font-mono text-[0.65625rem] text-muted-foreground">{hint}</span>
      </h2>
      <Skeleton className="size-6 rounded-md" />
    </div>
  );
}

const CAREER_NAME_WIDTHS = ["w-[42%]", "w-[56%]", "w-[34%]"];
const PROGRAM_NAME_WIDTHS = ["w-[58%]", "w-[66%]", "w-[50%]", "w-[72%]", "w-[54%]", "w-[62%]"];

/** Programs & careers placeholder: career tabs, toolbar, careers table and programs table. */
export function ProgramsSkeleton() {
  return (
    <SkeletonRegion label="Loading programs & careers…" className="px-4 pt-4 pb-28 sm:px-6 lg:px-8">
      <SkeletonUnderlineTabs labels={["All"]} bones={3} />

      {/* Toolbar */}
      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-0 flex-1 sm:w-60 sm:flex-none">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.25 size-4 -translate-y-1/2 text-muted-foreground" />
          <span className="flex h-8.5 w-full items-center rounded-md border border-border bg-background pl-8.75 text-[0.875rem] text-muted-foreground">
            Search programs
          </span>
        </div>
        <span className={cn(toolbarButtonClassName, "gap-1 px-3")}>
          Career
          <Caret />
        </span>
        <span className={cn(toolbarButtonClassName, "gap-2 px-3.5 sm:ml-auto")}>
          <Plus aria-hidden className="size-4" strokeWidth={1.75} />
          Import CSV
        </span>
        <span className={cn(toolbarButtonClassName, "w-8.5 justify-center px-0")}>
          <RotateCw aria-hidden className="size-4" strokeWidth={1.75} />
        </span>
      </div>

      {/* Careers */}
      <section className="mt-6">
        <SectionHeadingSkeleton title="Careers" hint="code · name · grade levels" />
        <div className="overflow-hidden rounded-lg border border-border bg-background">
          <table className="w-full min-w-140 table-fixed border-separate border-spacing-0 text-left">
            <colgroup>
              <col className="w-27.5" />
              <col />
              <col className="w-24 min-[90rem]:w-28" />
              <col className="w-18" />
            </colgroup>
            <thead>
              <tr className="h-8.5 font-mono text-[0.625rem] tracking-[0.08em] text-muted-foreground uppercase">
                <th className="border-b border-border pl-3.5 font-normal">Code</th>
                <th className="border-b border-border font-normal">Name</th>
                <th className="border-b border-border font-normal">Levels</th>
                <th className="border-b border-border font-normal" />
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 3 }, (_, index) => (
                <tr key={index} className="h-9.5 [&:not(:last-child)>td]:border-b [&>td]:border-border" style={skeletonDelay(index)}>
                  <td className="pl-3.5">
                    <Skeleton className={cn("h-5.5 rounded-md", index === 1 ? "w-12" : "w-14")} />
                  </td>
                  <td className="pr-3">
                    <Skeleton className={cn("h-2.5", pickWidth(CAREER_NAME_WIDTHS, index))} />
                  </td>
                  <td className="pr-3">
                    <Skeleton className="h-2.5 w-[64%]" />
                  </td>
                  <td className="pr-3.5">
                    <Skeleton className="ml-auto h-2.5 w-7" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Programs */}
      <section className="mt-6">
        <SectionHeadingSkeleton title="Programs" hint="filter by career with the tabs above" />
        <div className="overflow-hidden border-t border-border">
          <table className="w-full min-w-140 table-fixed border-separate border-spacing-0 text-left">
            <colgroup>
              <col className="w-9.5" />
              <col />
              <col className="w-24" />
              <col className="w-20" />
              <col className="w-25 min-[90rem]:w-28" />
            </colgroup>
            <thead>
              <tr className={skeletonHeadRowClassName}>
                <th className="border-b border-border pl-2 font-normal">
                  <SkeletonCheckbox />
                </th>
                <th className="border-b border-border font-normal">Program</th>
                <th className="border-b border-border font-normal">Students</th>
                <th className="border-b border-border font-normal">Career</th>
                <th className="border-b border-border font-normal">Created</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }, (_, index) => (
                <tr key={index} className="h-14.5" style={skeletonDelay(index + 3)}>
                  <td className="border-b border-border pl-2">
                    <SkeletonCheckbox />
                  </td>
                  <td className="border-b border-border pr-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Skeleton className="size-7" />
                      <div className="min-w-0 flex-1">
                        <SkeletonLine lineClassName="h-4.5" className={index % 2 ? "w-16" : "w-20"} />
                        <SkeletonLine className={cn("h-2", pickWidth(PROGRAM_NAME_WIDTHS, index))} />
                      </div>
                    </div>
                  </td>
                  <td className="border-b border-border pr-3">
                    <Skeleton className="h-2.5 w-8" />
                  </td>
                  <td className="border-b border-border pr-3">
                    <Skeleton className="h-5.5 w-12 rounded-md" />
                  </td>
                  <td className="border-b border-border pr-3">
                    <Skeleton className="h-2.5 w-[76%]" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-2 pt-4">
          <SkeletonLine className="h-2 w-[min(100%,30rem)]" />
        </div>
      </section>
    </SkeletonRegion>
  );
}
