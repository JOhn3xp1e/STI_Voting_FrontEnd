"use client";

import { useRef, useState } from "react";
import { Popover } from "@base-ui/react/popover";

import { popupClassName } from "@/components/dashboard/popup-styles";
import { formatDate, type IsoDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

import { Calendar } from "./calendar";
import { fieldClassName } from "./form-styles";

interface DatePickerProps {
  id: string;
  /** Accessible name, e.g. "Start date". */
  label: string;
  value: IsoDate | null;
  onChange: (date: IsoDate) => void;
  today: IsoDate;
  /** Shown (muted) when no date is picked; also where the calendar opens. */
  placeholder?: IsoDate | null;
  min?: IsoDate | null;
  max?: IsoDate | null;
  /** The term's other date, shaded in the calendar. */
  rangeStart?: IsoDate | null;
  rangeEnd?: IsoDate | null;
  invalid?: boolean;
  describedBy?: string;
  align?: "start" | "end";
  disabled?: boolean;
}

/** Input-styled trigger that opens the Calendar in a popover. */
export function DatePicker({
  id,
  label,
  value,
  onChange,
  today,
  placeholder,
  min,
  max,
  rangeStart,
  rangeEnd,
  invalid,
  describedBy,
  align = "start",
  disabled,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const focusTargetRef = useRef<HTMLButtonElement | null>(null);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        id={id}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={cn(fieldClassName, "cursor-pointer")}
      >
        <span className={cn("truncate transition-colors duration-200", !value && "text-muted-foreground")}>
          {value ? formatDate(value) : placeholder ? formatDate(placeholder) : "Pick a date"}
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align={align} sideOffset={6} collisionPadding={12} className="z-50 outline-none">
          <Popover.Popup
            data-themed
            initialFocus={focusTargetRef}
            className={cn(popupClassName, "w-[18.5rem] p-3 duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]")}
          >
            <Popover.Title className="sr-only">{label}</Popover.Title>
            <Calendar
              value={value}
              onSelect={(date) => {
                onChange(date);
                setOpen(false);
              }}
              today={today}
              min={min}
              max={max}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              fallback={placeholder}
              focusTargetRef={focusTargetRef}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
