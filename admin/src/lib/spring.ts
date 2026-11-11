/**
 * Spring easing for CSS / Web Animations, expressed as a `linear()` timing
 * function sampled from a damped spring (no animation library needed).
 */

interface SpringOptions {
  stiffness?: number;
  damping?: number;
  mass?: number;
  /** Number of sampled points in the `linear()` curve. */
  samples?: number;
}

export interface SpringEasing {
  easing: string;
  /** Time (ms) until the spring has visibly settled. */
  duration: number;
}

const FALLBACK = "cubic-bezier(0.22, 1, 0.36, 1)";

/** Position (0 → 1) of a unit spring released from rest at t seconds. */
function springAt(t: number, stiffness: number, damping: number, mass: number): number {
  const omega = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  if (zeta < 1) {
    const omegaD = omega * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * omega * t) * (Math.cos(omegaD * t) + ((zeta * omega) / omegaD) * Math.sin(omegaD * t));
  }
  // Critically / over-damped: no overshoot.
  return 1 - Math.exp(-omega * t) * (1 + omega * t);
}

/**
 * Default: a soft spring with ~1.5% overshoot that settles in ~0.9 s,
 * smooth rather than bouncy.
 */
export function createSpringEasing({ stiffness = 120, damping = 17.5, mass = 1, samples = 40 }: SpringOptions = {}): SpringEasing {
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const omega = Math.sqrt(stiffness / mass);
  // Settled when the envelope is within 0.1% of the target.
  const settle = Math.log(1000) / (Math.min(zeta, 1) * omega);
  const duration = Math.round(settle * 1000);

  const supportsLinear = typeof CSS !== "undefined" && CSS.supports("animation-timing-function", "linear(0, 1)");
  if (!supportsLinear) return { easing: FALLBACK, duration };

  const points: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const value = i === samples ? 1 : springAt((settle * i) / samples, stiffness, damping, mass);
    points.push(value.toFixed(4));
  }
  return { easing: `linear(${points.join(", ")})`, duration };
}
