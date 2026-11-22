"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

import { cardClassName } from "@/components/shared/section-card";
import { enrollmentsByStudent, percent, turnoutTimeline, type TimelineGrouping, type TimelineSeries } from "@/lib/election-live";
import { count, plural } from "@/lib/election-manage";
import { formatDayTime, instantToLocal } from "@/lib/elections";
import { cn } from "@/lib/utils";
import type { VoterRow } from "@/services/voters/voters.service";
import type { Election, VoterEnrollment } from "@/types/election.types";
import type { Career } from "@/types/program.types";

/*
 * Votes over time while voting is open: ballots cast (or turnout) since voting opened, as
 * one line for every voter or one per career, program or level. Built from each voter's
 * `votedAt`, so it covers the whole election, not just the time this page was open.
 */

const HOUR = 60 * 60 * 1000;
const HEIGHT = 260;
const MARGIN = { top: 14, right: 16, bottom: 28, left: 44 };
/** Room for names at the line ends. */
const END_LABELS_PX = 72;
/** Lines get their names at the end up to this many (the legend always lists them). */
const MAX_END_LABELS = 4;

/** Categorical slots, light and dark, in a fixed order (validated for color-blind separation). */
const PALETTE: [string, string][] = [
  ["#2a78d6", "#3987e5"],
  ["#eb6834", "#d95926"],
  ["#1baf7a", "#199e70"],
  ["#eda100", "#c98500"],
  ["#e87ba4", "#d55181"],
  ["#008300", "#0ca30c"],
  ["#6250d6", "#9085e9"],
  ["#e34948", "#e66767"],
];
const ALL_COLOR: [string, string] = ["#0f4c9e", "#7aa7e6"];
const OTHER_COLOR: [string, string] = ["#94a3b8", "#64748b"];

const GROUPINGS: { value: TimelineGrouping; label: string }[] = [
  { value: "all", label: "All voters" },
  { value: "career", label: "Career" },
  { value: "program", label: "Program" },
  { value: "level", label: "Level" },
];

type Metric = "votes" | "turnout";
type Range = "all" | "24h" | "6h" | "1h";

const RANGES: { value: Range; label: string; short: string; ms: number }[] = [
  { value: "all", label: "since voting opened", short: "All", ms: Infinity },
  { value: "24h", label: "in the last 24 hours", short: "24h", ms: 24 * HOUR },
  { value: "6h", label: "in the last 6 hours", short: "6h", ms: 6 * HOUR },
  { value: "1h", label: "in the last hour", short: "1h", ms: HOUR },
];

interface TurnoutTimelineProps {
  election: Election;
  voters: VoterRow[] | null;
  enrollments: VoterEnrollment[] | null;
  careers: Career[];
  /** Career code → its color. */
  colors: ReadonlyMap<string, string>;
  now: number;
}

/** A line, ready to draw. */
interface Line extends TimelineSeries {
  color: [string, string];
  /** What's plotted: votes, or turnout in 0–1. */
  plotted: number[];
}

