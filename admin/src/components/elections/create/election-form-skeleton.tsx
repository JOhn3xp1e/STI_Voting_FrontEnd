import { SectionCard, cardClassName } from "@/components/shared/section-card";
import { Skeleton, SkeletonField, SkeletonLine, SkeletonRegion, skeletonDelay } from "@/components/shared/skeleton";
import { cn } from "@/lib/utils";

const STEP_LABELS = ["w-12", "w-20", "w-10", "w-12"];

function FieldSkeleton({ label, className, fieldClassName }: { label: string; className?: string; fieldClassName?: string }) {
  return (
    <div className={className}>
      <SkeletonLine lineClassName="mb-1.5 h-4" className={cn("h-2.5", label)} />
      <SkeletonField className={fieldClassName} />
    </div>
  );
}

/** Election wizard placeholder (create and edit): stepper, Banner + Details cards and the summary panel. */
export function ElectionFormSkeleton({ label }: { label: string }) {
  return (
    <SkeletonRegion label={label} className="px-4 pb-16 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_23.75rem]">
        <div className="min-w-0">
          {/* Stepper */}
          <div className="flex flex-wrap items-center gap-y-2">
            {STEP_LABELS.map((width, index) => (
              <div key={index} className="flex items-center" style={skeletonDelay(index, 50)}>
                {index > 0 ? <span className="mx-2.5 h-px w-7 bg-[#e2e8f0] dark:bg-border" /> : null}
                <span className="flex h-6 items-center gap-2.5 pr-1">
                  <Skeleton className="size-5" />
                  <Skeleton className={cn("h-2.5", width)} />
                </span>
              </div>
            ))}
          </div>

          <div className="mt-5 space-y-5">
            <SectionCard title="Banner" aside="shown on voter home and election cards" bodyClassName="p-5">
              <div style={skeletonDelay(0)}>
                <Skeleton className="h-37.5 w-full rounded-[0.375rem]" />
              </div>
            </SectionCard>

            <SectionCard title="Details" aside="step 1 of 4">
              <div className="grid grid-cols-1 gap-x-3 gap-y-3.5 sm:grid-cols-2" style={skeletonDelay(2)}>
                <FieldSkeleton label="w-10" />
                <FieldSkeleton label="w-16" />
                <FieldSkeleton label="w-20" className="sm:col-span-2" fieldClassName="h-26.5" />
                <FieldSkeleton label="w-10" className="sm:col-span-2" />
                <FieldSkeleton label="w-20" />
                <FieldSkeleton label="w-20" />
              </div>
            </SectionCard>
          </div>
        </div>

        {/* Summary */}
        <aside className="xl:sticky xl:top-6">
          <section className={cn(cardClassName, "shadow-[0_18px_40px_-30px_rgb(15_23_42/0.35)]")} style={skeletonDelay(1)}>
            <header className="flex h-13.75 items-center justify-between gap-3 border-b border-[#e2e8f0] px-5 dark:border-border">
              <h2 className="font-mono text-[0.6875rem] font-semibold tracking-[0.16em] text-foreground uppercase">Summary</h2>
              <Skeleton className="h-5.5 w-14 rounded-[0.1875rem]" />
            </header>
            <div className="px-5 pt-4.5 pb-5">
              <div className="relative flex h-27.5 flex-col justify-end overflow-hidden rounded-[0.25rem] px-3.5 pb-4">
                <Skeleton className="absolute inset-0 rounded-[0.25rem]" />
                <Skeleton className="relative h-2 w-16" />
                <Skeleton className="relative mt-2.5 h-4 w-[58%]" />
              </div>
              <div className="mt-2">
                {["w-10", "w-24", "w-26"].map((width, index) => (
                  <div key={index} className="flex min-h-7.25 items-center justify-between gap-4">
                    <Skeleton className={cn("h-2.5", width)} />
                    <Skeleton className={cn("h-2", index === 1 ? "w-28" : "w-14")} />
                  </div>
                ))}
              </div>
              <div className="mt-3 space-y-2 border-t border-[#e2e8f0] pt-3.5 dark:border-border">
                <Skeleton className="h-2.5 w-20" />
                <Skeleton className="h-1.5 w-full" />
                <Skeleton className="h-1.5 w-[80%]" />
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2.5">
                <Skeleton className="h-10 rounded-md" />
                <Skeleton className="h-10 rounded-md" />
              </div>
            </div>
          </section>
        </aside>
      </div>
    </SkeletonRegion>
  );
}
