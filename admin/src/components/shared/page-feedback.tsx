"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleAlert, CircleCheck, Info, Search, X } from "lucide-react";

import { toolbarButtonClassName } from "@/components/students/student-toolbar-styles";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*                              Loading / error                               */
/* -------------------------------------------------------------------------- */

export { PageLoading } from "./page-loader";

export function PageError({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-80 flex-col items-center justify-center gap-3 px-4 text-center">
      <CircleAlert aria-hidden className="size-6 text-destructive" strokeWidth={1.75} />
      <div>
        <p className="text-[0.9375rem] font-semibold text-foreground">{title}</p>
        <p role="alert" className="mt-1 max-w-md text-[0.8125rem] leading-5 text-muted-foreground">
          {message}
        </p>
      </div>
      <button type="button" onClick={onRetry} className={cn(toolbarButtonClassName, "h-8 px-3.5 text-[0.8125rem]")}>
        Try again
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Toast                                    */
/* -------------------------------------------------------------------------- */

export interface Notice {
  id: number;
  text: string;
  /** `info`: neutral notes, e.g. "isn't available yet". */
  tone: "success" | "error" | "info";
}

/** A self-dismissing notice (errors stay a little longer). */
export function useNotice() {
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), notice.tone === "error" ? 7000 : 3800);
    return () => clearTimeout(timer);
  }, [notice]);

  const say = useCallback((text: string, tone: Notice["tone"] = "success") => setNotice({ id: Date.now(), text, tone }), []);
  return { notice, say };
}

export function Toast({ notice }: { notice: Notice | null }) {
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-20 z-50 sm:right-6 sm:bottom-6">
      {notice ? (
        <p
          key={notice.id}
          data-themed
          role={notice.tone === "error" ? "alert" : undefined}
          className="flex max-w-sm animate-in items-start gap-2.5 rounded-lg border border-border bg-popover px-3.5 py-2.5 text-[0.8125rem] leading-5 text-popover-foreground shadow-[0_14px_36px_-14px_rgb(15_23_42/0.4)] duration-300 fade-in slide-in-from-bottom-2 motion-reduce:animate-none"
        >
          {notice.tone === "error" ? (
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
          ) : notice.tone === "info" ? (
            <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          ) : (
            <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-blue dark:text-[#7aa7e6]" />
          )}
          {notice.text}
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Search input                                */
/* -------------------------------------------------------------------------- */

/** Toolbar search box with a clear (×) button; Escape clears it. */
export function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (value: string) => void; placeholder: string; className?: string }) {
  return (
    <div className={cn("relative min-w-0 flex-1 sm:w-60 sm:flex-none", className)}>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.25 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.preventDefault();
            onChange("");
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(
          "h-8.5 w-full rounded-md border border-border bg-background pl-8.75 text-[0.875rem] text-foreground outline-none placeholder:text-muted-foreground",
          value ? "pr-8" : "pr-2",
          "transition-[border-color,box-shadow] duration-200 hover:border-[color-mix(in_oklab,var(--color-brand-muted)_38%,transparent)]",
          "focus:border-brand-blue/60 focus:ring-3 focus:ring-brand-blue/15 [&::-webkit-search-cancel-button]:hidden",
        )}
      />
      <button
        type="button"
        aria-label="Clear search"
        tabIndex={value ? 0 : -1}
        aria-hidden={!value}
        onClick={() => onChange("")}
        className={cn(
          "absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-muted-foreground",
          "transition-[opacity,scale,background-color,color] duration-200 hover:bg-muted hover:text-foreground",
          value ? "scale-100 opacity-100" : "pointer-events-none scale-75 opacity-0",
        )}
      >
        <X aria-hidden className="size-3.5" />
      </button>
    </div>
  );
}
