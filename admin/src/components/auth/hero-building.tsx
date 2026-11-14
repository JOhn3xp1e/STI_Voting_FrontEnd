"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

import { cn } from "@/lib/utils";

import styles from "./login-effects.module.css";

/** Client-only: three.js (~600 kB) loads after the page, never on the server. */
const AsciiBuilding = dynamic(() => import("./ascii-building"), { ssr: false });

/**
 * Slowly rotating 3D ASCII model of the academic center, the sign-in
 * screen's artwork.
 *
 * One element serves both compositions: while typing (white card) it sits
 * above the headline in the branding column; with the form empty (dark page)
 * it spreads over the left three quarters of the page. `data-morph` lets the
 * composition switch glide it between the two, and the camera re-fits the
 * building to each size, so the scene is never rebuilt.
 */
export function HeroBuilding({ className }: { className?: string }) {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReducedMotion(motion.matches);
    const onChange = () => setReducedMotion(motion.matches);
    motion.addEventListener("change", onChange);
    return () => motion.removeEventListener("change", onChange);
  }, []);

  return (
    <div aria-hidden data-morph="map" className={cn("pointer-events-none select-none", className)}>
      <AsciiBuilding fit elevation={18} distanceScale={0.82} autoRotate={!reducedMotion} className={cn("size-full", styles.artFadeIn)} />
    </div>
  );
}
