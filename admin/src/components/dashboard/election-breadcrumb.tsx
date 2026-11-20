"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu } from "@base-ui/react/menu";
import { CalendarDays, Check, ChevronsUpDown, SquareCheck } from "lucide-react";

import { Skeleton } from "@/components/shared/skeleton";
import { electionPageHref, type ElectionRoute } from "@/config/navigation";
import { cn } from "@/lib/utils";
import type { Election, ElectionStatus } from "@/types/election.types";

import { menuItemClassName, popupClassName } from "./popup-styles";
import type { PageCrumb } from "./page-description";

/** Header pill per election status ("LIVE" while voting is open). */
const STATUS_PILL: Record<ElectionStatus, { label: string; className: string }> = {
  Ongoing: { label: "Live", className: "border-brand-navy/80 text-brand-navy dark:border-brand-gold/70 dark:text-brand-gold" },
  Upcoming: { label: "Upcoming", className: "border-brand-blue/50 text-brand-blue dark:border-[#7aa7e6]/60 dark:text-[#7aa7e6]" },
  Draft: { label: "Draft", className: "border-border text-muted-foreground" },
  Completed: { label: "Completed", className: "border-[#22c55e]/60 text-[#15803d] dark:text-[#4ade80]" },
  Cancelled: { label: "Cancelled", className: "border-destructive/50 text-destructive" },
};

/** Status square in the switcher, matching the sidebar's election groups. */
const STATUS_DOT: Record<ElectionStatus, string> = {
  Ongoing: "bg-brand-gold",
  Upcoming: "bg-brand-blue dark:bg-[#7aa7e6]",
  Draft: "bg-[#cbd5e1] dark:bg-white/25",
  Completed: "bg-[#22c55e]",
  Cancelled: "bg-destructive/70",
};

const crumbTextClassName = "text-xl leading-tight tracking-tight sm:text-2xl";
const mutedCrumbClassName = cn(
  crumbTextClassName,
  "font-normal text-brand-muted transition-colors duration-200 hover:text-brand-navy dark:text-shell-item dark:hover:text-brand-white",
);

/** One crumb: a "/" before it (except the first) and a soft entrance, staggered by `index`. */
function Crumb({ index, separatorClassName, className, children }: { index: number; separatorClassName?: string; className?: string; children: ReactNode }) {
  return (
    <li
      className={cn("flex min-w-0 items-center gap-2.5 animate-in fade-in-0 slide-in-from-left-1 duration-300 fill-mode-both motion-reduce:animate-none", className)}
      style={{ animationDelay: `${index * 45}ms` } as CSSProperties}
    >
      {index > 0 ? (
        <span aria-hidden className={cn("shrink-0 text-xl font-light text-[#cbd5e1] sm:text-2xl dark:text-white/20", separatorClassName)}>
          /
        </span>
      ) : null}
      {children}
    </li>
  );
}

interface ElectionBreadcrumbProps {
  route: ElectionRoute;
  elections: readonly Election[];
  /** The elections list has loaded (until then the election's name is a placeholder). */
  loaded: boolean;
  /** What the page named its last crumb (e.g. the party list being edited). */
  tail: PageCrumb | null;
}

/**
 * "Elections / CSC Elections 2025–2026 LIVE ⇕ / Party lists / Partyngina PL-00001".
 * Earlier crumbs fold away on narrow screens; the last one always stays.
 */
