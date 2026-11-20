import { PageSkeleton, Skeleton, SkeletonFade, SkeletonLine, skeletonDelay } from "@/components/shared/skeleton";
import { cn } from "@/lib/utils";

const NAV = [
  { label: "w-16", items: ["w-20", "w-16", "w-24"] },
  { label: "w-20", items: ["w-28", "w-24", "w-20"] },
  { label: "w-14", items: ["w-18", "w-22"] },
];

/** Sidebar placeholder: brand, search and a few navigation sections. */
function SidebarSkeleton() {
  return (
    <SkeletonFade className="flex h-full flex-col">
      <div className="flex flex-col gap-4.5 px-4 pt-5.5">
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-7.5 w-7 rounded-md" />
          <div className="min-w-0 flex-1">
            <SkeletonLine lineClassName="h-4.5" className="w-12" />
            <SkeletonLine className="h-2 w-20" />
          </div>
        </div>
        <Skeleton className="h-9 w-full rounded-lg" />
      </div>
      <div className="mt-5 space-y-5 px-4">
        {NAV.map((section, sectionIndex) => (
          <div key={sectionIndex}>
            <SkeletonLine lineClassName="mb-1.5 h-6 px-2.5" className={cn("h-2", section.label)} />
            {section.items.map((width, index) => (
              <div key={index} className="flex h-9 items-center gap-2.5 px-2.5" style={skeletonDelay(sectionIndex * 3 + index, 60)}>
                <Skeleton className="size-4 rounded-[5px]" />
                <Skeleton className={cn("h-2.5", width)} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </SkeletonFade>
  );
}

/**
 * Whole-dashboard placeholder (sidebar, header and a generic page), shown while
 * the admin's session is checked and the shell isn't rendered yet.
 */
export function ShellSkeleton({ label = "Loading the page…" }: { label?: string }) {
  return (
    <div data-themed className="flex min-h-dvh flex-1 bg-background">
      <div className="fixed inset-y-0 left-0 hidden w-64 border-r border-sidebar-border bg-sidebar md:block">
        <SidebarSkeleton />
      </div>
      <div className="flex min-w-0 flex-1 flex-col md:pl-64">
        <SkeletonFade className="px-4 sm:px-6 lg:px-8">
          <div className="flex min-h-16 items-center gap-3 py-3 sm:min-h-20">
            <Skeleton className="size-9 rounded-lg md:hidden" />
            <div className="flex min-w-0 flex-1 flex-col gap-x-3.5 gap-y-2 lg:flex-row lg:items-center">
              <Skeleton className="h-5 w-40 rounded-md sm:h-6" />
              <Skeleton className="h-2.5 w-56 max-w-full" />
            </div>
            <div className="flex shrink-0 items-center gap-2.5 sm:gap-4">
              <Skeleton className="size-9" />
              <Skeleton className="hidden size-9 sm:block" />
              <Skeleton className="size-9" />
            </div>
          </div>
        </SkeletonFade>
        <PageSkeleton label={label} />
      </div>
    </div>
  );
}
