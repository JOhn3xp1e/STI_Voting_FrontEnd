"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** How long an item plays its exit animation before it's removed (matches `.rowOut` / `.cardOut`). */
const EXIT_MS = 240;

/**
 * Lets deleted rows / cards animate out before they leave the list.
 * `leave(ids, commit)` marks the ids as leaving (style them with `.rowOut`),
 * then runs `commit` (which removes them) once the animation has played.
 * Under reduced motion `commit` runs right away.
 */
export function useLeaving() {
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(() => new Set());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const leave = useCallback((ids: Iterable<string>, commit: () => void) => {
    const list = [...ids];
    if (list.length === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      commit();
      return;
    }
    setLeaving((current) => new Set([...current, ...list]));
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      commit();
      setLeaving((current) => new Set([...current].filter((id) => !list.includes(id))));
    }, EXIT_MS);
    timers.current.add(timer);
  }, []);

  return { leaving, leave };
}
