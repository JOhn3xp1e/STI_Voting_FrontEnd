"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

import { cn } from "@/lib/utils";

import styles from "./login-effects.module.css";
import { useLoginLayout } from "./login-stage";

/** Client-only: three.js (~600 kB) loads after the page, never on the server. */
const AsciiBuilding = dynamic(() => import("./ascii-building"), { ssr: false });

/** Matches the composition cross-fade (MORPH_MS in login-stage.tsx), so rendering stops once it's invisible. */
const PAUSE_AFTER_MS = 1000;

/**
 * Large, slowly rotating 3D ASCII model of the academic center behind the
 * white-card composition (while typing), covering the left three quarters of
 * the page. With the form empty it fades out and the pixel map shows instead.
 *
 * Loaded with the page and kept mounted, so it's ready the moment the user
 * starts typing; its render loop only runs while it's visible.
 */
export function BuildingBackdrop({ className }: { className?: string }) {
  const { variant } = useLoginLayout();
  const visible = variant === 1;
  const [paused, setPaused] = useState(!visible);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReducedMotion(motion.matches);
    const onChange = () => setReducedMotion(motion.matches);
    motion.addEventListener("change", onChange);
    return () => motion.removeEventListener("change", onChange);
  }, []);

  // Resume at once when shown; pause only after the fade-out has finished.
  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPaused(false);
      return;
    }
    const timer = setTimeout(() => setPaused(true), PAUSE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  return (
    // Opacity is keyed off the composition in CSS, so it cross-fades in step with the morph.
    <div className={cn("opacity-40 transition-opacity lg:opacity-50 login-alt:opacity-0", className)}>
      <AsciiBuilding
        fit
        elevation={18}
        distanceScale={0.82}
        autoRotate={!reducedMotion}
        paused={paused}
        className={cn("size-full", styles.artFadeIn)}
      />
    </div>
  );
}
