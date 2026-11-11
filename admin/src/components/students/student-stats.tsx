import { cn } from "@/lib/utils";

import { AnimatedNumber } from "./animated-number";
import styles from "./students.module.css";

export interface StudentStat {
  label: string;
  value: number;
  detail: string;
  /** Blue = growing / healthy, gold = needs attention. */
  tone: "blue" | "gold";
  /** Sparkline points (any scale). Omitted when there's no history to plot. */
  trend?: readonly number[];
}

const SPARK_W = 78;
const SPARK_H = 30;

/** Small trend line; draws itself in once. */
function Sparkline({ points, tone, index }: { points: readonly number[]; tone: StudentStat["tone"]; index: number }) {
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
      className={cn(
        "h-7.5 w-16 shrink-0 overflow-visible transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/stat:scale-x-[1.04] min-[90rem]:w-19.5",
        tone === "blue" ? "text-brand-blue dark:text-[#5b8fd6]" : "text-brand-gold",
      )}
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
        style={{ animationDelay: `${180 + index * 90}ms` }}
      />
    </svg>
  );
}

/** Cell dividers: 1 column → 2 columns (sm) → one row of 4 (xl), as in the reference. */
const CELL_BORDERS = [
  "border-b sm:border-r xl:border-b-0",
  "border-b xl:border-b-0 xl:border-r",
  "border-b sm:border-b-0 sm:border-r",
  "xl:border-r",
];

/** Four term statistics with sparklines; numbers count up on first paint. */
export function StudentStats({ stats }: { stats: readonly StudentStat[] }) {
  return (
    <section aria-label="Enrollment summary" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat, index) => (
        <div
          key={stat.label}
          className={cn(
            "group/stat flex min-w-0 items-center justify-between gap-3 border-border py-5 pr-5.5 pl-6 transition-colors duration-300 hover:bg-muted/40 dark:hover:bg-white/2.5",
            styles.statIn,
            CELL_BORDERS[index],
          )}
          style={{ animationDelay: `${index * 60}ms` }}
        >
          <div className="min-w-0">
            <p className="truncate text-[0.8125rem] leading-4.5 text-muted-foreground">{stat.label}</p>
            <p className="mt-2 font-mono text-[1.625rem] leading-8 font-medium tracking-[-0.02em] text-foreground tabular-nums">
              <AnimatedNumber value={stat.value} from={0} duration={900} delay={index * 60} />
            </p>
            <p
              className={cn(
                "mt-1.5 truncate font-mono text-[0.65625rem] leading-4",
                stat.tone === "blue" ? "text-brand-blue dark:text-[#7aa7e6]" : "text-foreground/85",
              )}
            >
              {stat.detail}
            </p>
          </div>
          {stat.trend && stat.trend.length > 1 ? (
            <div className="mb-0.5 self-end">
              <Sparkline points={stat.trend} tone={stat.tone} index={index} />
            </div>
          ) : null}
        </div>
      ))}
    </section>
  );
}
