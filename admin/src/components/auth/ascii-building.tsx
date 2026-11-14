"use client";

import { useEffect, useRef } from "react";

import { createBuildingScene } from "@/lib/building-scene";
import { cn } from "@/lib/utils";

interface AsciiBuildingProps {
  className?: string;
  /** Slow orbit around the building (≈ one turn every 90 s). */
  autoRotate?: boolean;
  /** Glyph cell size in px (smaller = finer). */
  density?: number;
  /** Gap between glyph cells in px. */
  spacing?: number;
  /** Values above 1 pull the camera back. */
  distanceScale?: number;
}

/**
 * The academic-center building in 3D, drawn as brand-gold ASCII glyphs on a
 * transparent layer (the page behind shows through). Purely decorative: no
 * controls, no pointer input. The parent decides the size.
 *
 * Load it with `next/dynamic` (`ssr: false`) so three.js stays out of the
 * main bundle.
 */
export default function AsciiBuilding({
  className,
  autoRotate = true,
  density = 7,
  spacing = 0,
  distanceScale = 1.15,
}: AsciiBuildingProps) {
  const glRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLCanvasElement>(null);

  // Created once; React Strict Mode's double mount in dev is safe thanks to dispose().
  useEffect(() => {
    const gl = glRef.current;
    const text = textRef.current;
    if (!gl || !text) return;

    let scene: ReturnType<typeof createBuildingScene> | undefined;
    try {
      scene = createBuildingScene(gl, text, { theme: "gold", density, spacing, distanceScale, view: "street", light: "noon" });
      scene.setAutoRotate(autoRotate);
    } catch (error) {
      // No WebGL: leave the area empty rather than breaking the sign-in page.
      console.error(error);
    }
    return () => scene?.dispose();
  }, [autoRotate, density, spacing, distanceScale]);

  return (
    <div aria-hidden className={cn("relative overflow-hidden", className)}>
      <canvas ref={glRef} className="absolute inset-0 block size-full" />
      <canvas ref={textRef} className="absolute inset-0 block size-full" />
    </div>
  );
}
