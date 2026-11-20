"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import styles from "./skeleton.module.css";

/** Length of one shimmer cycle (keep in sync with skeleton.module.css). */
const SWEEP_MS = 1900;
/** A skeleton mounting within this long after another one unmounted continues it (no second fade-in). */
const HANDOFF_MS = 400;

let mounted = 0;
let lastEndedAt = -Infinity;

/**
 * Keeps placeholders seamless when one hands over to another (route fallback →
 * page fetch, session check → page): the newcomer skips the fade-in, and every
 * sweep is phase-locked to the page clock so the shimmer never restarts.
 */
function useSkeletonContinuity() {
  const ref = useRef<HTMLDivElement>(null);
  // Only on the client; the first (hydrated) skeleton always fades in, as on the server.
  const [continues] = useState(() => typeof window !== "undefined" && (mounted > 0 || performance.now() - lastEndedAt < HANDOFF_MS));

  useLayoutEffect(() => {
    // Before paint, so the sweep is already in phase on the first frame.
    ref.current?.style.setProperty("--skeleton-phase", `${-(performance.now() % SWEEP_MS)}ms`);
    mounted += 1;
    return () => {
      mounted -= 1;
      lastEndedAt = performance.now();
    };
  }, []);

  return { ref, fadeClassName: continues ? undefined : styles.region };
}

interface SkeletonRegionProps {
  /** What is loading, for screen readers, e.g. "Loading students…". */
  label: string;
  /** Layout classes for the placeholder (usually the page's own wrapper classes). */
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * Wraps a page's placeholder: announces `label` to screen readers, hides the
 * shapes from assistive tech and the keyboard, and fades the whole thing in
 * after a short beat (fast responses never flash a skeleton).
 */
export function SkeletonRegion({ label, className, style, children }: SkeletonRegionProps) {
  const { ref, fadeClassName } = useSkeletonContinuity();
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="w-full min-w-0">
      <span className="sr-only">{label}</span>
      <div ref={ref} aria-hidden inert className={cn(fadeClassName, "pointer-events-none select-none", className)} style={style}>
        {children}
      </div>
    </div>
  );
}

/** Decorative placeholder outside a SkeletonRegion (e.g. the shell's sidebar): hidden from assistive tech, fades in the same way. */
export function SkeletonFade({ className, children }: { className?: string; children: ReactNode }) {
  const { ref, fadeClassName } = useSkeletonContinuity();
  return (
    <div ref={ref} aria-hidden inert className={cn(fadeClassName, "pointer-events-none select-none", className)}>
      {children}
    </div>
  );
}
