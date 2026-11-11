import { useId } from "react";

import { cn } from "@/lib/utils";

import styles from "./success-check.module.css";

/**
 * Animated blue-and-gold success checkmark. Decorative: announce the outcome
 * separately (e.g. through a live region). Size it with `className`, e.g. `size-18`.
 * The animation plays when the element mounts.
 */
export function SuccessCheck({ className }: { className?: string }) {
  const gradientId = `${useId()}-success-ring`;

  return (
    <span aria-hidden className={cn(styles.root, className)}>
      <span className={styles.halo} />
      <span className={styles.wave} />
      <svg viewBox="0 0 64 64" className={styles.svg}>
        <defs>
          <linearGradient id={gradientId} x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
            <stop offset="0" style={{ stopColor: "var(--color-brand-blue)" }} />
            <stop offset="0.55" style={{ stopColor: "var(--color-brand-blue)" }} />
            <stop offset="1" style={{ stopColor: "var(--color-brand-gold)" }} />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r="29" className={styles.disc} />
        <circle cx="32" cy="32" r="29" className={styles.track} />
        <circle
          cx="32"
          cy="32"
          r="29"
          pathLength={1}
          transform="rotate(-90 32 32)"
          stroke={`url(#${gradientId})`}
          className={styles.ring}
        />
        <path
          d="M20.5 33 28.5 41 44 24.5"
          pathLength={1}
          style={{ stroke: "var(--color-brand-blue)" }}
          className={styles.tick}
        />
      </svg>
    </span>
  );
}
