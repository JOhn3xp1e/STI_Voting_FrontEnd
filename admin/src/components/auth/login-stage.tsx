"use client";

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { createSpringEasing } from "@/lib/spring";
import { cn } from "@/lib/utils";

import styles from "./login-effects.module.css";

/** 1 = original composition (white card), 2 = alternate composition (form on the dark page). */
export type LoginVariant = 1 | 2;

/** Composition shown when the sign-in screen first loads (empty form). */
const INITIAL_VARIANT: LoginVariant = 2;

/** Colour / opacity cross-fades (keep in sync with `.stage[data-morphing]` in login-effects.module.css). */
const MORPH_MS = 950;
const REDUCED_MORPH_MS = 250;

/** Element rects keyed by `data-morph`, measured just before switching. */
type Snapshot = Map<string, DOMRect>;

function measure(root: HTMLElement): Snapshot {
  const rects: Snapshot = new Map();
  root.querySelectorAll<HTMLElement>("[data-morph]").forEach((el) => {
    rects.set(el.dataset.morph!, el.getBoundingClientRect());
  });
  return rects;
}

interface LoginLayout {
  /** Composition on screen. */
  variant: LoginVariant;
  /** False while a morph is still animating. */
  settled: boolean;
  /** Asks for a composition; it morphs as soon as any running morph has finished. */
  requestVariant: (variant: LoginVariant) => void;
}

const LoginLayoutContext = createContext<LoginLayout | null>(null);

export function useLoginLayout(): LoginLayout {
  const layout = useContext(LoginLayoutContext);
  if (!layout) throw new Error("useLoginLayout must be used inside <LoginStage>.");
  return layout;
}

/**
 * Sign-in screen root. The card decides which composition to show (empty form
 * → dark page, typing → white card, signed in → dark again) through
 * `useLoginLayout().requestVariant`.
 *
 * - Styling for the alternate composition is plain CSS (`login-alt:` variant)
 *   keyed off `data-login-variant`; colours and surfaces cross-fade.
 * - Elements present in both layouts (`data-morph="…"`) glide between their
 *   positions and sizes with a FLIP animation driven by a spring easing.
 * - Requests made while a morph runs are queued: only the latest one is kept,
 *   and it starts when the current morph settles.
 *
 * The form lives inside `children`, so switching never remounts it: typed
 * values, focus and sign-in state are kept.
 */
export function LoginStage({
  children,
  className,
  initialVariant = INITIAL_VARIANT,
}: {
  children: ReactNode;
  className?: string;
  /** Composition to start in (the sign-in screen starts dark; the other auth screens start on the 3D building). */
  initialVariant?: LoginVariant;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const [variant, setVariant] = useState<LoginVariant>(initialVariant);
  const [settled, setSettled] = useState(true);

  const snapshotRef = useRef<Snapshot | null>(null);
  const busyRef = useRef(false);
  /** Composition currently shown (or being morphed to). */
  const shownRef = useRef<LoginVariant>(initialVariant);
  /** Latest requested composition. */
  const targetRef = useRef<LoginVariant>(initialVariant);

  /** Starts a morph towards the requested composition, unless one is already running. */
  const applyTarget = useCallback(() => {
    const root = rootRef.current;
    if (!root || busyRef.current || targetRef.current === shownRef.current) return;
    busyRef.current = true;
    snapshotRef.current = measure(root);
    shownRef.current = targetRef.current;
    setSettled(false);
    setVariant(targetRef.current);
  }, []);

  const requestVariant = useCallback(
    (next: LoginVariant) => {
      targetRef.current = next;
      applyTarget();
    },
    [applyTarget],
  );

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

    const timer = setTimeout(
      () => {
        delete root.dataset.morphing;
        busyRef.current = false;
        setSettled(true);
        // Someone typed or cleared the form while this morph ran: catch up.
        applyTarget();
      },
      reduceMotion ? REDUCED_MORPH_MS : MORPH_MS,
    );

    // (The busy flag is only released by the timer, so a new request can't
    // slip in between this cleanup and the next run.)
    return () => {
      clearTimeout(timer);
      animations.forEach((a) => a.finish());
      delete root.dataset.morphing;
    };
  }, [variant, applyTarget]);

  const layout = useMemo(() => ({ variant, settled, requestVariant }), [variant, settled, requestVariant]);

  return (
    <LoginLayoutContext.Provider value={layout}>
      <main ref={rootRef} data-login-variant={variant} className={cn("group/login", styles.stage, className)}>
        {children}
      </main>
    </LoginLayoutContext.Provider>
  );
}
