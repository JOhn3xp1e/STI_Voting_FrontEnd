"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";

import { cn } from "@/lib/utils";

import styles from "./login-effects.module.css";

/** Loaded only when first switched on, so three.js (~600 kB) stays out of the sign-in bundle. */
const AsciiBuilding = dynamic(() => import("./ascii-building"), { ssr: false });

/** Shared props so both map layers resolve to the same (cached) image file. */
const MAP_IMAGE = {
  src: "/images/image1.png",
  width: 1319,
  height: 889,
  loading: "eager",
  sizes: "(min-width: 1440px) 860px, (min-width: 1024px) 60vw, 90vw",
} as const;

type MapArt = "image" | "building";

/** Remembers the viewer's choice between visits (best effort). */
const STORAGE_KEY = "slvp:login-art";

/** Key that switches between the static map and the rotating building. */
const TOGGLE_KEY = "c";

/** True while the user is typing somewhere, so the toggle key types normally. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.closest("input, textarea, select, [contenteditable]") !== null;
}

/**
 * Gold pixel-art map with a slow drift and a periodic light sweep, or (press
 * "C" anywhere outside the form) a slowly rotating 3D ASCII model of the
 * academic center in its place.
 *
 * The outer element is positioned (and FLIP-animated on the composition
 * switch); the inner one carries the drift animation, so they never fight
 * over `transform`. The image stays in the layout either way, so the box keeps
 * its size and the building simply fills it.
 */
export function MapIllustration({ className }: { className?: string }) {
  const [art, setArt] = useState<MapArt>("image");
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    try {
      // Restoring a saved preference after hydration: the server always renders the image.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(STORAGE_KEY) === "building") setArt("building");
    } catch {
      // Storage blocked (private window, etc.): keep the default.
    }

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(motion.matches);
    const onMotionChange = () => setReducedMotion(motion.matches);
    motion.addEventListener("change", onMotionChange);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== TOGGLE_KEY || event.repeat) return;
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;

      setArt((current) => {
        const next = current === "image" ? "building" : "image";
        try {
          localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // Not saved; the switch still works for this visit.
        }
        return next;
      });
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      motion.removeEventListener("change", onMotionChange);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const showBuilding = art === "building";

  return (
    <div aria-hidden data-morph="map" className={cn("pointer-events-none select-none", className)}>
      <div className={styles.mapFloat}>
        <div className={cn("transition-opacity duration-500", showBuilding && "opacity-0")}>
          <Image
            {...MAP_IMAGE}
            alt=""
            className="block w-full opacity-45 transition-opacity lg:opacity-55 lg:login-alt:opacity-75"
          />
          <div className={styles.mapSweepWindow}>
            <div className={styles.mapSweepInner}>
              <Image {...MAP_IMAGE} alt="" className="block w-full opacity-60" />
            </div>
          </div>
        </div>

        {/*
         * Mounted only while shown, so the WebGL loop never runs in the background.
         * Desktop alternate composition: the map's box runs off the bottom of the
         * page, so the building takes the box's upper, visible part instead.
         */}
        {showBuilding ? (
          <AsciiBuilding
            autoRotate={!reducedMotion}
            distanceScale={1.3}
            className={cn(
              "absolute inset-0 lg:login-alt:inset-auto lg:login-alt:inset-x-0 lg:login-alt:-top-[16%] lg:login-alt:h-[74%]",
              "opacity-60 transition-opacity lg:opacity-70 lg:login-alt:opacity-90",
              styles.artFadeIn,
            )}
          />
        ) : null}
      </div>
    </div>
  );
}
