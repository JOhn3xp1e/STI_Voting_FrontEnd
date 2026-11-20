import { RotateCw, Search } from "lucide-react";

import { SectionCard } from "@/components/shared/section-card";
import {
  Skeleton,
  SkeletonCheckbox,
  SkeletonField,
  SkeletonLine,
  SkeletonRegion,
  pickWidth,
  skeletonDelay,
  skeletonHeadRowClassName,
} from "@/components/shared/skeleton";
import { primaryButtonClassName, toolbarButtonClassName } from "@/components/students/student-toolbar-styles";
import { cn } from "@/lib/utils";

const NAME_WIDTHS = ["w-[44%]", "w-[56%]", "w-[38%]", "w-[50%]", "w-[60%]"];
const MOTTO_WIDTHS = ["w-[62%]", "w-[48%]", "w-[70%]", "w-[56%]", "w-[52%]"];

/** Party lists table placeholder: search, Add party list and the list. */
export function PartyListsSkeleton() {
  return (
    <SkeletonRegion label="Loading party lists…" className="px-4 pb-24 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center gap-2.5 pb-5">
        <div className="relative min-w-0 flex-1 sm:w-44 sm:flex-none">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.25 size-4 -translate-y-1/2 text-muted-foreground" />
          <span className="flex h-8.5 w-full items-center rounded-md border border-border bg-background pl-8.75 text-[0.875rem] text-muted-foreground">
            Search party lists
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          <span className={cn(toolbarButtonClassName, "w-8.5 justify-center px-0")}>
            <RotateCw aria-hidden className="size-4" strokeWidth={1.75} />
          </span>
          <span className={primaryButtonClassName}>+ Add party list</span>
        </div>
      </div>

      <div className="overflow-hidden border-t border-border">
        <table className="w-full min-w-160 table-fixed border-separate border-spacing-0 text-left">
          <colgroup>
            <col className="w-9.5" />
            <col />
            <col className="w-27.5" />
            <col className="w-27.5" />
            <col className="w-27.5" />
            <col className="w-21" />
          </colgroup>
          <thead>
            <tr className={skeletonHeadRowClassName}>
              <th className="border-b border-border pl-2 font-normal">
                <SkeletonCheckbox />
              </th>
              <th className="border-b border-border font-normal">Party list</th>
              <th className="border-b border-border font-normal">ID</th>
              <th className="border-b border-border font-normal">Candidates</th>
              <th className="border-b border-border font-normal">Platform</th>
              <th className="border-b border-border font-normal" />
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }, (_, index) => (
              <tr key={index} className="h-14.5" style={skeletonDelay(index)}>
                <td className="border-b border-border pl-2">
                  <SkeletonCheckbox />
                </td>
                <td className="border-b border-border pr-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Skeleton className="size-8 rounded-md" />
                    <div className="min-w-0 flex-1">
                      <SkeletonLine lineClassName="h-4.5" className={pickWidth(NAME_WIDTHS, index)} />
                      <SkeletonLine className={cn("h-2", pickWidth(MOTTO_WIDTHS, index))} />
                    </div>
                  </div>
                </td>
                <td className="border-b border-border pr-3">
                  <Skeleton className="h-2.5 w-[70%]" />
                </td>
                <td className="border-b border-border pr-3">
                  <Skeleton className="h-2.5 w-8" />
                </td>
                <td className="border-b border-border pr-3">
                  <Skeleton className={cn("h-4.5 rounded-[3px]", index % 3 === 2 ? "w-11" : "w-16")} />
                </td>
                <td className="border-b border-border pr-1">
                  <div className="flex items-center justify-end gap-0.5">
                    <span className="flex size-7.5 items-center justify-center">
                      <Skeleton className="size-4 rounded-sm" />
                    </span>
                    <span className="flex size-7.5 items-center justify-center">
                      <Skeleton className="size-4 rounded-sm" />
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SkeletonRegion>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Editor                                   */
/* -------------------------------------------------------------------------- */

const cardRadius = "rounded-[0.625rem] border-[#e4e8f0]";
const cardBody = "px-5 py-4.5";

function FieldSkeleton({ label }: { label: string }) {
  return (
    <div>
      <SkeletonLine lineClassName="mb-1.5 h-4" className={cn("h-2.5", label)} />
      <SkeletonField />
    </div>
  );
}

/** Party list editor placeholder: actions, the four form cards and the ballot preview (the breadcrumb is in the header). */
export function PartyListEditorSkeleton() {
  return (
    <SkeletonRegion label="Loading the party list…" className="px-4 pb-16 sm:px-6 lg:px-8">
      <div className="flex items-center justify-end pb-5">
        <div className="flex shrink-0 items-center gap-2.5">
          <span className={cn(toolbarButtonClassName, "h-9 px-4 text-[0.8125rem] font-semibold text-foreground")}>Discard</span>
          <span className={cn(primaryButtonClassName, "h-9 gap-2 text-[0.8125rem]")}>Save party list</span>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_23.75rem]">
        <div className="min-w-0 space-y-5">
          <SectionCard title="Identity" aside={<Skeleton className="h-2 w-28" />} className={cardRadius} bodyClassName={cardBody}>
            <div className="grid grid-cols-1 gap-x-3 gap-y-3.5 sm:grid-cols-2" style={skeletonDelay(0)}>
              <FieldSkeleton label="w-24" />
              <FieldSkeleton label="w-14" />
              <FieldSkeleton label="w-16" />
              <FieldSkeleton label="w-12" />
            </div>
          </SectionCard>

          <SectionCard title="Party color" aside="used for tags, banner and ballot" className={cardRadius} bodyClassName={cardBody}>
            <div className="flex flex-wrap items-center gap-2.5 pb-1" style={skeletonDelay(1)}>
              {Array.from({ length: 8 }, (_, index) => (
                <Skeleton key={index} className="size-7" />
              ))}
              <Skeleton className="ml-auto h-10 w-40 rounded-md" />
            </div>
          </SectionCard>

          <SectionCard title="Logo & banner" aside="drag an image onto a row to replace it" className={cardRadius} bodyClassName={cn(cardBody, "space-y-4")}>
            {Array.from({ length: 2 }, (_, index) => (
              <div key={index} className="flex items-center gap-3.5" style={skeletonDelay(index + 2)}>
                <Skeleton className={cn("h-14 rounded-lg", index === 0 ? "w-14" : "w-28")} />
                <div className="min-w-0 flex-1">
                  <SkeletonLine className="w-20" />
                  <SkeletonLine lineClassName="mt-1" className="h-2 w-40" />
                </div>
                <Skeleton className="h-8.5 w-24 rounded-md" />
              </div>
            ))}
          </SectionCard>

          <SectionCard title="Platform" aside="shown on the ballot" className={cardRadius} bodyClassName={cardBody}>
            <div style={skeletonDelay(4)}>
              <Skeleton className="h-28 w-full rounded-md" />
            </div>
          </SectionCard>
        </div>

        <aside className="xl:sticky xl:top-6">
          <SectionCard title="Preview" aside="voter ballot" className={cardRadius} bodyClassName={cn(cardBody, "space-y-3.5")}>
            <div className="flex items-center gap-2.5 rounded-lg border border-[#e4e8f0] p-3.5 dark:border-border" style={skeletonDelay(1)}>
              <Skeleton className="size-10" />
              <div className="min-w-0 flex-1 space-y-0.5">
                <SkeletonLine lineClassName="h-5.5" className="h-3.5 w-[60%]" />
                <SkeletonLine className="h-2 w-[72%]" />
              </div>
            </div>
            <div className="flex items-center gap-2.5 rounded-lg border border-[#e4e8f0] px-3 py-2.5 dark:border-border" style={skeletonDelay(2)}>
              <Skeleton className="size-8" />
              <div className="min-w-0 flex-1 space-y-0.5">
                <SkeletonLine lineClassName="h-5" className="w-[54%]" />
                <SkeletonLine className="h-2 w-[36%]" />
              </div>
              <Skeleton className="h-5 w-14 rounded" />
            </div>
          </SectionCard>
        </aside>
      </div>
    </SkeletonRegion>
  );
}
