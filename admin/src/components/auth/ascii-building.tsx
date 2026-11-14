"use client";

import { useEffect, useRef } from "react";

import { createBuildingScene } from "@/lib/building-scene";
import { cn } from "@/lib/utils";

type BuildingScene = ReturnType<typeof createBuildingScene>;

interface AsciiBuildingProps {
  className?: string;
  /** Slow orbit around the building (≈ one turn every 90 s). */
  autoRotate?: boolean;
  /** Stops rendering (e.g. while hidden) without tearing the scene down. */
  paused?: boolean;
  /** "isometric": orthographic camera fitted to the container. */
  projection?: "perspective" | "isometric";
  /** Glyph cell size in px (smaller = finer). */
  density?: number;
  /** Gap between glyph cells in px. */
  spacing?: number;
  /** Values above 1 pull the camera back (zoom out). */
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
  paused = false,
  projection = "perspective",
  density = 7,
  spacing = 0,
  distanceScale = 1,
}: AsciiBuildingProps) {
  const glRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<BuildingScene | null>(null);

  // Built once per layout-affecting setting; React Strict Mode's double mount in dev is safe thanks to dispose().
  useEffect(() => {
    const gl = glRef.current;
    const text = textRef.current;
    if (!gl || !text) return;

    let scene: BuildingScene | undefined;
    try {
      scene = createBuildingScene(gl, text, { theme: "gold", projection, density, spacing, distanceScale, view: "street", light: "noon" });
      sceneRef.current = scene;
    } catch (error) {
      // No WebGL: leave the area empty rather than breaking the sign-in page.
      console.error(error);
    }
    return () => {
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [projection, density, spacing, distanceScale]);

  // Declared after the creation effect, so they also run against a freshly built scene.
  useEffect(() => {
    sceneRef.current?.setAutoRotate(autoRotate);
  }, [autoRotate, projection, density, spacing, distanceScale]);
  useEffect(() => {
    sceneRef.current?.setPaused(paused);
  }, [paused, projection, density, spacing, distanceScale]);

  return (
    <div aria-hidden className={cn("relative overflow-hidden", className)}>
      <canvas ref={glRef} className="absolute inset-0 block size-full" />
      <canvas ref={textRef} className="absolute inset-0 block size-full" />
    </div>
  );
}
