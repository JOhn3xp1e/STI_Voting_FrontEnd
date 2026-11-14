"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

import { cn } from "@/lib/utils";

import { useLoginArt } from "./login-art";
import styles from "./login-effects.module.css";
import { useLoginLayout } from "./login-stage";

/** Loaded only when first switched on, so three.js (~600 kB) stays out of the sign-in bundle. */
const AsciiBuilding = dynamic(() => import("./ascii-building"), { ssr: false });

/** Matches the composition cross-fade (MORPH_MS in login-stage.tsx), so rendering stops once it's invisible. */
const PAUSE_AFTER_MS = 1000;

/**
 * Large isometric ASCII building behind the dark composition (empty form),
 * covering the left three quarters of the page. While typing (white card)
 * it fades out and the static map comes back in its place (see MapIllustration).
 *
 * Mounted for as long as the building is chosen, so switching compositions
 * doesn't rebuild the scene; its render loop pauses while it's hidden.
 */
export function BuildingBackdrop({ className }: { className?: string }) {
  const art = useLoginArt();
  const { variant } = useLoginLayout();
  const [reducedMotion, setReducedMotion] = useState(false);
  const [paused, setPaused] = useState(false);

  const visible = variant === 2;

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

  if (art !== "building") return null;

  return (
    // Opacity is keyed off the composition in CSS, so it cross-fades in step with the morph.
    <div className={cn("opacity-0 transition-opacity login-alt:opacity-40 lg:login-alt:opacity-50", className)}>
      <AsciiBuilding
        projection="isometric"
        autoRotate={!reducedMotion}
        paused={paused}
        className={cn("size-full", styles.artFadeIn)}
      />
    </div>
  );
}
