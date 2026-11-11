"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";


/**
 * Shared props for the two colour layers. They are `bglogin-glow.png` split
 * into its gold and its blue part, with a wide, soft hand-off between them;
 * added together they reproduce the original exactly.
 */
const LAYER = { fill: true, loading: "eager", sizes: "40vw" } as const;

/** Largest distance (px) each colour drifts away from the other. */
const SEPARATION = 14;
/** Extra drift following the cursor (px), stronger on the blue layer for depth. */
const PARALLAX = 6;
/** Easing time constant (ms): slow and smooth. */
const TAU = 480;
const SETTLE = 0.05;

type Vec = { x: number; y: number };

/**
 * Blue and gold glow of the alternate sign-in composition.
 *
 * When the cursor moves over the left side, the two colours gently drift apart
 * (gold up-left, blue down-right) so their blend separates, then glide back
 * together as the cursor leaves. Offsets are eased in a requestAnimationFrame
 * loop and written straight to `transform` (no React state); the loop stops
 * once the layers settle. Inactive on touch devices, with reduced motion, and
 * while the original composition is showing.
 */
export function GlowField({ className }: { className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const goldRef = useRef<HTMLDivElement>(null);
  const blueRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const gold = goldRef.current;
    const blue = blueRef.current;
    if (!root || !gold || !blue) return;

    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    // Targets / current values: separation amount (0..1) and cursor offset (-1..1).
    const target = { near: 0, offset: { x: 0, y: 0 } as Vec };
    const current = { near: 0, offset: { x: 0, y: 0 } as Vec };
    let frame = 0;
    let last = 0;

    const render = () => {
      const s = current.near * SEPARATION;
      const { x, y } = current.offset;
      gold.style.transform = `translate3d(${(-0.75 * s + x * PARALLAX * 0.55).toFixed(2)}px, ${(-0.55 * s + y * PARALLAX * 0.55).toFixed(2)}px, 0)`;
      blue.style.transform = `translate3d(${(0.6 * s + x * PARALLAX).toFixed(2)}px, ${(0.45 * s + y * PARALLAX).toFixed(2)}px, 0)`;
    };

    const tick = (now: number) => {
      const k = 1 - Math.exp(-Math.min(now - last, 64) / TAU);
      last = now;
      current.near += (target.near - current.near) * k;
      current.offset.x += (target.offset.x - current.offset.x) * k;
      current.offset.y += (target.offset.y - current.offset.y) * k;
      render();

      const settled =
        Math.abs(target.near - current.near) * SEPARATION < SETTLE &&
        Math.abs(target.offset.x - current.offset.x) * PARALLAX < SETTLE &&
        Math.abs(target.offset.y - current.offset.y) * PARALLAX < SETTLE;
      frame = settled ? 0 : requestAnimationFrame(tick);
    };

    const start = () => {
      if (frame) return;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };

    const release = () => {
      target.near = 0;
      target.offset = { x: 0, y: 0 };
      start();
    };

    const onPointerMove = (event: PointerEvent) => {
      const active = root.closest('[data-login-variant="2"]') !== null;
      if (!active || event.pointerType !== "mouse" || !finePointer.matches || reducedMotion.matches) return;

      const rect = root.getBoundingClientRect();
      if (rect.width === 0) return;
      const px = (event.clientX - rect.left) / rect.width; // 0 = left edge of the glow area
      const py = (event.clientY - rect.top) / rect.height;

      // Strongest over the glow itself (left ~40%), fading out towards the form.
      target.near = Math.max(0, Math.min(1, 1.25 - px * 1.6));
      target.offset = { x: Math.max(-1, Math.min(1, px * 2 - 1)), y: Math.max(-1, Math.min(1, py * 2 - 1)) };
      start();
    };

    const onMouseOut = (event: MouseEvent) => {
      if (!event.relatedTarget) release();
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("mouseout", onMouseOut);
    window.addEventListener("blur", release);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("mouseout", onMouseOut);
      window.removeEventListener("blur", release);
    };
  }, []);

  return (
    <div ref={rootRef} className={className}>
      {/*
       * Oversized by 1rem on every side (more than the largest drift) so drifting
       * never reveals an edge; the container's mask clips the overflow, and the
       * art is re-anchored 1rem in so it lines up where it was.
       *
       * The gold layer is added on top of the blue one (`plus-lighter`): the two
       * halves were split from one image, so adding them rebuilds the original
       * blend exactly, without a dark seam where they meet.
       */}
      <div ref={blueRef} className="absolute -inset-4 will-change-transform">
        <Image {...LAYER} alt="" src="/images/bglogin-split-blue.png" className="object-cover object-[1rem_center]" />
      </div>
      <div ref={goldRef} className="absolute -inset-4 mix-blend-plus-lighter will-change-transform">
        <Image {...LAYER} alt="" src="/images/bglogin-split-gold.png" className="object-cover object-[1rem_center]" />
      </div>
    </div>
  );
}
