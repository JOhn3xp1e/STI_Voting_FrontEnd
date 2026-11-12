"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/*
 * Full-area loading state: a big percentage, a line of text and a thick bar.
 *
 * Requests don't report progress, so the number follows an easing curve that
 * moves quickly at first and slows as it nears 100 (it never claims to be
 * done). Loaders that hand over to each other (route fallback → page fetch)
 * continue from the same moment instead of restarting at 0%.
 */

/** Approach speed (ms) and ceiling of the simulated progress. */
const TIME_CONSTANT = 850;
const CEILING = 97;
/** A loader mounting within this long after the last one unmounted continues its progress. */
const HANDOFF_MS = 400;

let mounted = 0;
let startedAt = 0;
let lastEndedAt = -Infinity;

function progressAt(elapsed: number): number {
  return CEILING * (1 - Math.exp(-elapsed / TIME_CONSTANT));
}

interface PageLoadingProps {
  /** What is loading, for screen readers, e.g. "Loading elections…". */
  label: string;
  className?: string;
}

export function PageLoading({ label, className }: PageLoadingProps) {
  const valueRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // Drives the number and bar straight from the DOM each frame (no re-renders).
  useEffect(() => {
    const now = performance.now();
    if (mounted === 0 && now - lastEndedAt > HANDOFF_MS) startedAt = now;
    mounted += 1;

    let frame = 0;
    const tick = () => {
      const value = progressAt(performance.now() - startedAt);
      if (valueRef.current) valueRef.current.textContent = String(Math.floor(value));
      if (barRef.current) barRef.current.style.width = `${value}%`;
      frame = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(frame);
      mounted -= 1;
      lastEndedAt = performance.now();
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex min-h-80 flex-col items-center justify-center px-4 py-10 animate-in fade-in duration-300 motion-reduce:animate-none", className)}
    >
      <span className="sr-only">{label}</span>
      <div aria-hidden className="flex w-full max-w-[33.75rem] flex-col items-center">
        <p className="font-display text-[2rem] leading-10 font-semibold tracking-tight text-brand-navy tabular-nums dark:text-foreground">
          <span ref={valueRef}>0</span>%
        </p>
        <p className="mt-2 text-[0.9375rem] leading-6 text-foreground/80">Please wait while the page is loading</p>
        <div className="mt-4 h-2.5 w-full rounded-full bg-[#eef1f6] dark:bg-white/10">
          <div
            ref={barRef}
            style={{ width: "0%" }}
            className="h-full rounded-full bg-brand-navy shadow-[0_6px_14px_-5px_rgb(15_23_42/0.55)] dark:bg-white dark:shadow-none"
          />
        </div>
      </div>
    </div>
  );
}
