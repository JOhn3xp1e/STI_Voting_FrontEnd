import { cn } from "@/lib/utils";

import styles from "./students.module.css";

export interface StudentStat {
  label: string;
  value: string;
  detail: string;
  /** Blue = good trend, gold = needs attention. */
  tone: "blue" | "gold";
  /** Sparkline points (any scale). */
  trend: readonly number[];
}

const SPARK_W = 78;
const SPARK_H = 34;

/** Small trend line; draws itself in once. */
function Sparkline({ points, tone }: { points: readonly number[]; tone: StudentStat["tone"] }) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * (SPARK_W - 2) + 1;
      const y = SPARK_H - 2 - ((p - min) / span) * (SPARK_H - 4);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      preserveAspectRatio="none"
      className={cn("h-8.5 w-16 shrink-0 overflow-visible min-[90rem]:w-19.5", tone === "blue" ? "text-brand-blue dark:text-[#5b8fd6]" : "text-brand-gold")}
    >
      <path
        d={d}
        pathLength={1}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={styles.spark}
      />
    </svg>
  );
}

const CELL_BORDERS = [
  "",
  "border-t sm:border-t-0 sm:border-l sm:pl-6",
  "border-t min-[85rem]:border-t-0 min-[85rem]:border-l min-[85rem]:pl-6",
  "border-t sm:border-l sm:pl-6 min-[85rem]:border-t-0",
];

/** Four compact term statistics with sparklines, separated by hairlines. */
export function StudentStats({ stats }: { stats: readonly StudentStat[] }) {
  return (
    <section aria-label="Enrollment summary" className="grid grid-cols-1 border-b border-border sm:grid-cols-2 min-[85rem]:flex">
      {stats.map((stat, index) => (
        <div
          key={stat.label}
          className={cn(
            // From 85rem: one row with equal content widths (padding added on top), as in the reference.
            "group/stat flex min-w-0 items-center justify-between gap-3 border-border py-4.25 pr-3 pl-1 transition-colors duration-200 hover:bg-muted/45 min-[85rem]:box-content min-[85rem]:flex-1 min-[85rem]:basis-0 min-[85rem]:pr-5.5 dark:hover:bg-white/3",
            CELL_BORDERS[index],
          )}
        >
          <div className="min-w-0">
            <p className="truncate text-[0.8125rem] leading-4.5 text-muted-foreground">{stat.label}</p>
            <p className="mt-1 text-[1.625rem] leading-8 font-semibold tracking-tight text-foreground tabular-nums">
              {stat.value}
            </p>
            <p
              className={cn(
                "mt-1 truncate font-mono text-[0.6875rem] leading-4",
                stat.tone === "blue" ? "text-brand-blue dark:text-[#7aa7e6]" : "text-foreground",
              )}
            >
              {stat.detail}
            </p>
          </div>
          <div className="mb-0.5 self-end">
            <Sparkline points={stat.trend} tone={stat.tone} />
          </div>
        </div>
      ))}
    </section>
  );
}
