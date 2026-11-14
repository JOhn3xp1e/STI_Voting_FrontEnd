"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/** "image": the static gold pixel map. "building": the 3D ASCII academic center. */
export type LoginArt = "image" | "building";

/** Remembers the viewer's choice between visits (best effort). */
const STORAGE_KEY = "slvp:login-art";

/** Key that switches between the two. */
const TOGGLE_KEY = "c";

const LoginArtContext = createContext<LoginArt>("image");

/** Which artwork the sign-in screen shows. */
export function useLoginArt(): LoginArt {
  return useContext(LoginArtContext);
}

/** True while the user is typing somewhere, so the toggle key types normally. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.closest("input, textarea, select, [contenteditable]") !== null;
}

/**
 * Holds the sign-in artwork choice. Press "C" anywhere outside the form to
 * switch between the static map and the rotating building.
 */
export function LoginArtProvider({ children }: { children: ReactNode }) {
  const [art, setArt] = useState<LoginArt>("image");

  useEffect(() => {
    try {
      // Restoring a saved preference after hydration: the server always renders the image.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(STORAGE_KEY) === "building") setArt("building");
    } catch {
      // Storage blocked (private window, etc.): keep the default.
    }

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
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return <LoginArtContext.Provider value={art}>{children}</LoginArtContext.Provider>;
}
