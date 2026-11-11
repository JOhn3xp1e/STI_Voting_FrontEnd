"use client";

import { useEffect, useRef, useState } from "react";

const formatter = new Intl.NumberFormat("en-US");

interface AnimatedNumberProps {
  value: number;
  /** Starting value on mount (e.g. 0 for a count-up). Defaults to `value`: no mount animation. */
  from?: number;
  duration?: number;
  delay?: number;
  format?: (n: number) => string;
  className?: string;
}

/** Number that eases to its new value (ease-out cubic). Jumps straight there under reduced motion. */
export function AnimatedNumber({ value, from, duration = 700, delay = 0, format = formatter.format, className }: AnimatedNumberProps) {
  const [display, setDisplay] = useState(from ?? value);
  const currentRef = useRef(from ?? value);

  useEffect(() => {
    const start = currentRef.current;
    if (start === value) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let t0 = 0;

    const tick = (now: number) => {
      if (!t0) t0 = now + (reduced ? 0 : delay);
      const progress = reduced ? 1 : Math.min(1, Math.max(0, (now - t0) / duration));
      const eased = 1 - (1 - progress) ** 3;
      const next = Math.round(start + (value - start) * eased);
      currentRef.current = next;
      setDisplay(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, delay]);

  return <span className={className}>{format(display)}</span>;
}
