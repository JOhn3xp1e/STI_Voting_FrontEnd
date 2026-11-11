"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import {
  MONTHS_LONG,
  addDays,
  addMonths,
  daysInMonth,
  formatDate,
  parseIsoDate,
  toIsoDate,
  weekdayOf,
  type IsoDate,
} from "@/lib/dates";
import { cn } from "@/lib/utils";

import styles from "./terms.module.css";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

interface CalendarProps {
  value: IsoDate | null;
  onSelect: (date: IsoDate) => void;
  today: IsoDate;
  /** Earliest / latest pickable day (inclusive). */
  min?: IsoDate | null;
  max?: IsoDate | null;
  /** The term's other date, so the days in between are shaded. */
  rangeStart?: IsoDate | null;
  rangeEnd?: IsoDate | null;
  /** Month to open on when nothing is picked yet. */
  fallback?: IsoDate | null;
  /** Receives the day button that should get focus when the calendar opens. */
  focusTargetRef?: RefObject<HTMLButtonElement | null>;
}

type Direction = "next" | "prev" | null;

const longDate = (iso: IsoDate) => {
  const { year, month, day } = parseIsoDate(iso);
  return new Date(year, month, day).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

/** Month grid date picker: arrows move by day / week, PageUp / PageDown by month, Home / End to the week's ends. */
export function Calendar({ value, onSelect, today, min, max, rangeStart, rangeEnd, fallback, focusTargetRef }: CalendarProps) {
  const isDisabled = (iso: IsoDate) => (min ? iso < min : false) || (max ? iso > max : false);

  const start = value ?? fallback ?? (min && today < min ? min : today);
  const [view, setView] = useState(() => {
    const { year, month } = parseIsoDate(start);
    return { year, month };
  });
  const [direction, setDirection] = useState<Direction>(null);
  const [focused, setFocused] = useState<IsoDate>(start);
  const [popped, setPopped] = useState<IsoDate | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);
  /** Set by keyboard moves so the new day receives focus after rendering. */
  const moveFocus = useRef(false);

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus();
  }, [focused, view]);

  function showMonth(iso: IsoDate) {
    const { year, month } = parseIsoDate(iso);
    if (year === view.year && month === view.month) return;
    setDirection(year * 12 + month > view.year * 12 + view.month ? "next" : "prev");
    setView({ year, month });
  }

  function stepMonth(delta: number) {
    const target = addMonths(focused, delta);
    showMonth(target);
    setFocused(target);
  }

  function focusDay(iso: IsoDate) {
    moveFocus.current = true;
    showMonth(iso);
    setFocused(iso);
  }

  function pick(iso: IsoDate) {
    if (isDisabled(iso)) return;
    setPopped(iso);
    setFocused(iso);
    onSelect(iso);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const weekday = weekdayOf(focused);
    const moves: Record<string, () => IsoDate> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      Home: () => addDays(focused, -weekday),
      End: () => addDays(focused, 6 - weekday),
      PageUp: () => addMonths(focused, event.shiftKey ? -12 : -1),
      PageDown: () => addMonths(focused, event.shiftKey ? 12 : 1),
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    focusDay(move());
  }

  // Six weeks, starting on the Sunday on or before the 1st.
  const first = toIsoDate(view.year, view.month, 1);
  const gridStart = addDays(first, -weekdayOf(first));
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  // Keep a tabbable day inside the visible month.
  const tabbable =
    parseIsoDate(focused).year === view.year && parseIsoDate(focused).month === view.month
      ? focused
      : toIsoDate(view.year, view.month, Math.min(parseIsoDate(focused).day, daysInMonth(view.year, view.month)));

  const [lo, hi] = rangeStart && rangeEnd && rangeStart < rangeEnd ? [rangeStart, rangeEnd] : [null, null];
  const labelId = `calendar-${view.year}-${view.month}`;
  const motion = direction === "next" ? styles.monthNext : direction === "prev" ? styles.monthPrev : undefined;

  return (
    <div className="select-none">
      <div className="flex items-center justify-between gap-2 pb-2.5">
        <p id={labelId} aria-live="polite" className="overflow-hidden pl-1 text-[0.875rem] font-semibold text-foreground">
          <span
            key={labelId}
            className={cn("inline-block", direction === "next" ? styles.labelNext : direction === "prev" ? styles.labelPrev : undefined)}
          >
            {MONTHS_LONG[view.month]} <span className="font-mono font-medium text-muted-foreground">{view.year}</span>
          </span>
        </p>
        <div className="flex items-center gap-0.5">
          {[
            { delta: -1, label: "Previous month", Icon: ChevronLeft },
            { delta: 1, label: "Next month", Icon: ChevronRight },
          ].map(({ delta, label, Icon }) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              onClick={() => stepMonth(delta)}
              className="flex size-7.5 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none transition-[background-color,color,scale] duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand-blue/30 active:scale-90"
            >
              <Icon aria-hidden className="size-4" />
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-7 pb-1">
        {WEEKDAYS.map((day) => (
          <span key={day} aria-hidden className="py-1 text-center font-mono text-[0.625rem] tracking-[0.06em] text-muted-foreground uppercase">
            {day}
          </span>
        ))}
      </div>

      <div className="overflow-hidden">
        <div
          key={labelId}
          ref={gridRef}
          role="grid"
          aria-labelledby={labelId}
          onKeyDown={onKeyDown}
          className={cn("grid grid-cols-7 gap-y-0.5", motion)}
        >
          {days.map((iso) => {
            const { month, day } = parseIsoDate(iso);
            const outside = month !== view.month;
            const selected = iso === value;
            const disabled = isDisabled(iso);
            const isToday = iso === today;
            const inRange = lo !== null && hi !== null && iso > lo && iso < hi;
            const isRangeEnd = !selected && (iso === rangeStart || iso === rangeEnd);
            const isTabbable = iso === tabbable;
            // The term's span is drawn as one continuous strip behind the days (current month only).
            const strip = !outside && lo !== null && hi !== null;
            const weekday = weekdayOf(iso);

            return (
              <div
                key={iso}
                role="gridcell"
                aria-selected={selected}
                className={cn(
                  "flex justify-center transition-colors duration-200",
                  strip && inRange && "bg-brand-blue/6 dark:bg-white/5",
                  strip && iso === lo && "bg-linear-to-r from-transparent from-50% to-brand-blue/6 to-50% dark:to-white/5",
                  strip && iso === hi && "bg-linear-to-l from-transparent from-50% to-brand-blue/6 to-50% dark:to-white/5",
                  weekday === 0 && "rounded-l-md",
                  weekday === 6 && "rounded-r-md",
                )}
              >
                <button
                  ref={isTabbable ? focusTargetRef : undefined}
                  type="button"
                  data-date={iso}
                  tabIndex={isTabbable ? 0 : -1}
                  disabled={disabled}
                  aria-label={`${longDate(iso)}${isToday ? ", today" : ""}`}
                  aria-current={isToday ? "date" : undefined}
                  onClick={() => pick(iso)}
                  onFocus={() => setFocused(iso)}
                  className={cn(
                    "relative flex size-9 cursor-pointer items-center justify-center rounded-md text-[0.8125rem] tabular-nums outline-none",
                    "transition-[background-color,color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-brand-blue/40",
                    outside ? "text-muted-foreground/45" : "text-foreground",
                    isRangeEnd && !outside && "bg-background font-medium text-brand-blue ring-1 ring-brand-blue/40 ring-inset dark:text-[#9dbdeb]",
                    selected
                      ? "bg-primary font-semibold text-primary-foreground shadow-[0_6px_14px_-8px_rgb(15_23_42/0.7)]"
                      : !disabled && (inRange && !outside ? "hover:bg-brand-blue/12 dark:hover:bg-white/10" : "hover:bg-muted"),
                    selected && iso === popped && styles.dayPop,
                    isToday && !selected && "font-semibold",
                    disabled && "cursor-not-allowed text-muted-foreground/30 hover:bg-transparent",
                  )}
                >
                  {day}
                  {isToday ? (
                    <span
                      aria-hidden
                      className={cn(
                        "absolute bottom-1 size-1 rounded-full",
                        selected ? "bg-primary-foreground" : "bg-brand-blue dark:bg-[#7aa7e6]",
                      )}
                    />
                  ) : null}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between border-t border-border pt-2.5">
        <span className="font-mono text-[0.6875rem] text-muted-foreground">
          {value ? formatDate(value) : fallback ? `Suggested · ${formatDate(fallback)}` : "No date picked"}
        </span>
        <button
          type="button"
          disabled={isDisabled(today)}
          onClick={() => {
            showMonth(today);
            pick(today);
          }}
          className="h-7 cursor-pointer rounded-md px-2 text-[0.75rem] font-medium text-brand-blue outline-none transition-colors hover:bg-brand-blue/8 focus-visible:ring-2 focus-visible:ring-brand-blue/30 disabled:cursor-not-allowed disabled:opacity-40 dark:text-[#7aa7e6]"
        >
          Today
        </button>
      </div>
    </div>
  );
}
