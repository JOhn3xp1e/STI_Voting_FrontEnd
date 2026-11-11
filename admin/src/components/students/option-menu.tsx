"use client";

import type { ReactNode } from "react";
import { Menu } from "@base-ui/react/menu";
import { Check } from "lucide-react";

import { menuItemClassName, popupClassName } from "@/components/dashboard/popup-styles";
import { cn } from "@/lib/utils";

export interface Option<T extends string | number> {
  value: T;
  label: string;
  /** Secondary text on the right, e.g. a term's school year. */
  hint?: string;
}

interface OptionMenuProps<T extends string | number> {
  value: T | null;
  options: readonly Option<T>[];
  onChange: (value: T | null) => void;
  /** Trigger contents. */
  children: ReactNode;
  triggerClassName?: string;
  /** Adds a first "All …" option that clears the value. */
  clearLabel?: string;
  /** Accessible name of the trigger. */
  label: string;
  side?: "top" | "bottom";
  align?: "start" | "end" | "center";
  invalid?: boolean;
  id?: string;
}

const CLEAR = "__all__";

/** Small dropdown with single-choice options (filters, form selects, bulk "Set year"). */
export function OptionMenu<T extends string | number>({
  value,
  options,
  onChange,
  children,
  triggerClassName,
  clearLabel,
  label,
  side = "bottom",
  align = "start",
  invalid,
  id,
}: OptionMenuProps<T>) {
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger id={id} aria-label={label} aria-invalid={invalid || undefined} className={triggerClassName}>
        {children}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side={side} align={align} sideOffset={6} className="z-50 outline-none">
          <Menu.Popup data-themed className={cn(popupClassName, "max-h-80 min-w-(--anchor-width) overflow-y-auto p-1.5")}>
            <Menu.RadioGroup
              value={value === null ? CLEAR : String(value)}
              onValueChange={(next: string) => {
                if (next === CLEAR) return onChange(null);
                const option = options.find((o) => String(o.value) === next);
                if (option) onChange(option.value);
              }}
            >
              {clearLabel ? (
                <Menu.RadioItem value={CLEAR} closeOnClick className={cn(menuItemClassName, "h-8 pr-8")}>
                  {clearLabel}
                  <Menu.RadioItemIndicator className="absolute right-2.5">
                    <Check aria-hidden />
                  </Menu.RadioItemIndicator>
                </Menu.RadioItem>
              ) : null}
              {options.map((option) => (
                <Menu.RadioItem
                  key={option.value}
                  value={String(option.value)}
                  closeOnClick
                  className={cn(menuItemClassName, "relative h-8 gap-3 pr-8")}
                >
                  <span className="font-medium">{option.label}</span>
                  {option.hint ? <span className="ml-auto font-mono text-[0.6875rem] text-muted-foreground">{option.hint}</span> : null}
                  <Menu.RadioItemIndicator className="absolute right-2.5">
                    <Check aria-hidden />
                  </Menu.RadioItemIndicator>
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** The small "▾" caret used on dropdown triggers in the reference. */
export function Caret({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("-ml-0.5 text-[0.625rem] leading-none text-muted-foreground", className)}>
      ▾
    </span>
  );
}
