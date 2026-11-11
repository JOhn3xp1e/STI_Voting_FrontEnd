"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import styles from "@/components/shared/motion.module.css";
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

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS_SHORT = MONTHS_LONG.map((m) => m.slice(0, 3));

/** Years listed in the year view, around today (widened to include the shown year and min / max). */
const YEARS_BACK = 30;
const YEARS_AHEAD = 20;

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
type Mode = "days" | "months" | "years";

const longDate = (iso: IsoDate) => {
  const { year, month, day } = parseIsoDate(iso);
  return new Date(year, month, day).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
};

const iconButtonClassName = cn(
  "flex size-7.5 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none",
  "transition-[background-color,color,scale,opacity] duration-200 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand-blue/30 active:scale-90",
);

/** "August ⌄" / "2026 ⌄" in the header: opens the month or year view. */
function HeaderToggle({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={active}
      onClick={onClick}
      className={cn(
        "group/toggle inline-flex h-7.5 cursor-pointer items-center gap-0.5 overflow-hidden rounded-md px-1.5 outline-none",
        "transition-[background-color,color] duration-200 hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand-blue/30",
        active && "bg-muted",
      )}
    >
      {children}
      <ChevronDown
        aria-hidden
        className={cn(
          "size-3.5 text-muted-foreground transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/toggle:text-foreground",
          active && "rotate-180",
        )}
      />
    </button>
  );
}

/** Arrow keys over a grid of buttons (`data-index`), `columns` wide. */
function moveInGrid(event: KeyboardEvent<HTMLElement>, columns: number) {
  const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns };
  const step = steps[event.key];
  if (!step) return;
  const current = (event.target as HTMLElement).closest<HTMLElement>("[data-index]");
  if (!current) return;
  const next = event.currentTarget.querySelector<HTMLButtonElement>(`[data-index="${Number(current.dataset.index) + step}"]`);
  if (!next) return;
  event.preventDefault();
  next.focus();
  next.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

/**
 * Date picker with three views:
 * - days: arrows move by day / week, PageUp / PageDown by month, Home / End to the week's ends;
 * - months: a 3 × 4 grid (the header arrows step the year);
 * - years: a smooth-scrolling list, centred on the shown year.
 * Picking a year opens its months; picking a month opens its days.
 */
