"use client";

import { useState, type CSSProperties } from "react";

import { CareerBadge, careerStyle } from "@/components/elections/create/create-election-ui";
import { cardClassName } from "@/components/shared/section-card";
import { percent, type CareerTurnout } from "@/lib/election-live";
import { count } from "@/lib/election-manage";
import { levelLabel } from "@/lib/elections";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*                                 View switch                                */
/* -------------------------------------------------------------------------- */

export const TURNOUT_VIEWS = ["line", "bar", "donut"] as const;
export type TurnoutView = (typeof TURNOUT_VIEWS)[number];

/** LINE · BAR · DONUT segmented switch. */
export function TurnoutViewSwitch({ value, onChange }: { value: TurnoutView; onChange: (view: TurnoutView) => void }) {
  return (
    <div role="radiogroup" aria-label="Chart" className="inline-flex rounded-md bg-[#f4f6fa] p-0.5 dark:bg-white/6">
      {TURNOUT_VIEWS.map((view) => (
        <button
          key={view}
          type="button"
          role="radio"
          aria-checked={value === view}
          onClick={() => onChange(view)}
          className={cn(
            "h-6.5 min-w-16 cursor-pointer rounded-[0.3125rem] px-3 font-mono text-[0.65625rem] tracking-[0.16em] uppercase outline-none transition-[background-color,color] duration-200 focus-visible:ring-2 focus-visible:ring-brand-blue/30",
            value === view ? "bg-brand-navy text-white dark:bg-white dark:text-brand-navy" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {view}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    Donut                                   */
/* -------------------------------------------------------------------------- */

/** Categorical slots (validated light + dark; see the dataviz reference palette). */
const SLOTS = 5;
const sliceVars = cn(
  "[--slice-1:#2a78d6] [--slice-2:#eb6834] [--slice-3:#1baf7a] [--slice-4:#eda100] [--slice-5:#e87ba4] [--slice-other:#94a3b8] [--slice-rest:#eef1f5]",
  "dark:[--slice-1:#3987e5] dark:[--slice-2:#d95926] dark:[--slice-3:#199e70] dark:[--slice-4:#c98500] dark:[--slice-5:#d55181] dark:[--slice-other:#64748b] dark:[--slice-rest:rgb(255_255_255/0.08)]",
);

interface Slice {
  key: string;
  label: string;
  /** Voters who voted (the slice). */
  voted: number;
  /** Voters in the group (for the turnout figure). */
  total: number;
  color: string;
}

/** Programs (or year levels when the career has none), largest first; past 5 they fold into "Other". */
function slicesOf(group: CareerTurnout): Slice[] {
  const parts = group.programs.length
    ? [...group.programs].sort((a, b) => b.voted - a.voted || a.label.localeCompare(b.label)).map((p) => ({ key: p.key, label: p.label, voted: p.voted, total: p.total }))
    : group.levels.map((l) => ({ key: String(l.level), label: levelLabel(l.level, group.career), voted: l.voted, total: l.total }));
  const shown = parts.length > SLOTS ? parts.slice(0, SLOTS - 1) : parts;
  const rest = parts.slice(shown.length);
  const slices: Slice[] = shown.map((p, i) => ({ ...p, color: `var(--slice-${i + 1})` }));
  if (rest.length) {
    slices.push({
      key: "other",
      label: `Other (${rest.length})`,
      voted: rest.reduce((n, p) => n + p.voted, 0),
      total: rest.reduce((n, p) => n + p.total, 0),
      color: "var(--slice-other)",
    });
  }
  return slices;
}

const SIZE = 168;
const R = SIZE / 2;
/** Inner radius as a share of the outer one. */
const HOLE = 0.6;

function arcPath(start: number, end: number) {
  const sweep = Math.min(end - start, Math.PI * 2 - 0.0001);
  const r0 = R * HOLE;
  const point = (r: number, a: number) => `${(R + r * Math.sin(a)).toFixed(2)} ${(R - r * Math.cos(a)).toFixed(2)}`;
  const large = sweep > Math.PI ? 1 : 0;
  const e = start + sweep;
  return `M ${point(R, start)} A ${R} ${R} 0 ${large} 1 ${point(R, e)} L ${point(r0, e)} A ${r0} ${r0} 0 ${large} 0 ${point(r0, start)} Z`;
}

function CareerDonut({ group, color }: { group: CareerTurnout; color: string }) {
  const [active, setActive] = useState<string | null>(null);
  const slices = slicesOf(group);
  const notVoted = group.total - group.voted;
  const rings = [...slices.filter((s) => s.voted > 0), ...(notVoted > 0 ? [{ key: "rest", label: "Not voted yet", voted: notVoted, total: notVoted, color: "var(--slice-rest)" }] : [])];
  const whole = Math.max(1, group.total);
  let angle = 0;
  const arcs = rings.map((s) => {
    const start = angle;
    angle += (s.voted / whole) * Math.PI * 2;
    return { ...s, start, end: angle };
  });
  const focus = active ? rings.find((s) => s.key === active) : undefined;
  const byWhat = group.programs.length ? "program" : "year level";

  return (
    <div style={careerStyle(color)} className={cn(cardClassName, sliceVars, "overflow-hidden")}>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-[#e2e8f0] px-4.5 py-3 dark:border-border">
        <CareerBadge code={group.career.code} />
        <p className="text-[0.875rem] font-semibold text-foreground">{group.career.name}</p>
        <span className="flex-1" />
        <p className="text-[0.75rem] text-muted-foreground tabular-nums">
          {count(group.voted)} / {count(group.total)} voted
        </p>
      </div>
      <div className="flex flex-col items-center gap-5 px-4.5 py-4.5 sm:flex-row sm:items-center sm:gap-7">
        <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`${group.career.name}: ${percent(group.total ? group.voted / group.total : 0)} turnout, votes by ${byWhat}`}>
            {arcs.map((a) => (
              <path
                key={a.key}
                d={arcPath(a.start, a.end)}
                fill={a.color}
                strokeWidth={2}
                className={cn("stroke-card transition-opacity duration-200", active && active !== a.key && "opacity-35")}
                onPointerEnter={() => setActive(a.key)}
                onPointerLeave={() => setActive(null)}
              >
                <title>{`${a.label}: ${count(a.voted)}`}</title>
              </path>
            ))}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            {focus ? (
              <>
                <p className="text-[1.25rem] leading-6 font-medium text-foreground tabular-nums">{count(focus.voted)}</p>
                <p className="max-w-20 truncate text-[0.65625rem] text-muted-foreground">{focus.label}</p>
              </>
            ) : (
              <>
                <p className="text-[1.375rem] leading-7 font-medium tracking-[-0.02em] text-foreground tabular-nums">{percent(group.total ? group.voted / group.total : 0)}</p>
                <p className="text-[0.65625rem] text-muted-foreground">turnout</p>
              </>
            )}
          </div>
        </div>

        <div className="w-full min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-2 text-[0.625rem] font-medium tracking-[0.04em] text-muted-foreground uppercase">
            <span className="flex-1">Votes by {byWhat}</span>
            <span className="w-20 text-right">Voted</span>
            <span className="w-12 text-right">Turnout</span>
          </div>
          <ul className="divide-y divide-[#eef1f5] dark:divide-border">
            {[...slices, ...(notVoted > 0 ? [{ key: "rest", label: "Not voted yet", voted: notVoted, total: 0, color: "var(--slice-rest)" }] : [])].map((s) => (
              <li
                key={s.key}
                onPointerEnter={() => setActive(s.key)}
                onPointerLeave={() => setActive(null)}
                className={cn("flex items-center gap-2 py-1.5 text-[0.75rem] transition-opacity duration-200", active && active !== s.key && "opacity-45")}
              >
                <span aria-hidden className={cn("size-2.5 shrink-0 rounded-[3px]", s.key === "rest" && "ring-1 ring-[#cbd2db] ring-inset dark:ring-white/15")} style={{ backgroundColor: s.color } as CSSProperties} />
                <span className="min-w-0 flex-1 truncate text-foreground">{s.label}</span>
                <span className="w-20 text-right text-muted-foreground tabular-nums">{s.key === "rest" ? count(s.voted) : `${count(s.voted)} / ${count(s.total)}`}</span>
                <span className="w-12 text-right font-semibold text-foreground tabular-nums">{s.key === "rest" ? "" : percent(s.total ? s.voted / s.total : 0)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** One donut per career: that career's voters, split into who voted (by program or year level) and who hasn't. */
export function TurnoutDonuts({ careers, colors }: { careers: CareerTurnout[]; colors: ReadonlyMap<string, string> }) {
  return (
    <div className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
      {careers.map((group) => (
        <CareerDonut key={group.career.code} group={group} color={colors.get(group.career.code) ?? "#0f4c9e"} />
      ))}
    </div>
  );
}
