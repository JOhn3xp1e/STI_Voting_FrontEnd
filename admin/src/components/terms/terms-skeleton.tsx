import { Plus, Search } from "lucide-react";

import {
  Skeleton,
  SkeletonCheckbox,
  SkeletonField,
  SkeletonLine,
  SkeletonRegion,
  SkeletonUnderlineTabs,
  pickWidth,
  skeletonDelay,
  skeletonHeadRowClassName,
} from "@/components/shared/skeleton";
import { primaryButtonClassName, toolbarButtonClassName } from "@/components/students/student-toolbar-styles";
import { Caret } from "@/components/students/option-menu";
import { cn } from "@/lib/utils";

const TITLE_WIDTHS = ["w-[48%]", "w-[56%]", "w-[44%]", "w-[52%]", "w-[60%]", "w-[46%]"];
const RANGE_WIDTHS = ["w-[38%]", "w-[42%]", "w-[36%]", "w-[40%]", "w-[44%]", "w-[37%]"];

/** Terms page placeholder: status tabs, toolbar, terms table and the New term card. */
export function TermsSkeleton() {
  return (
    <SkeletonRegion label="Loading terms…" className="px-4 pt-4 pb-28 sm:px-6 lg:px-8">
      <SkeletonUnderlineTabs labels={["All", "Current", "Upcoming", "Ended"]} />

      <div className="mt-5 grid grid-cols-1 items-start gap-x-6 gap-y-5 min-[85rem]:grid-cols-[minmax(0,1fr)_22.5rem]">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2.5 min-[85rem]:col-span-2">
          <div className="relative min-w-0 flex-1 sm:w-60 sm:flex-none">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.25 size-4 -translate-y-1/2 text-muted-foreground" />
            <span className="flex h-8.5 w-full items-center rounded-md border border-border bg-background pl-8.75 text-[0.875rem] text-muted-foreground">
              Search terms
            </span>
          </div>
          <span className={cn(toolbarButtonClassName, "gap-1 px-3")}>
            School year
            <Caret />
          </span>
          <div className="flex w-full items-center gap-2.5 sm:ml-auto sm:w-auto">
            <span className={cn(toolbarButtonClassName, "gap-2 px-3.5")}>
              <Plus aria-hidden className="size-4" strokeWidth={1.75} />
              Roll over enrollment
            </span>
            <span className={primaryButtonClassName}>+ New term</span>
          </div>
        </div>

        {/* Table */}
        <div className="min-w-0 min-[85rem]:col-start-1 min-[85rem]:row-start-2">
          <div className="overflow-hidden border-t border-border">
            <table className="w-full min-w-150 table-fixed border-separate border-spacing-0 text-left">
              <colgroup>
                <col className="w-9.5" />
                <col />
                <col className="w-28 min-[90rem]:w-31.5" />
                <col className="w-20 min-[90rem]:w-22" />
                <col className="w-25 min-[90rem]:w-28" />
              </colgroup>
              <thead>
                <tr className={skeletonHeadRowClassName}>
                  <th className="border-b border-border pl-2 font-normal">
                    <SkeletonCheckbox />
                  </th>
                  <th className="border-b border-border font-normal">Term</th>
                  <th className="border-b border-border font-normal">Term ID</th>
                  <th className="border-b border-border font-normal">Acad year</th>
                  <th className="border-b border-border font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 6 }, (_, index) => (
                  <tr key={index} className="h-14.5" style={skeletonDelay(index)}>
                    <td className="border-b border-border pl-2">
                      <SkeletonCheckbox />
                    </td>
                    <td className="border-b border-border pr-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Skeleton className="size-7" />
                        <div className="min-w-0 flex-1">
                          <SkeletonLine lineClassName="h-4.5" className={pickWidth(TITLE_WIDTHS, index)} />
                          <SkeletonLine className={cn("h-2", pickWidth(RANGE_WIDTHS, index))} />
                        </div>
                      </div>
                    </td>
                    <td className="border-b border-border pr-3">
                      <Skeleton className="h-2.5 w-[70%]" />
                    </td>
                    <td className="border-b border-border pr-3">
                      <Skeleton className="h-2.5 w-[64%]" />
                    </td>
                    <td className="border-b border-border pr-3">
                      <Skeleton className={cn("h-4.75", index % 3 === 0 ? "w-[72%]" : "w-[60%]")} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-2 pt-4">
            <SkeletonLine className="h-2 w-[min(100%,26rem)]" />
          </div>
        </div>

        {/* New term card */}
        <section
          className="rounded-xl border border-border bg-card shadow-[0_1px_2px_rgb(15_23_42/0.04),0_8px_24px_-18px_rgb(15_23_42/0.25)] min-[85rem]:col-start-2 min-[85rem]:row-start-2 dark:shadow-none"
          style={skeletonDelay(2)}
        >
          <h2 className="flex h-11.75 items-center border-b border-border px-5 font-mono text-[0.6875rem] font-semibold tracking-[0.14em] text-foreground uppercase">
            New term
          </h2>
          <div className="flex flex-col gap-3.5 p-5">
            <div>
              <SkeletonLine lineClassName="mb-1" className="w-24" />
              <SkeletonField />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <SkeletonLine lineClassName="mb-1" className="w-16" />
                <SkeletonField />
              </div>
              <div>
                <SkeletonLine lineClassName="mb-1" className="w-14" />
                <SkeletonField />
              </div>
            </div>
            <div>
              <SkeletonLine lineClassName="mb-1" className="w-14" />
              <SkeletonField />
            </div>
            <div>
              <SkeletonLine className="w-32" />
              <SkeletonLine lineClassName="mt-1" className="h-2 w-40" />
            </div>
            <Skeleton className="h-8.5 w-full rounded-md" />
          </div>
        </section>
      </div>
    </SkeletonRegion>
  );
}
