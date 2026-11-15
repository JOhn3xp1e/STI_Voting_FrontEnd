"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { fieldClassName } from "@/components/shared/form-styles";
import { Caret, OptionMenu, type Option } from "@/components/students/option-menu";
import { primaryButtonClassName, toolbarButtonClassName } from "@/components/students/student-toolbar-styles";
import { SETTINGS_LINKS } from "@/config/navigation";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*                                  Tab bar                                   */
/* -------------------------------------------------------------------------- */

const TABS = [
  { href: SETTINGS_LINKS.email, label: "Email" },
  { href: SETTINGS_LINKS.security, label: "Security" },
  { href: SETTINGS_LINKS.admins, label: "Admins" },
] as const;

/** Email · Security · Admins (one route each), with the page's actions on the right. */
export function SettingsTabs({ actions }: { actions?: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3 border-b border-border">
      <nav aria-label="Settings sections" className="-mb-px flex gap-6">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "border-b-2 px-1 pt-2.5 pb-3 text-[0.8125rem] whitespace-nowrap outline-none transition-colors duration-200",
                "focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-brand-blue/30",
                active
                  ? "border-brand-blue font-semibold text-brand-blue dark:border-[#7aa7e6] dark:text-[#7aa7e6]"
                  : "border-transparent font-medium text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {actions ? <div className="ml-auto flex items-center gap-2.5 pb-2">{actions}</div> : null}
    </div>
  );
}

/** Outlined action in the tab bar (Discard). */
export const settingsSecondaryButtonClassName = cn(
  toolbarButtonClassName,
  "h-9 px-4 text-[0.8125rem] font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-background",
);

/** Dark action in the tab bar (Save …, + Invite admin). */
export const settingsPrimaryButtonClassName = cn(primaryButtonClassName, "h-9 text-[0.8125rem]");

/* -------------------------------------------------------------------------- */
/*                                    Card                                    */
/* -------------------------------------------------------------------------- */

/** White card with a mono uppercase header ("SENDER", "ADMINS") and an optional note on the right. */
export function SettingsCard({
  title,
  meta,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const id = `card-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className={cn("min-w-0 rounded-[0.625rem] border border-border bg-card", className)}>
      <header className="flex items-center gap-2 border-b border-border px-5 py-4">
        <h2 id={id} className="font-mono text-[0.71875rem] font-medium tracking-[0.08em] text-foreground uppercase">
          {title}
        </h2>
        {meta ? <p className="ml-auto truncate pl-4 font-mono text-[0.65625rem] text-muted-foreground">{meta}</p> : null}
      </header>
      <div className={cn("px-5 py-1.5", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Rows separated by hairlines (settings, admins, invites). */
export const rowListClassName = "divide-y divide-border";

/** Title + description on the left, a control on the right. */
export function SettingRow({
  title,
  description,
  control,
  icon,
  labelId,
}: {
  title: string;
  description?: ReactNode;
  control: ReactNode;
  /** Logo tile on the left (sign-in methods). */
  icon?: ReactNode;
  /** Id of the title, so the control can point at it with `aria-labelledby`. */
  labelId?: string;
}) {
  return (
    <div className="flex items-center gap-4 py-3">
      {icon ? (
        <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-white">
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p id={labelId} className="text-[0.8125rem] font-medium text-foreground">
          {title}
        </p>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Controls                                  */
/* -------------------------------------------------------------------------- */

/** On/off switch (36 × 20). */
export function Switch({
  checked,
  onChange,
  labelledBy,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  labelledBy?: string;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative block h-5 w-9 cursor-pointer rounded-full outline-none transition-colors duration-200",
        "focus-visible:ring-3 focus-visible:ring-brand-blue/25 disabled:cursor-not-allowed disabled:opacity-60",
        checked ? "bg-brand-blue dark:bg-[#3b74c4]" : "bg-[#e4e8f0] dark:bg-white/15",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-[0_1px_2px_rgb(15_23_42/0.25)] transition-transform duration-200 ease-out motion-reduce:transition-none",
          checked && "translate-x-4",
        )}
      />
    </button>
  );
}

/** Compact dropdown ("30 minutes ▾") at the end of a setting row. */
export function SettingSelect<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
  /** Accessible name, e.g. the setting's title. */
  label: string;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <OptionMenu<T>
      label={label}
      value={value}
      options={options}
      onChange={(next) => next !== null && onChange(next)}
      align="end"
      triggerClassName={cn(toolbarButtonClassName, "h-8.5 gap-2 rounded-lg px-3 text-[0.8125rem] font-medium text-foreground")}
    >
      {current?.label ?? String(value)}
      <Caret />
    </OptionMenu>
  );
}

/** Field label in the settings cards (11 px semibold). */
export const settingsLabelClassName = "mb-1.5 block text-[0.6875rem] font-semibold text-foreground";

/** Labelled text input. */
export function SettingsTextField({
  id,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "email";
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={id} className={settingsLabelClassName}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(fieldClassName, "text-[0.8125rem]")}
      />
    </div>
  );
}

/** Labelled dropdown that fills its column (Daily send limit, Code expires after). */
export function SettingsSelectField<T extends string | number>({
  id,
  label,
  value,
  options,
  onChange,
  className,
}: {
  id: string;
  label: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <div className={cn("min-w-0", className)}>
      <span id={`${id}-label`} className={settingsLabelClassName}>
        {label}
      </span>
      <OptionMenu<T>
        id={id}
        label={label}
        value={value}
        options={options}
        onChange={(next) => next !== null && onChange(next)}
        triggerClassName={cn(fieldClassName, "cursor-pointer gap-1.5 text-[0.8125rem]")}
      >
        {current?.label ?? String(value)}
        <Caret />
      </OptionMenu>
    </div>
  );
}

/** Builds select options from plain labels. */
export function labelled<T extends string | number>(entries: readonly (readonly [T, string])[]): Option<T>[] {
  return entries.map(([value, label]) => ({ value, label }));
}
