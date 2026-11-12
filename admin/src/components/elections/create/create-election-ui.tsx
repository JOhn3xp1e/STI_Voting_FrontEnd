"use client";

import { useRef, useState, type ReactNode } from "react";
import { Popover } from "@base-ui/react/popover";
import { Check } from "lucide-react";

import { popupClassName } from "@/components/dashboard/popup-styles";
import { fieldClassName } from "@/components/shared/form-styles";
import { primaryButtonClassName } from "@/components/students/student-toolbar-styles";
import { Calendar } from "@/components/terms/calendar";
import { formatFieldDateTime, type LocalDateTime } from "@/lib/elections";
import type { IsoDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

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
    <nav aria-label="Create election steps">
      <ol className="flex flex-wrap items-center gap-y-2">
        {steps.map((label, index) => {
          const done = index < current || (index <= reached && index !== current && index < reached);
          const active = index === current;
          const reachable = index <= reached && !active;
          return (
            <li key={label} className="flex items-center">
              {index > 0 ? <span aria-hidden className="mx-2.5 h-px w-7 bg-[#e2e8f0] dark:bg-border" /> : null}
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
                  aria-hidden
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[0.625rem] transition-colors duration-300",
                    active
                      ? "bg-brand-blue text-white"
                      : done
                        ? "bg-brand-navy text-white dark:bg-white dark:text-brand-navy"
                        : "border border-[#d5dbe3] text-muted-foreground dark:border-border",
                  )}
                >
                  {done && !active ? <Check className="size-3" strokeWidth={2.6} /> : index + 1}
                </span>
                <span
                  className={cn(
                    "whitespace-nowrap transition-colors duration-300",
                    active || done ? "text-foreground" : "text-muted-foreground",
                    reachable && "group-hover/step:text-brand-blue",
                  )}
                >
                  {label}
                  {done && !active ? <span className="sr-only"> (done)</span> : null}
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

interface SectionCardProps {
  title: string;
  /** Right side of the header: a mono hint (string) or an action. */
  aside?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
}

export const cardClassName = "rounded-[0.375rem] border border-[#e2e8f0] bg-card dark:border-border";

export function SectionCard({ title, aside, children, bodyClassName }: SectionCardProps) {
  return (
    <section className={cardClassName}>
      <header className="flex min-h-12 items-center justify-between gap-3 border-b border-[#e2e8f0] px-5 py-2 dark:border-border">
        <h2 className="font-mono text-[0.6875rem] font-semibold tracking-[0.16em] text-foreground uppercase">{title}</h2>
        {typeof aside === "string" ? (
          <span className="truncate font-mono text-[0.65625rem] text-muted-foreground">{aside}</span>
        ) : (
          aside
        )}
      </header>
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

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
/*                                    Chip                                    */
/* -------------------------------------------------------------------------- */

export function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "inline-flex h-6.5 cursor-pointer items-center gap-1 rounded-full border px-3 text-[0.8125rem] whitespace-nowrap outline-none",
        "transition-[background-color,border-color,color,scale] duration-200 ease-out active:scale-95 focus-visible:ring-3 focus-visible:ring-brand-blue/20 motion-reduce:active:scale-100",
        selected
          ? "border-brand-navy bg-brand-navy text-white dark:border-white dark:bg-white dark:text-brand-navy"
          : "border-[#e2e8f0] bg-background text-foreground hover:border-[color-mix(in_oklab,var(--color-brand-muted)_45%,transparent)] dark:border-border",
      )}
    >
      {selected ? <Check aria-hidden className="size-3" strokeWidth={2.4} /> : null}
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
