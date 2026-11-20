import { CalendarDays, Users } from "lucide-react";

import { Skeleton, SkeletonLine, SkeletonRegion, pickWidth, skeletonDelay } from "@/components/shared/skeleton";
import { cn } from "@/lib/utils";

const TITLE_WIDTHS = ["w-[72%]", "w-[58%]", "w-[66%]", "w-[52%]", "w-[78%]", "w-[62%]"];

/** One election card: banner, title, meta, dates / scope and the turnout footer. */
function ElectionCardSkeleton({ index }: { index: number }) {
  return (
    <article
      className="flex h-full flex-col overflow-hidden rounded-[0.375rem] border border-[#e2e8f0] bg-card shadow-[0_1px_2px_rgb(15_23_42/0.04)] dark:border-border"
      style={skeletonDelay(index, 110)}
    >
      <div className="relative h-35">
        <Skeleton className="absolute inset-0 rounded-none" />
        <Skeleton className="absolute top-3.5 left-3.5 h-5 w-20" />
      </div>

      <div className="flex-1 px-4.5 pt-3.5 pb-4">
        <SkeletonLine lineClassName="h-5.5" className={cn("h-3.5", pickWidth(TITLE_WIDTHS, index))} />
        <div className="mt-1.5 flex items-center gap-2.5">
          <Skeleton className="h-2.5 w-28" />
          <Skeleton className="h-5 w-12 rounded-[0.1875rem]" />
        </div>
        <ul className="mt-3.5 space-y-1 text-muted-foreground/50">
          <li className="flex h-5 items-center gap-2">
            <CalendarDays aria-hidden className="size-3.5 shrink-0" strokeWidth={1.75} />
            <Skeleton className="h-2.5 w-[58%]" />
          </li>
          <li className="flex h-5 items-center gap-2">
            <Users aria-hidden className="size-3.5 shrink-0" strokeWidth={1.75} />
            <Skeleton className={cn("h-2.5", index % 2 ? "w-[46%]" : "w-[52%]")} />
          </li>
        </ul>
      </div>

      <div className="flex items-center gap-4 border-t border-[#e2e8f0] px-4.5 pt-3.5 pb-3.5 dark:border-border">
        <div className="min-w-0 flex-1">
          <div className="flex h-4 items-center justify-between">
            <Skeleton className="h-2 w-12" />
            <Skeleton className="h-2 w-5" />
          </div>
          <Skeleton className="mt-1.5 h-1.5 w-full" />
          <SkeletonLine lineClassName="mt-2" className="h-2 w-36" />
        </div>
        <Skeleton className="size-4 rounded-sm" />
      </div>
    </article>
  );
}

/** Elections grid placeholder (the tabs and toolbar above it stay live). */
export function ElectionsGridSkeleton() {
  return (
    <SkeletonRegion label="Loading elections…">
      <ul className="grid grid-cols-1 gap-x-5 gap-y-5.5 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <li key={index} className={index === 3 ? "hidden md:block" : index > 3 ? "hidden xl:block" : undefined}>
            <ElectionCardSkeleton index={index} />
          </li>
        ))}
      </ul>
    </SkeletonRegion>
  );
}