export function TurnoutTimeline({ election, voters, enrollments, careers, colors, now }: TurnoutTimelineProps) {
  const [grouping, setGrouping] = useState<TimelineGrouping>("all");
  const [metric, setMetric] = useState<Metric>("votes");
  const [rangeChoice, setRange] = useState<Range>("all");
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());

  const opened = Date.parse(election.startsAt) || 0;
  // The chart moves on by the minute; the voters refresh every 30 s.
  const to = Math.max(opened + 60_000, Math.floor(now / 60_000) * 60_000);
  const elapsed = to - opened;
  // Ranges offered only when they're meaningfully shorter than the whole vote.
  const ranges = RANGES.filter((r) => r.value === "all" || elapsed > r.ms * 1.5);
  const range = ranges.find((r) => r.value === rangeChoice) ?? ranges[0];
  const from = range.value === "all" ? opened : to - range.ms;

  const enrollment = useMemo(() => (enrollments ? enrollmentsByStudent(enrollments, election.termId) : null), [enrollments, election.termId]);
  const needsEnrollment = grouping !== "all";
  const timeline = useMemo(() => {
    if (!voters || (needsEnrollment && !enrollment)) return null;
    return turnoutTimeline(voters, enrollment, careers, grouping, from, to);
  }, [voters, enrollment, careers, grouping, from, to, needsEnrollment]);

  const lines = useMemo<Line[]>(() => {
    if (!timeline) return [];
    let slot = 0;
    return timeline.series.map((s) => {
      const career = s.careerCode ? colors.get(s.careerCode) : undefined;
      const color: [string, string] =
        s.key === "all" ? ALL_COLOR : s.key === "other" ? OTHER_COLOR : grouping === "career" && career ? [career, career] : PALETTE[slot++ % PALETTE.length];
      return { ...s, color, plotted: metric === "turnout" ? s.values.map((v) => (s.total ? v / s.total : 0)) : s.values };
    });
  }, [timeline, colors, grouping, metric]);

  const shown = lines.filter((l) => !hidden.has(l.key));
  const voted = voters?.filter((v) => v.voteStatus === "completed").length ?? 0;
  const total = voters?.length ?? 0;
  const inRange =
    range.value === "all"
      ? voted
      : (voters?.filter((v) => v.voteStatus === "completed" && (!v.votedAt || Date.parse(v.votedAt) > from)).length ?? 0);
  const unknown = timeline?.unknown ?? 0;

  function toggle(key: string) {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      // At least one line stays on.
      else if (lines.length - current.size > 1) next.add(key);
      return next;
    });
  }

  return (
    <div className={cn(cardClassName, "overflow-hidden")}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-5 pt-4.5">
        <div className="min-w-0">
          <p className="text-[0.75rem] text-muted-foreground">Ballots cast</p>
          <p className="text-[1.875rem] leading-9 font-medium tracking-[-0.02em] text-foreground tabular-nums">
            {voters ? count(voted) : "—"}
            {voters ? <span className="ml-1.5 text-[0.875rem] font-normal tracking-normal text-muted-foreground">of {count(total)}</span> : null}
          </p>
          <p className="text-[0.71875rem] text-muted-foreground">
            {voters ? (
              <>
                <span className="font-medium text-[#15803d] dark:text-[#4ade80]">+{count(inRange)}</span> {range.label} · {total ? percent(voted / total) : "0.0%"} turnout
              </>
            ) : (
              "Loading…"
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Show" value={metric} onChange={setMetric} options={[{ value: "votes", label: "Votes" }, { value: "turnout", label: "Turnout %" }]} />
          {ranges.length > 1 ? <Segmented label="Time range" value={range.value} onChange={setRange} options={ranges.map((r) => ({ value: r.value, label: r.short }))} /> : null}
        </div>
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-2 px-5">
        <span className="text-[0.65625rem] font-medium tracking-[0.04em] text-muted-foreground uppercase">Group by</span>
        <div role="tablist" aria-label="Group by" className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
          {GROUPINGS.map((g) => (
            <button
              key={g.value}
              type="button"
              role="tab"
              aria-selected={g.value === grouping}
              onClick={() => {
                setGrouping(g.value);
                setHidden(new Set());
              }}
              className={cn(
                "h-7 shrink-0 cursor-pointer rounded-full border px-3 text-[0.71875rem] whitespace-nowrap outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-brand-blue/30",
                g.value === grouping
                  ? "border-foreground bg-foreground text-background"
                  : "border-[#e2e8f0] text-muted-foreground hover:border-[#cbd2db] hover:text-foreground dark:border-border",
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {timeline ? (
        <>
          <Chart times={timeline.times} lines={shown} metric={metric} endLabels={grouping !== "all" && shown.length <= MAX_END_LABELS} />
          <div className="flex flex-wrap items-center gap-x-1 gap-y-1 border-t border-[#e2e8f0] px-4 py-2.5 dark:border-border">
            {lines.length > 1
              ? lines.map((l) => (
                  <LegendItem key={l.key} line={l} metric={metric} off={hidden.has(l.key)} onToggle={() => toggle(l.key)} />
                ))
              : null}
            <p className="ml-auto pl-2 text-[0.65625rem] text-muted-foreground">
              {unknown && needsEnrollment ? `${plural(unknown, "voter")} without an enrollment record left out · ` : null}
              Updates every 30 s
            </p>
          </div>
          <DataTable lines={lines} />
        </>
      ) : (
        <div className="flex items-center justify-center gap-2 text-[0.8125rem] text-muted-foreground" style={{ height: HEIGHT + 45 }}>
          {voters && needsEnrollment && !enrollments ? (
            "Couldn't load the students' enrollments, so votes can't be grouped yet."
          ) : (
            <>
              <LoaderCircle aria-hidden className="size-4 animate-spin" />
              Counting votes…
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    Chart                                   */
/* -------------------------------------------------------------------------- */

/** `--line` is the series color in the current theme. */
const lineStyle = (color: [string, string]) => ({ "--c": color[0], "--cd": color[1] }) as CSSProperties;
const lineVar = "[--line:var(--c)] dark:[--line:var(--cd)]";

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** 0, then round steps up to at least `max` (about 4 gridlines). */
function niceTicks(max: number, metric: Metric): number[] {
  if (metric === "turnout") {
    const top = Math.min(1, Math.max(0.1, Math.ceil(max * 10) / 10));
    const step = top <= 0.2 ? 0.05 : top <= 0.5 ? 0.1 : 0.25;
    return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => Math.min(1, i * step));
  }
  const raw = Math.max(1, max) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw);
  return Array.from({ length: Math.ceil(Math.max(1, max) / step) + 1 }, (_, i) => i * step);
}

const TIME_STEPS = [15, 30, 60, 120, 180, 360, 720, 1440, 2880, 10080].map((m) => m * 60_000);
const tzOffset = (t: number) => -new Date(t).getTimezoneOffset() * 60_000;

/** Round local times between `from` and `to`, at most `most` of them. */
function timeTicks(from: number, to: number, most: number): { ticks: number[]; step: number } {
  const step = TIME_STEPS.find((s) => (to - from) / s <= most) ?? TIME_STEPS[TIME_STEPS.length - 1];
  const offset = tzOffset(from);
  const ticks: number[] = [];
  for (let t = Math.ceil((from + offset) / step) * step - offset; t <= to; t += step) ticks.push(t);
  return { ticks, step };
}

const hourFormat = new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric" });

function tickLabel(t: number, step: number): string {
  const d = new Date(t);
  if (step >= 1440 * 60_000 || (d.getHours() === 0 && d.getMinutes() === 0)) return dayFormat.format(d);
  return hourFormat.format(d).replace(":00", "").replace(/\s/g, " ");
}

/**
 * A smooth curve through the points (monotone cubic, Fritsch–Carlson): it never overshoots,
 * so a running total never appears to dip or to rise past the next value.
 */
function smoothPath(points: [number, number][]): string {
  const n = points.length;
  if (n === 0) return "";
  const f = (v: number) => v.toFixed(1);
  if (n < 3) return points.map(([px, py], i) => `${i ? "L" : "M"}${f(px)},${f(py)}`).join("");
  const h = points.slice(1).map(([px], i) => px - points[i][0] || 1e-6);
  const d = points.slice(1).map(([, py], i) => (py - points[i][1]) / h[i]);
  const m = points.map((_, i) => {
    if (i === 0) return d[0];
    if (i === n - 1) return d[n - 2];
    const [a, b] = [d[i - 1], d[i]];
    if (a * b <= 0) return 0;
    const p = (a * h[i] + b * h[i - 1]) / (h[i - 1] + h[i]);
    return Math.sign(a) * Math.min(Math.abs(a), Math.abs(b), Math.abs(p) / 2) * 2;
  });
  let out = `M${f(points[0][0])},${f(points[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const t = h[i] / 3;
    out += `C${f(x0 + t)},${f(y0 + t * m[i])} ${f(x1 - t)},${f(y1 - t * m[i + 1])} ${f(x1)},${f(y1)}`;
  }
  return out;
}

const formatValue = (value: number, metric: Metric) => (metric === "turnout" ? percent(value) : count(value));

function Chart({ times, lines, metric, endLabels }: { times: number[]; lines: Line[]; metric: Metric; endLabels: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const gradientId = useId().replace(/:/g, "");

  const right = MARGIN.right + (endLabels ? END_LABELS_PX : 0);
  const plotW = Math.max(1, width - MARGIN.left - right);
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const from = times[0];
  const to = times[times.length - 1];
  const yTicks = niceTicks(Math.max(0, ...lines.flatMap((l) => l.plotted)), metric);
  const yMax = yTicks[yTicks.length - 1] || 1;
  const x = (t: number) => MARGIN.left + ((t - from) / Math.max(1, to - from)) * plotW;
  const y = (v: number) => MARGIN.top + plotH - (v / yMax) * plotH;
  const { ticks: xTicks, step } = timeTicks(from, to, Math.max(2, Math.floor(plotW / 84)));
  const last = times.length - 1;

  const path = (l: Line) => smoothPath(l.plotted.map((v, i) => [x(times[i]), y(v)]));

  // Names at the line ends, nudged apart so they don't overlap.
  const labels = endLabels
    ? lines
        .map((l) => ({ line: l, y: y(l.plotted[last]) }))
        .sort((a, b) => a.y - b.y)
        .reduce<{ line: Line; y: number }[]>((out, item) => {
          const prev = out[out.length - 1];
          out.push({ ...item, y: prev ? Math.max(item.y, prev.y + 13) : item.y });
          return out;
        }, [])
    : [];

  function pick(event: PointerEvent<SVGRectElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const t = from + ((event.clientX - box.left) / Math.max(1, box.width)) * (to - from);
    let best = 0;
    for (let i = 1; i < times.length; i++) if (Math.abs(times[i] - t) < Math.abs(times[best] - t)) best = i;
    setActive(best);
  }

  function onKey(event: KeyboardEvent<SVGRectElement>) {
    const move = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity }[event.key];
    if (move === undefined) return;
    event.preventDefault();
    setActive((i) => Math.min(last, Math.max(0, (i ?? last) + move)));
  }

  const at = active === null ? null : Math.min(active, last);
  const tipLeft = at === null ? 0 : x(times[at]);
  const flip = tipLeft > width - 220;

  return (
    <div ref={ref} className="relative mt-2 px-1" style={{ height: HEIGHT }}>
      {width > 0 ? (
        <svg width={width} height={HEIGHT} className="block overflow-visible" role="img" aria-label="Ballots cast over time">
          <defs>
            {lines.length === 1 ? (
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1" className={lineVar} style={lineStyle(lines[0].color)}>
                <stop offset="0%" style={{ stopColor: "var(--line)", stopOpacity: 0.18 }} />
                <stop offset="100%" style={{ stopColor: "var(--line)", stopOpacity: 0 }} />
              </linearGradient>
            ) : null}
          </defs>

          {/* Grid and axes, recessive. */}
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={MARGIN.left} x2={MARGIN.left + plotW} y1={y(v)} y2={y(v)} className="stroke-[#eef1f5] dark:stroke-white/8" strokeDasharray={v ? "2 4" : undefined} />
              <text x={MARGIN.left - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[0.65625rem] tabular-nums">
                {formatValue(v, metric).replace(".0%", "%")}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t} x={x(t)} y={HEIGHT - 8} textAnchor="middle" className="fill-muted-foreground text-[0.65625rem]">
              {tickLabel(t, step)}
            </text>
          ))}

          {lines.length === 1 ? <path d={`${path(lines[0])}L${x(to)},${y(0)}L${x(from)},${y(0)}Z`} fill={`url(#${gradientId})`} /> : null}
          {lines.map((l) => (
            <path key={l.key} d={path(l)} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className={cn(lineVar, "stroke-(--line)")} style={lineStyle(l.color)} />
          ))}

          {labels.map(({ line, y: ly }) => (
            <g key={line.key} className={lineVar} style={lineStyle(line.color)}>
              <line x1={x(to) + 6} x2={x(to) + 14} y1={ly} y2={ly} strokeWidth={2} strokeLinecap="round" className="stroke-(--line)" />
              <text x={x(to) + 18} y={ly} dy="0.32em" className="fill-foreground text-[0.6875rem] font-medium">
                {line.label.length > 9 ? `${line.label.slice(0, 8)}…` : line.label}
              </text>
            </g>
          ))}

          {at !== null ? (
            <g pointerEvents="none">
              <line x1={x(times[at])} x2={x(times[at])} y1={MARGIN.top} y2={MARGIN.top + plotH} strokeWidth={1} className="stroke-foreground/25" />
              {lines.map((l) => (
                <circle
                  key={l.key}
                  cx={x(times[at])}
                  cy={y(l.plotted[at])}
                  r={4.5}
                  strokeWidth={2}
                  className={cn(lineVar, "fill-(--line) stroke-card")}
                  style={lineStyle(l.color)}
                />
              ))}
            </g>
          ) : null}

          <rect
            x={MARGIN.left}
            y={MARGIN.top}
            width={plotW}
            height={plotH}
            fill="transparent"
            tabIndex={0}
            aria-label="Move through time with the arrow keys"
            className="cursor-crosshair outline-none focus-visible:stroke-brand-blue/40"
            onPointerMove={pick}
            onPointerDown={pick}
            onPointerLeave={() => setActive(null)}
            onFocus={() => setActive((i) => i ?? last)}
            onBlur={() => setActive(null)}
            onKeyDown={onKey}
          />
        </svg>
      ) : null}

      {at !== null ? (
        <div
          role="status"
          className="pointer-events-none absolute top-2 z-10 min-w-40 rounded-md bg-[#0f172a] px-3 py-2 text-white shadow-lg dark:bg-[#f8fafc] dark:text-[#0f172a]"
          style={flip ? { right: width - tipLeft + 12 } : { left: tipLeft + 12 }}
        >
          <p className="text-[0.65625rem] text-white/60 dark:text-[#0f172a]/60">
            {at === last ? "Now" : formatDayTime(instantToLocal(new Date(times[at]).toISOString()))}
          </p>
          <ul className="mt-1 space-y-0.5">
            {[...lines]
              .sort((a, b) => b.plotted[at] - a.plotted[at])
              .map((l) => (
                <li key={l.key} className="flex items-center gap-2 text-[0.75rem]">
                  <span aria-hidden className={cn(lineVar, "h-0.5 w-2.5 shrink-0 rounded-full bg-(--line)")} style={lineStyle(l.color)} />
                  <span className="font-semibold tabular-nums">{formatValue(l.plotted[at], metric)}</span>
                  <span className="truncate text-white/70 dark:text-[#0f172a]/70">
                    {lines.length > 1 ? l.name : metric === "turnout" ? `${count(l.values[at])} of ${count(l.total)}` : "ballots cast"}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Pieces                                   */
/* -------------------------------------------------------------------------- */

function LegendItem({ line, metric, off, onToggle }: { line: Line; metric: Metric; off: boolean; onToggle: () => void }) {
  const latest = line.plotted[line.plotted.length - 1];
  return (
    <button
      type="button"
      aria-pressed={!off}
      title={off ? `Show ${line.name}` : `Hide ${line.name}`}
      onClick={onToggle}
      className={cn(
        "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-2 text-[0.71875rem] outline-none transition-[opacity,background-color] duration-200 hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand-blue/30",
        off && "opacity-45",
      )}
    >
      <span aria-hidden className={cn(lineVar, "h-0.5 w-3 rounded-full bg-(--line)", off && "bg-muted-foreground")} style={lineStyle(line.color)} />
      <span className={cn("text-foreground", off && "line-through")}>{line.label}</span>
      <span className="text-muted-foreground tabular-nums">{formatValue(latest, metric)}</span>
    </button>
  );
}

function Segmented<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (value: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex h-8 items-center rounded-[0.375rem] border border-[#e2e8f0] p-0.5 dark:border-border">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-full cursor-pointer rounded-[0.25rem] px-2.5 text-[0.71875rem] font-medium outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-brand-blue/30",
            o.value === value ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** The same numbers as a table, for screen readers. */
function DataTable({ lines }: { lines: Line[] }) {
  return (
    <table className="sr-only">
      <caption>Ballots cast so far</caption>
      <thead>
        <tr>
          <th scope="col">Group</th>
          <th scope="col">Voted</th>
          <th scope="col">Voters</th>
          <th scope="col">Turnout</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => {
          const v = l.values[l.values.length - 1];
          return (
            <tr key={l.key}>
              <th scope="row">{l.name}</th>
              <td>{count(v)}</td>
              <td>{count(l.total)}</td>
              <td>{l.total ? percent(v / l.total) : "0.0%"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
