"use client";

import { useEffect, useRef } from "react";

import styles from "./login-effects.module.css";

/** Half the rendered sizes of `.glowCore` / `.glowAmbient` (px). */
const CORE_RADIUS = 260;
const AMBIENT_RADIUS = 560;
/** Easing time constants (ms): the core follows closely, the ambient light trails. */
const CORE_TAU = 90;
const AMBIENT_TAU = 280;
/** Distance (px) at which the glow counts as caught up and the loop stops. */
const SETTLE_DISTANCE = 0.5;

type Point = { x: number; y: number };

/**
 * Soft blue light that follows the mouse across the background.
 *
 * Positions are written straight to `transform` from a requestAnimationFrame
 * loop (no React state), and the loop stops once the glow catches up.
 * Inactive on touch devices and when the user prefers reduced motion.
 */
export function PointerGlow() {
  const rootRef = useRef<HTMLDivElement>(null);
  const ambientRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const ambient = ambientRef.current;
    const core = coreRef.current;
    const dots = dotsRef.current;
    if (!root || !ambient || !core || !dots) return;

    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const target: Point = { x: 0, y: 0 };
    const corePos: Point = { x: 0, y: 0 };
    const ambientPos: Point = { x: 0, y: 0 };
    let tracking = false;
    let frame = 0;
    let lastTime = 0;

    const render = () => {
      const coreX = corePos.x - CORE_RADIUS;
      const coreY = corePos.y - CORE_RADIUS;
      core.style.transform = `translate3d(${coreX}px, ${coreY}px, 0)`;
      // Counter-move the lit dots so they stay locked to the page's dot grid.
      dots.style.transform = `translate3d(${-coreX}px, ${-coreY}px, 0)`;
      ambient.style.transform = `translate3d(${ambientPos.x - AMBIENT_RADIUS}px, ${ambientPos.y - AMBIENT_RADIUS}px, 0)`;
    };

    const ease = (pos: Point, tau: number, dt: number) => {
      const k = 1 - Math.exp(-dt / tau);
      pos.x += (target.x - pos.x) * k;
      pos.y += (target.y - pos.y) * k;
    };

    const tick = (now: number) => {
      const dt = Math.min(now - lastTime, 64);
      lastTime = now;
      ease(corePos, CORE_TAU, dt);
      ease(ambientPos, AMBIENT_TAU, dt);
      render();

      const settled =
        Math.hypot(target.x - corePos.x, target.y - corePos.y) < SETTLE_DISTANCE &&
        Math.hypot(target.x - ambientPos.x, target.y - ambientPos.y) < SETTLE_DISTANCE;
      frame = settled ? 0 : requestAnimationFrame(tick);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !finePointer.matches || reducedMotion.matches) return;

      const rect = root.getBoundingClientRect();
      target.x = event.clientX - rect.left;
      target.y = event.clientY - rect.top;

      const width = `${rect.width}px`;
      const height = `${rect.height}px`;
      if (dots.style.width !== width) dots.style.width = width;
      if (dots.style.height !== height) dots.style.height = height;

      if (!tracking) {
        // Appear where the cursor enters instead of sweeping in from a stale spot.
        tracking = true;
        Object.assign(corePos, target);
        Object.assign(ambientPos, target);
        render();
      }

      const overCard = event.target instanceof Element && event.target.closest("[data-login-card]");
      root.dataset.state = overCard ? "card" : "background";

      if (!frame) {
        lastTime = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };

    const onLeave = () => {
      tracking = false;
      root.dataset.state = "idle";
    };
    const onMouseOut = (event: MouseEvent) => {
      if (!event.relatedTarget) onLeave();
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("mouseout", onMouseOut);
    window.addEventListener("blur", onLeave);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("mouseout", onMouseOut);
      window.removeEventListener("blur", onLeave);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      data-state="idle"
      className="absolute inset-0 opacity-0 transition-opacity duration-700 ease-out data-[state=background]:opacity-100 data-[state=card]:opacity-60 motion-reduce:hidden"
    >
      <div ref={ambientRef} className={styles.glowAmbient} />
      <div ref={coreRef} className={styles.glowCore}>
        <div ref={dotsRef} className={`bg-dot-grid ${styles.glowDots}`} />
      </div>
    </div>
  );
}
