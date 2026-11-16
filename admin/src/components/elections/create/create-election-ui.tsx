"use client";

import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Popover } from "@base-ui/react/popover";
import { Check } from "lucide-react";

import { popupClassName } from "@/components/dashboard/popup-styles";
import { fieldClassName } from "@/components/shared/form-styles";
import { primaryButtonClassName } from "@/components/students/student-toolbar-styles";
import { Calendar } from "@/components/terms/calendar";
import { formatFieldDateTime, type LocalDateTime } from "@/lib/elections";
import type { IsoDate } from "@/lib/dates";
import { textOn } from "@/lib/programs";
import { cn } from "@/lib/utils";

import wizardStyles from "./wizard.module.css";

/* -------------------------------------------------------------------------- */
/*                                   Stepper                                  */
/* -------------------------------------------------------------------------- */

interface StepperProps {
  steps: readonly string[];
  current: number;
  /** Furthest step reached; steps up to it can be revisited. */
  reached: number;
  onSelect: (index: number) => void;
}

export function Stepper({ steps, current, reached, onSelect }: StepperProps) {
  return (
    <nav aria-label="Election steps">
      <ol className="flex flex-wrap items-center gap-y-2">
        {steps.map((label, index) => {
          const active = index === current;
          const done = !active && index < reached;
          const reachable = index <= reached && !active;
          const state = active ? "active" : done ? "done" : "todo";
          return (
            <li key={label} className="flex items-center">
              {index > 0 ? (
                // The line fills in, left to right, once the step after it is reached.
                <span aria-hidden className="relative mx-2.5 h-px w-7 overflow-hidden bg-[#e2e8f0] dark:bg-border">
                  <span
                    className={cn(
                      "absolute inset-0 origin-left bg-brand-navy transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none dark:bg-white/70",
                      index <= current ? "scale-x-100" : "scale-x-0",
                    )}
                  />
                </span>
              ) : null}
              <button
                type="button"
                disabled={!reachable}
                onClick={() => onSelect(index)}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "group/step flex items-center gap-2.5 rounded-md pr-1 text-[0.875rem] outline-none",
                  "focus-visible:ring-2 focus-visible:ring-brand-blue/30",
                  reachable ? "cursor-pointer" : "cursor-default",
                )}
              >
                <span
                  key={state}
                  aria-hidden
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[0.625rem] transition-[background-color,color,box-shadow] duration-300",
                    state !== "todo" && wizardStyles.stepPop,
                    active
                      ? "bg-brand-blue text-white shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-brand-blue)_14%,transparent)]"
                      : done
                        ? "bg-brand-navy text-white group-hover/step:bg-brand-blue dark:bg-white dark:text-brand-navy"
                        : "border border-[#d5dbe3] text-muted-foreground dark:border-border",
                  )}
                >
                  {done ? <Check className="size-3" strokeWidth={2.6} /> : index + 1}
                </span>
                <span
                  className={cn(
                    "whitespace-nowrap transition-colors duration-300",
                    active || done ? "text-foreground" : "text-muted-foreground",
                    reachable && "group-hover/step:text-brand-blue",
                  )}
                >
                  {label}
                  {done ? <span className="sr-only"> (done)</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Section card                                */
/* -------------------------------------------------------------------------- */

export { SectionCard, cardClassName } from "@/components/shared/section-card";

/** Outlined header action, e.g. "+ Add position". */
export const outlineButtonClassName = cn(
  "inline-flex h-8.5 shrink-0 cursor-pointer items-center justify-center rounded-[0.25rem] border border-[#d5dbe3] bg-background px-4 text-[0.875rem] font-medium text-foreground outline-none dark:border-border",
  "transition-[background-color,border-color,box-shadow] duration-200 hover:border-[color-mix(in_oklab,var(--color-brand-muted)_45%,transparent)] hover:bg-muted/60",
  "focus-visible:border-brand-blue/60 focus-visible:ring-3 focus-visible:ring-brand-blue/15",
  "disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:border-[#d5dbe3] disabled:hover:bg-background",
);

/** Dark call-to-action in the summary panel. */
export const ctaButtonClassName = cn(primaryButtonClassName, "h-8.5 justify-start rounded-[0.25rem] px-4 text-[0.875rem] disabled:pointer-events-none disabled:opacity-60");

/* -------------------------------------------------------------------------- */
/*                                  Collapse                                  */
/* -------------------------------------------------------------------------- */

/** Opens and closes its content smoothly (height + fade). Closed content can't be focused. */
export function Collapse({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  return (
    <div
      aria-hidden={!open}
      inert={!open}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-450 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
    >
      <div className={cn("min-h-0 overflow-hidden", className)}>{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                               Career colours                               */
/* -------------------------------------------------------------------------- */

/** CSS variables for a career's color: `--career` (fill) and `--career-fg` (text on it). */
export function careerStyle(color: string): CSSProperties {
  return { "--career": color, "--career-fg": textOn(color) } as CSSProperties;
}

/** "TER" in the career's color. Sits inside an element styled with `careerStyle`. */
export function CareerBadge({ code, muted = false, className }: { code: string; muted?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5.5 shrink-0 items-center rounded-[0.25rem] px-2 font-mono text-[0.6875rem] font-semibold tracking-[0.04em] transition-[background-color,color,opacity] duration-300",
        muted ? "bg-muted text-muted-foreground" : "bg-(--career) text-(--career-fg)",
        className,
      )}
    >
      {code}
    </span>
  );
}

/** Pill filter in the career's color, with a check that slides in when picked. */
export function ScopeChip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "inline-flex h-7.5 cursor-pointer items-center rounded-full px-3.5 text-[0.8125rem] font-medium whitespace-nowrap outline-none select-none",
        "transition-[background-color,color,box-shadow,scale] duration-250 ease-out active:scale-95 motion-reduce:active:scale-100",
        "focus-visible:ring-3 focus-visible:ring-brand-blue/25",
        selected
          ? "bg-(--career) text-(--career-fg) shadow-[0_1px_2px_rgb(15_23_42/0.14),inset_0_0_0_1px_rgb(0_0_0/0.04)]"
          : "bg-[#f1f4f8] text-foreground hover:bg-[#e6ebf1] dark:bg-white/7 dark:hover:bg-white/12",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid transition-[grid-template-columns,opacity] duration-250 ease-out motion-reduce:transition-none",
          selected ? "grid-cols-[1fr] opacity-100" : "grid-cols-[0fr] opacity-0",
        )}
      >
        <span className="overflow-hidden">
          <Check className="mr-1.5 size-3.5" strokeWidth={2.6} />
        </span>
      </span>
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 Review row                                 */
/* -------------------------------------------------------------------------- */

export function ReviewRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-6.5 items-start justify-between gap-6 py-0.5">
      <dt className="shrink-0 text-[0.8125rem] leading-5.5 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right text-[0.875rem] leading-5.5 text-foreground">{children}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Date-time picker                              */
/* -------------------------------------------------------------------------- */

interface DateTimePickerProps {
  id: string;
  label: string;
  value: LocalDateTime | null;
  onChange: (value: LocalDateTime) => void;
  today: IsoDate;
  /** Time used when a day is picked before a time ("HH:mm"). */
  defaultTime: string;
  min?: IsoDate | null;
  invalid?: boolean;
  describedBy?: string;
}

/** Input-styled trigger: calendar + time in a popover. Shows "Date · time" when empty. */
export function DateTimePicker({ id, label, value, onChange, today, defaultTime, min, invalid, describedBy }: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const focusTargetRef = useRef<HTMLButtonElement | null>(null);
  const date = value?.slice(0, 10) ?? null;
  const time = value?.slice(11, 16) ?? defaultTime;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        id={id}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={cn(fieldClassName, "cursor-pointer rounded-[0.25rem] border-[#e2e8f0] dark:border-border")}
      >
        <span className={cn("truncate", !value && "text-muted-foreground")}>{value ? formatFieldDateTime(value) : "Date · time"}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={12} className="z-50 outline-none">
          <Popover.Popup
            data-themed
            initialFocus={focusTargetRef}
            className={cn(popupClassName, "w-[18.5rem] p-3 duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]")}
          >
            <Popover.Title className="sr-only">{label}</Popover.Title>
            <Calendar
              value={date}
              onSelect={(day) => onChange(`${day}T${time}`)}
              today={today}
              min={min}
              fallback={min ?? today}
              focusTargetRef={focusTargetRef}
            />
            <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
              <label htmlFor={`${id}-time`} className="text-[0.75rem] font-semibold text-foreground">
                Time
              </label>
              <input
                id={`${id}-time`}
                type="time"
                value={time}
                disabled={!date}
                onChange={(e) => {
                  if (date && e.target.value) onChange(`${date}T${e.target.value}`);
                }}
                className={cn(fieldClassName, "h-8.5 flex-1 px-2.5")}
              />
              <Popover.Close className={cn(primaryButtonClassName, "h-8.5 px-3.5")}>Done</Popover.Close>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
