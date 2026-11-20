import { ChevronDown, Plus, Search } from "lucide-react";

import { Skeleton, SkeletonCheckbox, SkeletonLine, SkeletonRegion, pickWidth, skeletonDelay } from "@/components/shared/skeleton";
import { Caret } from "@/components/students/option-menu";
import { primaryButtonClassName, toolbarButtonClassName } from "@/components/students/student-toolbar-styles";
import { cn } from "@/lib/utils";

/** Same columns as the ballot list (list mode). */
const listGridClassName =
  "grid-cols-[2.375rem_minmax(0,1fr)_3rem] sm:grid-cols-[2.375rem_minmax(0,1fr)_9rem_5.5rem_3rem] xl:grid-cols-[2.375rem_minmax(0,1fr)_8.5rem_10rem_4.75rem_8rem_5.5rem_3.5rem]";

const GROUPS = [
  { title: "w-20", candidates: 3 },
  { title: "w-28", candidates: 2 },
  { title: "w-24", candidates: 2 },
];

/** Wave position of each group header (headers and candidate rows share one sequence). */
const GROUP_OFFSETS = GROUPS.map((_, i) => GROUPS.slice(0, i).reduce((n, g) => n + 1 + g.candidates, 0));

const NAME_WIDTHS = ["w-[52%]", "w-[40%]", "w-[60%]", "w-[46%]", "w-[56%]", "w-[44%]", "w-[50%]"];

function CandidateRowSkeleton({ index }: { index: number }) {
  return (
    <li className={cn("grid h-14 items-center border-b border-border", listGridClassName)} style={skeletonDelay(index)}>
      <span className="flex justify-center">
        <SkeletonCheckbox />
      </span>
      <div className="relative flex min-w-0 items-center gap-2.5 pl-6">
        <span className="absolute top-0 left-2 h-1/2 w-3 rounded-bl-[3px] border-b border-l border-border" />
        <Skeleton className="size-7" />
        <div className="min-w-0 flex-1">
          <SkeletonLine lineClassName="h-4.5" className={pickWidth(NAME_WIDTHS, index)} />
          <SkeletonLine className="h-2 w-24" />
        </div>
      </div>
      <span className="hidden pr-3 xl:block">
        <Skeleton className="h-5.5 w-12 rounded-md" />
      </span>
      <span className="hidden pr-3 xl:block">
        <Skeleton className={cn("h-2.5", index % 2 ? "w-[58%]" : "w-[70%]")} />
      </span>
      <span className="hidden pr-3 xl:block">
        <Skeleton className="h-2.5 w-[60%]" />
      </span>
      <span className="hidden min-w-0 items-center gap-2 pr-3 sm:flex">
        <Skeleton className="size-2" />
        <Skeleton className={cn("h-2.5", index % 3 ? "w-[62%]" : "w-[48%]")} />
      </span>
      <span className="hidden sm:block">
        <Skeleton className="size-5" /> 
      </span>
      <span className="flex justify-center">
        <Skeleton className="size-4 rounded-sm" />
      </span>
    </li>
  );
}

/** Ballot placeholder: toolbar, the column header and a few positions with their candidates. */
export function BallotSkeleton() {
  return (
    <SkeletonRegion label="Loading the ballot…" className="px-4 pb-24 sm:px-6 lg:px-8">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
          <div className="relative min-w-0 flex-1 sm:w-60 sm:flex-none">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.25 size-4 -translate-y-1/2 text-muted-foreground" />
            <span className="flex h-8.5 w-full items-center rounded-md border border-border bg-background pl-8.75 text-[0.875rem] text-muted-foreground">
              Search candidates
            </span>
          </div>
          <span className={cn(toolbarButtonClassName, "gap-1")}>
            All positions
            <Caret />
          </span>
          <span className={cn(toolbarButtonClassName, "gap-1")}>
            All party lists
            <Caret />
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <span className="flex items-center gap-2.5 text-[0.84375rem] text-foreground/85">
            Show photos
            <span className="relative h-5.5 w-9.5 shrink-0 rounded-full bg-[#d5dbe3] dark:bg-white/15">
              <span className="absolute top-0.75 left-0.75 size-4 rounded-full bg-white shadow-sm" />
            </span>
          </span>
          <span className={cn(primaryButtonClassName, "gap-1.5")}>
            <Plus aria-hidden className="size-4" strokeWidth={2.2} />
            Create position
          </span>
        </div>
      </div>

      {/* Positions */}
      <div className="border-t border-border">
        <div className={cn("grid h-10.5 items-center border-b border-border font-mono text-[0.65625rem] tracking-[0.08em] text-muted-foreground uppercase", listGridClassName)}>
          <span />
          <span>Position / candidate</span>
          <span className="hidden xl:block">Career</span>
          <span className="hidden xl:block">Program</span>
          <span className="hidden xl:block">Level</span>
          <span className="hidden sm:block">Party list</span>
          <span className="hidden sm:block">Photo</span>
        </div>

        {GROUPS.map((group, groupIndex) => {
          const headerRow = GROUP_OFFSETS[groupIndex];
          return (
            <section key={groupIndex}>
              <div className="flex h-9.5 items-center border-b border-border bg-muted/45 pr-2 dark:bg-white/3" style={skeletonDelay(headerRow)}>
                <span className="flex w-9.5 shrink-0 justify-center">
                  <SkeletonCheckbox />
                </span>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground/60" />
                  <Skeleton className={cn("h-3", group.title)} />
                  <Skeleton className="h-2 w-24" />
                </div>
                <span className="flex size-6.5 items-center justify-center rounded-md border border-border bg-background">
                  <Plus aria-hidden className="size-3.5 text-muted-foreground/60" strokeWidth={2} />
                </span>
              </div>
              <ul>
                {Array.from({ length: group.candidates }, (_, candidateIndex) => {
                  const index = headerRow + 1 + candidateIndex;
                  return <CandidateRowSkeleton key={index} index={index} />;
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </SkeletonRegion>
  );
}
