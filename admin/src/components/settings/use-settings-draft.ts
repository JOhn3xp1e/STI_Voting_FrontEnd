"use client";

import { useCallback, useState } from "react";

/**
 * Local, unsaved settings with Discard. The Email and Security tabs aren't
 * connected to the API yet, so nothing here is persisted.
 */
export function useSettingsDraft<T extends Record<string, unknown>>(initial: T) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);

  const update = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  }, []);

  const dirty = (Object.keys(draft) as (keyof T)[]).some((key) => draft[key] !== saved[key]);

  return {
    draft,
    update,
    dirty,
    discard: () => setDraft(saved),
    /** Keeps the current values as the baseline (after a save). */
    commit: () => setSaved(draft),
  };
}