export function ElectionBreadcrumb({ route, elections, loaded, tail }: ElectionBreadcrumbProps) {
  const election = elections.find((e) => e.id === route.electionId);
  const pageHref = electionPageHref(route.electionId, route.page);
  const nested = route.sub !== null;
  const tailLabel = tail?.label ?? (route.sub === "new" ? "New party list" : (route.sub ?? route.pageTitle));

  return (
    <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
      <ol className="flex min-w-0 items-center gap-2.5">
        <Crumb index={0} className="hidden shrink-0 lg:flex">
          <Link href="/elections" className={cn(mutedCrumbClassName, "flex items-center gap-2.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30")}>
            <SquareCheck aria-hidden className="size-5 shrink-0" strokeWidth={1.75} />
            Elections
          </Link>
        </Crumb>

        <Crumb index={1} separatorClassName="hidden lg:inline" className="hidden sm:flex">
          <span className="flex min-w-0 items-center gap-2.5">
            <CalendarDays aria-hidden className="size-5 shrink-0 text-brand-muted dark:text-shell-item" strokeWidth={1.75} />
            {election ? (
              <>
                <Link
                  href={electionPageHref(election.id, "manage")}
                  title={election.title}
                  className={cn(mutedCrumbClassName, "min-w-0 truncate rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30")}
                >
                  {election.title}
                </Link>
                <span
                  className={cn(
                    "inline-flex h-5 shrink-0 items-center rounded-full border px-2 font-mono text-[0.625rem] leading-none font-semibold tracking-[0.12em] uppercase",
                    STATUS_PILL[election.status].className,
                  )}
                >
                  {STATUS_PILL[election.status].label}
                </span>
              </>
            ) : loaded ? (
              <span className={cn(mutedCrumbClassName, "truncate font-mono text-lg sm:text-xl")}>{route.electionId}</span>
            ) : (
              <Skeleton className="h-5 w-52 rounded-md" />
            )}
            <ElectionSwitcher current={route.electionId} elections={elections} route={route} />
          </span>
        </Crumb>

        {nested ? (
          <Crumb index={2} separatorClassName="hidden sm:inline" className="hidden shrink-0 md:flex">
            <Link href={pageHref} className={cn(mutedCrumbClassName, "rounded-sm whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30")}>
              {route.pageTitle}
            </Link>
          </Crumb>
        ) : null}

        <Crumb index={nested ? 3 : 2} separatorClassName={nested ? "hidden md:inline" : "hidden sm:inline"} className="min-w-0 shrink-0">
          <h1 aria-current="page" className="flex min-w-0 items-baseline gap-2">
            <span className={cn(crumbTextClassName, "truncate font-semibold text-brand-navy dark:text-brand-white")}>{tailLabel}</span>
            {tail?.detail ? <span className="shrink-0 font-mono text-[0.75rem] text-brand-muted dark:text-shell-item">{tail.detail}</span> : null}
          </h1>
        </Crumb>
      </ol>
    </nav>
  );
}

/** ⇕ next to the election's name: jump to the same page of another election. */
function ElectionSwitcher({ current, elections, route }: { current: string; elections: readonly Election[]; route: ElectionRoute }) {
  const router = useRouter();
  if (elections.length < 2) return null;

  return (
    <Menu.Root modal={false}>
      <Menu.Trigger
        aria-label="Switch election"
        title="Switch election"
        className={cn(
          "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-brand-muted outline-none dark:text-shell-item",
          "transition-[background-color,color,scale] duration-200 hover:bg-muted hover:text-brand-navy active:scale-95 data-popup-open:bg-muted data-popup-open:text-brand-navy",
          "focus-visible:ring-2 focus-visible:ring-brand-blue/30 dark:hover:text-brand-white dark:data-popup-open:text-brand-white",
        )}
      >
        <ChevronsUpDown aria-hidden className="size-4" strokeWidth={1.75} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="start" sideOffset={8} className="z-50 outline-none">
          <Menu.Popup data-themed className={cn(popupClassName, "max-h-80 w-72 overflow-y-auto p-1.5")}>
            <p className="px-2.5 pt-1 pb-1.5 font-mono text-[0.625rem] tracking-[0.12em] text-muted-foreground uppercase">Switch election</p>
            {elections.map((election) => {
              const active = election.id === current;
              return (
                <Menu.Item
                  key={election.id}
                  onClick={() => {
                    if (!active) router.push(electionPageHref(election.id, route.page));
                  }}
                  className={cn(menuItemClassName, "relative h-auto gap-2.5 py-2 pr-8")}
                >
                  <span aria-hidden className={cn("size-2 shrink-0 rounded-[2px]", STATUS_DOT[election.status])} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{election.title}</span>
                    <span className="block font-mono text-[0.65625rem] text-muted-foreground">
                      {election.id} · {STATUS_PILL[election.status].label}
                    </span>
                  </span>
                  {active ? <Check aria-hidden className="absolute right-2.5" /> : null}
                </Menu.Item>
              );
            })}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
