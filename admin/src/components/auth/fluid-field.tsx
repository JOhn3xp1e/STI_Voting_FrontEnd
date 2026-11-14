"use client";

import { useEffect, useRef, useState } from "react";

import { createFluidSim, type FluidSim } from "@/lib/fluid-sim";

import { useLoginLayout } from "./login-stage";

/** Matches the composition cross-fade (MORPH_MS in login-stage.tsx), so the loop stops once it's invisible. */
const STOP_AFTER_MS = 1000;

/**
 * Blue and gold glow of the dark sign-in composition, as a live fluid
 * simulation: moving the mouse over it stirs the colours, which then drift
 * back into place. Gentle currents keep it moving on its own.
 *
 * Mouse only (no touch); with reduced motion it shows the resting
 * composition without animating. The loop runs only while the dark
 * composition is showing and the tab is visible. Without WebGL it falls back
 * to a static CSS gradient.
 */
export function FluidField({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<FluidSim | null>(null);
  const activeRef = useRef(false);
  const { variant } = useLoginLayout();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");

    let sim: FluidSim;
    try {
      sim = createFluidSim(canvas, { animate: !reducedMotion });
    } catch (error) {
      console.error(error);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFailed(true);
      return;
    }
    simRef.current = sim;
    sim.setRunning(activeRef.current && !document.hidden);

    // The layer itself ignores the pointer (the page content sits on top), so listen on the window.
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !finePointer.matches || !activeRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = 1 - (event.clientY - rect.top) / rect.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) {
        sim.pointerLeave();
        return;
      }
      sim.pointerMove(x, y);
    };
    const onMouseOut = (event: MouseEvent) => {
      if (!event.relatedTarget) sim.pointerLeave();
    };
    const onVisibility = () => sim.setRunning(activeRef.current && !document.hidden);

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("mouseout", onMouseOut);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("mouseout", onMouseOut);
      document.removeEventListener("visibilitychange", onVisibility);
      sim.dispose();
      simRef.current = null;
    };
  }, []);

  // Run while the dark composition shows; stop once it has faded out.
  useEffect(() => {
    if (variant === 2) {
      activeRef.current = true;
      simRef.current?.setRunning(!document.hidden);
      return;
    }
    activeRef.current = false;
    simRef.current?.pointerLeave();
    const timer = setTimeout(() => simRef.current?.setRunning(false), STOP_AFTER_MS);
    return () => clearTimeout(timer);
  }, [variant]);

  return (
    <div className={className}>
      {failed ? (
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_32%_42%_at_3%_20%,#f5bd0a_0%,transparent_75%),linear-gradient(90deg,#1557b8_12%,transparent_52%)]" />
      ) : (
        <canvas ref={canvasRef} className="absolute inset-0 block size-full" />
      )}
    </div>
  );
}