export function Calendar({ value, onSelect, today, min, max, rangeStart, rangeEnd, fallback, focusTargetRef }: CalendarProps) {
  const isDisabled = (iso: IsoDate) => (min ? iso < min : false) || (max ? iso > max : false);
  const monthDisabled = (year: number, month: number) =>
    (min ? toIsoDate(year, month, daysInMonth(year, month)) < min : false) || (max ? toIsoDate(year, month, 1) > max : false);
  const yearDisabled = (year: number) => (min ? `${year}-12-31` < min : false) || (max ? `${year}-01-01` > max : false);

  const start = value ?? fallback ?? (min && today < min ? min : today);
  const [view, setView] = useState(() => {
    const { year, month } = parseIsoDate(start);
    return { year, month };
  });
  const [mode, setMode] = useState<Mode>("days");
  const [direction, setDirection] = useState<Direction>(null);
  const [focused, setFocused] = useState<IsoDate>(start);
  const [popped, setPopped] = useState<IsoDate | null>(null);

  const bodyRef = useRef<HTMLDivElement>(null);
  const yearListRef = useRef<HTMLDivElement>(null);
  /** Set by keyboard moves so the new day receives focus after rendering. */
  const moveFocus = useRef(false);
  /** Set when the view changes, so its current item receives focus. */
  const focusView = useRef(false);

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    bodyRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus();
  }, [focused, view]);

  // Centre the shown year when the year view opens (instantly; later scrolling is smooth).
  useLayoutEffect(() => {
    if (mode !== "years") return;
    const list = yearListRef.current;
    const current = list?.querySelector<HTMLElement>("[data-current=true]");
    if (list && current) list.scrollTo({ top: current.offsetTop - (list.clientHeight - current.offsetHeight) / 2, behavior: "instant" });
  }, [mode]);

  // Move focus into a view after switching to it.
  useEffect(() => {
    if (!focusView.current) return;
    focusView.current = false;
    const target =
      mode === "days"
        ? bodyRef.current?.querySelector<HTMLButtonElement>("[tabindex='0'][data-date]")
        : bodyRef.current?.querySelector<HTMLButtonElement>("[data-current=true]");
    target?.focus({ preventScroll: true });
  }, [mode, view]);

  function switchMode(next: Mode) {
    focusView.current = true;
    setDirection(null);
    setMode(next);
  }

  function showMonth(iso: IsoDate) {
    const { year, month } = parseIsoDate(iso);
    if (year === view.year && month === view.month) return;
    setDirection(year * 12 + month > view.year * 12 + view.month ? "next" : "prev");
    setView({ year, month });
  }

  /** Same day of the month, clamped (Jan 31 → Feb 28). */
  const sameDayIn = (year: number, month: number) => toIsoDate(year, month, Math.min(parseIsoDate(focused).day, daysInMonth(year, month)));

  function stepMonth(delta: number) {
    const target = addMonths(focused, delta);
    showMonth(target);
    setFocused(target);
  }

  function stepYear(delta: number) {
    setDirection(delta > 0 ? "next" : "prev");
    setView((v) => ({ ...v, year: v.year + delta }));
  }

  function chooseMonth(month: number) {
    const target = sameDayIn(view.year, month);
    showMonth(target);
    setFocused(target);
    focusView.current = true;
    setMode("days");
  }

  function chooseYear(year: number) {
    setDirection(null);
    setView((v) => ({ ...v, year }));
    setFocused(sameDayIn(year, view.month));
    switchMode("months");
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

  function onDaysKeyDown(event: KeyboardEvent<HTMLDivElement>) {
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
  const tabbable =
    parseIsoDate(focused).year === view.year && parseIsoDate(focused).month === view.month ? focused : sameDayIn(view.year, view.month);

  const [lo, hi] = rangeStart && rangeEnd && rangeStart < rangeEnd ? [rangeStart, rangeEnd] : [null, null];
  const labelId = `calendar-${view.year}-${view.month}`;
  const slide = direction === "next" ? styles.monthNext : direction === "prev" ? styles.monthPrev : undefined;
  const roll = direction === "next" ? styles.labelNext : direction === "prev" ? styles.labelPrev : undefined;

  const todayParts = parseIsoDate(today);
  const valueParts = value ? parseIsoDate(value) : null;

  const firstYear = Math.min(todayParts.year - YEARS_BACK, view.year, min ? parseIsoDate(min).year : Infinity);
  const lastYear = Math.max(todayParts.year + YEARS_AHEAD, view.year, max ? parseIsoDate(max).year : -Infinity);
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => firstYear + i);

  // Header arrows: months in the day view, years in the month view, hidden in the year view.
  const arrows =
    mode === "days"
      ? { prev: () => stepMonth(-1), next: () => stepMonth(1), unit: "month" }
      : mode === "months"
        ? { prev: () => stepYear(-1), next: () => stepYear(1), unit: "year" }
        : null;

  return (
    <div className="select-none">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 pb-2.5">
        <div className="-ml-0.5 flex items-center">
          <span id={labelId} className="sr-only">
            {MONTHS_LONG[view.month]} {view.year}
          </span>
          <HeaderToggle active={mode === "months"} onClick={() => switchMode(mode === "months" ? "days" : "months")} label={`Choose month, ${MONTHS_LONG[view.month]}`}>
            <span key={`m-${view.month}`} className={cn("inline-block text-[0.875rem] font-semibold text-foreground", mode === "days" && roll)}>
              {MONTHS_LONG[view.month]}
            </span>
          </HeaderToggle>
          <HeaderToggle active={mode === "years"} onClick={() => switchMode(mode === "years" ? "days" : "years")} label={`Choose year, ${view.year}`}>
            <span key={`y-${view.year}`} className={cn("inline-block font-mono text-[0.875rem] font-medium text-muted-foreground group-hover/toggle:text-foreground", roll)}>
              {view.year}
            </span>
          </HeaderToggle>
        </div>
        <div className={cn("flex items-center gap-0.5 transition-opacity duration-200", !arrows && "pointer-events-none opacity-0")} aria-hidden={!arrows}>
          <button type="button" aria-label={`Previous ${arrows?.unit ?? "month"}`} tabIndex={arrows ? 0 : -1} onClick={arrows?.prev} className={iconButtonClassName}>
            <ChevronLeft aria-hidden className="size-4" />
          </button>
          <button type="button" aria-label={`Next ${arrows?.unit ?? "month"}`} tabIndex={arrows ? 0 : -1} onClick={arrows?.next} className={iconButtonClassName}>
            <ChevronRight aria-hidden className="size-4" />
          </button>
        </div>
      </div>

      {/* Body: same height in every view, so the popup never jumps. */}
      <div ref={bodyRef} className="relative h-63.5 overflow-hidden">
        {mode === "days" ? (
          <div key="days" className={cn("h-full", styles.viewIn)}>
            <div className="grid grid-cols-7 pb-1">
              {WEEKDAYS.map((day) => (
                <span key={day} aria-hidden className="py-1 text-center font-mono text-[0.625rem] tracking-[0.06em] text-muted-foreground uppercase">
                  {day}
                </span>
              ))}
            </div>
            <div key={labelId} role="grid" aria-labelledby={labelId} onKeyDown={onDaysKeyDown} className={cn("grid grid-cols-7 gap-y-0.5", slide)}>
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
                        <span aria-hidden className={cn("absolute bottom-1 size-1 rounded-full", selected ? "bg-primary-foreground" : "bg-brand-blue dark:bg-[#7aa7e6]")} />
                      ) : null}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {mode === "months" ? (
          <div key="months" className={cn("h-full", styles.viewIn)}>
            <div
              key={view.year}
              role="listbox"
              aria-label={`Months of ${view.year}`}
              onKeyDown={(e) => moveInGrid(e, 3)}
              className={cn("grid h-full grid-cols-3 grid-rows-4 gap-1.5 p-0.5", slide)}
            >
              {MONTHS_SHORT.map((label, month) => {
                const isSelected = valueParts?.year === view.year && valueParts.month === month;
                const isShown = month === view.month;
                const isThisMonth = todayParts.year === view.year && todayParts.month === month;
                const disabled = monthDisabled(view.year, month);
                return (
                  <button
                    key={label}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    aria-label={`${MONTHS_LONG[month]} ${view.year}`}
                    data-index={month}
                    data-current={isShown}
                    tabIndex={isShown ? 0 : -1}
                    disabled={disabled}
                    onClick={() => chooseMonth(month)}
                    style={{ animationDelay: `${month * 14}ms` }}
                    className={cn(
                      "relative flex cursor-pointer items-center justify-center rounded-lg text-[0.8125rem] outline-none",
                      "transition-[background-color,color,box-shadow,scale] duration-150 focus-visible:ring-2 focus-visible:ring-brand-blue/40 active:scale-95",
                      styles.cellIn,
                      isSelected
                        ? "bg-primary font-semibold text-primary-foreground shadow-[0_6px_14px_-8px_rgb(15_23_42/0.7)]"
                        : cn("text-foreground hover:bg-muted", isShown && "bg-brand-blue/6 font-medium text-brand-blue ring-1 ring-brand-blue/30 ring-inset dark:bg-white/5 dark:text-[#9dbdeb]"),
                      disabled && "cursor-not-allowed text-muted-foreground/30 hover:bg-transparent",
                    )}
                  >
                    {label}
                    {isThisMonth ? (
                      <span aria-hidden className={cn("absolute bottom-1.5 size-1 rounded-full", isSelected ? "bg-primary-foreground" : "bg-brand-blue dark:bg-[#7aa7e6]")} />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {mode === "years" ? (
          <div
            key="years"
            ref={yearListRef}
            role="listbox"
            aria-label="Years"
            onKeyDown={(e) => moveInGrid(e, 3)}
            className={cn(
              "h-full overflow-y-auto overscroll-contain scroll-smooth px-0.5 py-6 [scrollbar-width:thin]",
              "[mask-image:linear-gradient(to_bottom,transparent,black_16%,black_84%,transparent)]",
              styles.viewIn,
            )}
          >
            <div className="grid grid-cols-3 gap-1.5">
              {years.map((year, index) => {
                const isSelected = valueParts?.year === year;
                const isShown = year === view.year;
                const isThisYear = todayParts.year === year;
                const disabled = yearDisabled(year);
                // Only the rows near the shown year animate in (the rest are off-screen).
                const near = Math.abs(year - view.year) <= 9;
                return (
                  <button
                    key={year}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-index={index}
                    data-current={isShown}
                    tabIndex={isShown ? 0 : -1}
                    disabled={disabled}
                    onClick={() => chooseYear(year)}
                    style={near ? { animationDelay: `${(year - view.year + 9) * 10}ms` } : undefined}
                    className={cn(
                      "relative flex h-10 cursor-pointer items-center justify-center rounded-lg font-mono text-[0.8125rem] tabular-nums outline-none",
                      "transition-[background-color,color,box-shadow,scale] duration-150 focus-visible:ring-2 focus-visible:ring-brand-blue/40 active:scale-95",
                      near && styles.cellIn,
                      isSelected
                        ? "bg-primary font-semibold text-primary-foreground shadow-[0_6px_14px_-8px_rgb(15_23_42/0.7)]"
                        : cn("text-foreground hover:bg-muted", isShown && "bg-brand-blue/6 font-medium text-brand-blue ring-1 ring-brand-blue/30 ring-inset dark:bg-white/5 dark:text-[#9dbdeb]"),
                      disabled && "cursor-not-allowed text-muted-foreground/30 hover:bg-transparent",
                    )}
                  >
                    {year}
                    {isThisYear ? (
                      <span aria-hidden className={cn("absolute bottom-1 size-1 rounded-full", isSelected ? "bg-primary-foreground" : "bg-brand-blue dark:bg-[#7aa7e6]")} />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {/* Footer */}
      <div className="mt-2.5 flex items-center justify-between border-t border-border pt-2.5">
        <span className="font-mono text-[0.6875rem] text-muted-foreground">
          {value ? formatDate(value) : fallback ? `Suggested · ${formatDate(fallback)}` : "No date picked"}
        </span>
        <button
          type="button"
          disabled={isDisabled(today)}
          onClick={() => {
            showMonth(today);
            setMode("days");
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
