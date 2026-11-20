import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

import { SkeletonFade, SkeletonRegion } from "./skeleton-region";
import styles from "./skeleton.module.css";

export { SkeletonFade, SkeletonRegion };

/*
 * Skeleton building blocks. Page skeletons mirror their page's real layout
 * (same paddings, grids, row heights and column widths) so nothing jumps when
 * the data arrives: static chrome (table headers, toolbar labels, card titles)
 * renders as-is, and only the data is replaced by bones.
 */

/** Delay of the shimmer sweep for row `index`, so it rolls down the page as one wave. */
export function skeletonDelay(index: number, step = 70): CSSProperties {
  return { "--skeleton-delay": `${index * step}ms` } as CSSProperties;
}

/** Picks a width from `widths` for row `index`, so rows look like varied real data. */
export function pickWidth(widths: readonly string[], index: number): string {
  return widths[index % widths.length];
}

interface SkeletonProps {
  /** Size and shape; bones are pill-shaped unless a `rounded-*` class says otherwise. */
  className?: string;
  style?: CSSProperties;
}

/** One placeholder shape with the shimmer sweep. */
export function Skeleton({ className, style }: SkeletonProps) {
  return <span aria-hidden className={cn(styles.bone, "relative block shrink-0 rounded-full", className)} style={style} />;
}

/**
 * A line of text: a bone vertically centred in a box of the text's line height,
 * so a block of these takes exactly the height the real text will.
 */
export function SkeletonLine({ className, lineClassName, style }: SkeletonProps & { lineClassName?: string }) {
  return (
    <span aria-hidden className={cn("flex h-4 items-center", lineClassName)} style={style}>
      <Skeleton className={cn("h-2.5", className)} />
    </span>
  );
}

/** The table / list checkbox, as a soft square. */
export function SkeletonCheckbox({ className }: { className?: string }) {
  return <Skeleton className={cn("size-4 rounded-[4px]", className)} />;
}

/** An empty, outlined input or select (height from `className`). */
export function SkeletonField({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <span aria-hidden className={cn("flex h-10 w-full items-center rounded-md border border-border bg-background px-3", className)}>
      {children}
    </span>
  );
}

const SPARK_PATHS = {
  up: "M1 27 L9 25.5 L17 26 L25 22 L33 21 L41 17.5 L49 18 L57 12.5 L65 10 L77 4",
  down: "M1 6 L9 7.5 L17 7 L25 11 L33 12 L41 15.5 L49 15 L57 20 L65 22.5 L77 26",
} as const;

/** Faint trend line with a glint that travels along it (stat cards). */
export function SkeletonSparkline({ trend, tone, className }: { trend: keyof typeof SPARK_PATHS; tone: "blue" | "gold"; className?: string }) {
  const d = SPARK_PATHS[trend];
  return (
    <svg
      aria-hidden
      viewBox="0 0 78 30"
      preserveAspectRatio="none"
      className={cn(
        "h-7.5 w-16 shrink-0 overflow-visible min-[90rem]:w-19.5",
        tone === "blue" ? "text-brand-blue dark:text-[#5b8fd6]" : "text-brand-gold",
        className,
      )}
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.4} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" className={styles.sparkBase} />
      <path
        d={d}
        pathLength={1}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={styles.sparkGlint}
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Shared pieces                               */
/* -------------------------------------------------------------------------- */

/** Mono uppercase table header row, as on every list page. */
export const skeletonHeadRowClassName = "h-10.5 font-mono text-[0.65625rem] tracking-[0.08em] text-muted-foreground uppercase";

/** Text tabs with the first one active, as UnderlineTabs renders them (`bones` adds placeholder tabs). */
export function SkeletonUnderlineTabs({
  labels = [],
  bones = 0,
  className,
  listClassName,
}: {
  labels?: readonly string[];
  bones?: number;
  className?: string;
  listClassName?: string;
}) {
  return (
    <div className={cn("border-b border-border", className)}>
      <div className={cn("relative flex gap-7 overflow-hidden", listClassName)}>
        {labels.map((label, index) => (
          <span
            key={label}
            className={cn(
              "relative -mb-px shrink-0 px-1 pt-1 pb-3 text-[0.875rem] whitespace-nowrap",
              index === 0 ? "font-medium text-brand-blue dark:text-[#7aa7e6]" : "text-muted-foreground",
            )}
          >
            {label}
            {index === 0 ? <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-brand-blue dark:bg-[#7aa7e6]" /> : null}
          </span>
        ))}
        {Array.from({ length: bones }, (_, index) => (
          <span key={index} className="flex shrink-0 items-center px-1 pt-1 pb-3">
            <SkeletonLine lineClassName="h-5" className={cn("h-3", pickWidth(["w-24", "w-30", "w-20", "w-28"], index))} style={skeletonDelay(index, 50)} />
          </span>
        ))}
      </div>
    </div>
  );
}

/** Generic page placeholder: a toolbar and a list. Used where the page isn't known yet. */
export function PageSkeleton({ label = "Loading the page…", className }: { label?: string; className?: string }) {
  return (
    <SkeletonRegion label={label} className={cn("w-full px-4 pt-4 pb-16 sm:px-6 lg:px-8", className)}>
      <div className="flex flex-wrap items-center gap-2.5">
        <Skeleton className="h-8.5 w-full rounded-md sm:w-60" />
        <Skeleton className="h-8.5 w-24 rounded-md" />
        <Skeleton className="ml-auto hidden h-8.5 w-32 rounded-md sm:block" />
      </div>
      <div className="mt-5 border-t border-border">
        <div className="flex h-10.5 items-center gap-6 border-b border-border pl-2">
          <SkeletonCheckbox />
          <Skeleton className="h-2 w-16" />
          <Skeleton className="ml-auto h-2 w-14" />
          <Skeleton className="mr-6 hidden h-2 w-12 sm:block" />
        </div>
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="flex h-14.5 items-center gap-2.5 border-b border-border pl-2" style={skeletonDelay(index)}>
            <SkeletonCheckbox className="mr-2.5" />
            <Skeleton className="size-7" />
            <div className="min-w-0 flex-1">
              <SkeletonLine lineClassName="h-4.5" className={pickWidth(["w-36", "w-44", "w-32", "w-40", "w-48", "w-34", "w-42"], index)} />
              <SkeletonLine className={cn("h-2", pickWidth(["w-48", "w-40", "w-52", "w-36", "w-44", "w-50", "w-38"], index))} />
            </div>
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="mr-6 ml-6 hidden h-4.75 w-18 sm:block" />
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}
