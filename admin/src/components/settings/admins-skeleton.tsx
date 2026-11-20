import { Skeleton, SkeletonLine, SkeletonRegion, pickWidth, skeletonDelay } from "@/components/shared/skeleton";
import { cn } from "@/lib/utils";

import { SettingsCard, rowListClassName } from "./settings-ui";

const NAME_WIDTHS = ["w-[34%]", "w-[42%]", "w-[28%]"];
const EMAIL_WIDTHS = ["w-[48%]", "w-[54%]", "w-[44%]"];

function AdminRowSkeleton({ index }: { index: number }) {
  return (
    <li className="flex items-center gap-3 py-3" style={skeletonDelay(index)}>
      <Skeleton className="size-8" />
      <div className="min-w-0 flex-1">
        <SkeletonLine lineClassName="h-5" className={pickWidth(NAME_WIDTHS, index)} />
        <SkeletonLine className={cn("h-2", pickWidth(EMAIL_WIDTHS, index))} />
      </div>
      <Skeleton className="hidden h-2.5 w-20 md:mr-20 md:block" />
      <Skeleton className="h-5 w-26 rounded" />
      <Skeleton className="h-2.5 w-8" />
    </li>
  );
}

/** Admins settings placeholder (below the tabs): admins, pending invites and the roles card. */
export function AdminsSkeleton() {
  return (
    <SkeletonRegion label="Loading admins…" className="mt-5 grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_17.4375rem] xl:gap-6">
      <div className="flex min-w-0 flex-col gap-5">
        <SettingsCard title="Admins" bodyClassName="px-5 pt-1.5 pb-4">
          <ul className={rowListClassName}>
            {Array.from({ length: 3 }, (_, index) => (
              <AdminRowSkeleton key={index} index={index} />
            ))}
          </ul>
        </SettingsCard>

        <SettingsCard title="Pending invites" bodyClassName="px-5 pt-1.5 pb-4">
          <ul className={rowListClassName}>
            <li className="flex items-center gap-4 py-3" style={skeletonDelay(3)}>
              <div className="min-w-0 flex-1">
                <SkeletonLine lineClassName="h-5" className="w-[46%]" />
                <SkeletonLine className="h-2 w-[30%]" />
              </div>
              <Skeleton className="h-2.5 w-14" />
              <Skeleton className="h-2.5 w-12" />
            </li>
          </ul>
        </SettingsCard>
      </div>

      <SettingsCard title="Roles" meta="who can do what" className="xl:w-66" bodyClassName={cn(rowListClassName, "pt-1.5 pb-4")}>
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="py-3" style={skeletonDelay(index + 1)}>
            <SkeletonLine lineClassName="h-5" className={index === 1 ? "w-24" : "w-20"} />
            <SkeletonLine lineClassName="mt-0.5" className="h-2 w-[92%]" />
            <SkeletonLine className="h-2 w-[64%]" />
          </div>
        ))}
      </SettingsCard>
    </SkeletonRegion>
  );
}
