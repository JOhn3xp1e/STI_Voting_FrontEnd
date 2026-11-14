"use client";

import Image from "next/image";

import { cn } from "@/lib/utils";

import { useLoginArt } from "./login-art";
import styles from "./login-effects.module.css";

/** Shared props so both map layers resolve to the same (cached) image file. */
const MAP_IMAGE = {
  src: "/images/image1.png",
  width: 1319,
  height: 889,
  loading: "eager",
  sizes: "(min-width: 1440px) 860px, (min-width: 1024px) 60vw, 90vw",
} as const;

/**
 * Gold pixel-art map with a slow drift and a periodic light sweep.
 * The outer element is positioned (and FLIP-animated on the composition
 * switch); the inner one carries the drift animation, so they never fight
 * over `transform`.
 *
 * With the building chosen (press "C"), the map gives way to the large
 * building in the dark composition and only shows while typing (white card).
 */
export function MapIllustration({ className }: { className?: string }) {
  const building = useLoginArt() === "building";

  return (
    <div aria-hidden data-morph="map" className={cn("pointer-events-none select-none", className)}>
      <div className={cn("transition-opacity", building && "login-alt:opacity-0")}>
        <div className={styles.mapFloat}>
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
      </div>
    </div>
  );
}
