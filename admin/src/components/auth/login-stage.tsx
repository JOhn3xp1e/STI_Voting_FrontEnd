"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { createSpringEasing } from "@/lib/spring";
import { cn } from "@/lib/utils";

import styles from "./login-effects.module.css";

/** 1 = original composition (white card), 2 = alternate composition (form on the dark page). */
export type LoginVariant = 1 | 2;

/** Composition shown when the sign-in screen first loads. */
const INITIAL_VARIANT: LoginVariant = 2;

/** Colour / opacity cross-fades (keep in sync with `.stage[data-morphing]` in login-effects.module.css). */
const MORPH_MS = 950;
const REDUCED_MORPH_MS = 250;

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.closest("input, textarea, select, [contenteditable]") !== null;
}

/** Element rects keyed by `data-morph`, measured just before switching. */
type Snapshot = Map<string, DOMRect>;

function measure(root: HTMLElement): Snapshot {
  const rects: Snapshot = new Map();
  root.querySelectorAll<HTMLElement>("[data-morph]").forEach((el) => {
    rects.set(el.dataset.morph!, el.getBoundingClientRect());
  });
  return rects;
}

/**
 * Sign-in screen root. Press C (outside text fields) to morph between the two
 * compositions.
 *
 * - Styling for the alternate composition is plain CSS (`login-alt:` variant)
 *   keyed off `data-login-variant`; colours and surfaces cross-fade.
 * - Elements present in both layouts (`data-morph="…"`) glide between their
 *   positions and sizes with a FLIP animation driven by a spring easing.
 *
 * The form lives inside `children`, so switching never remounts it: typed
 * values and sign-in state are kept.
 */
export function LoginStage({ children, className }: { children: ReactNode; className?: string }) {
  const rootRef = useRef<HTMLElement>(null);
  const [variant, setVariant] = useState<LoginVariant>(INITIAL_VARIANT);

  const snapshotRef = useRef<Snapshot | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "c" && event.key !== "C") return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || event.defaultPrevented) return;
      if (isEditable(event.target)) return;

      const root = rootRef.current;
      if (!root || busyRef.current) return;
      // Not while credentials are being verified or the success transition plays.
      if (root.querySelector('[data-login-card]:not([data-auth-phase="idle"]), [data-login-card] [data-pending]')) return;

      busyRef.current = true;
      snapshotRef.current = measure(root);
      setVariant((current) => (current === 1 ? 2 : 1));
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Runs after the new composition is in the DOM, before paint: animate from the old rects.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const first = snapshotRef.current;
    snapshotRef.current = null;
    if (!root || !first) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    root.dataset.morphing = "";

    const animations: Animation[] = [];
    if (!reduceMotion) {
      const { easing, duration } = createSpringEasing();
      root.querySelectorAll<HTMLElement>("[data-morph]").forEach((el) => {
        const from = first.get(el.dataset.morph!);
        const to = el.getBoundingClientRect();
        if (!from || from.width === 0 || to.width === 0) return;

        const dx = from.left - to.left;
        const dy = from.top - to.top;
        const scale = from.width / to.width;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(scale - 1) < 0.005) return;

        animations.push(
          el.animate(
            [
              { transformOrigin: "0 0", transform: `translate(${dx}px, ${dy}px) scale(${scale})`, filter: "blur(0px)" },
              { transformOrigin: "0 0", filter: "blur(1.5px)", offset: 0.35 },
              { transformOrigin: "0 0", transform: "none", filter: "blur(0px)" },
            ],
            { duration, easing },
          ),
        );
      });
    }

    const settle = reduceMotion ? REDUCED_MORPH_MS : MORPH_MS;
    const timer = setTimeout(() => {
      delete root.dataset.morphing;
      busyRef.current = false;
    }, settle);

    // (The busy flag is only released by the timer, so a new key press can't
    // slip in between this cleanup and the next run.)
    return () => {
      clearTimeout(timer);
      animations.forEach((a) => a.finish());
      delete root.dataset.morphing;
    };
  }, [variant]);

  return (
    <main
      ref={rootRef}
      data-login-variant={variant}
      aria-keyshortcuts="C"
      className={cn("group/login", styles.stage, className)}
    >
      {children}
    </main>
  );
}
