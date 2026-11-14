"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * The page's query string, read in the browser. `null` during prerendering
 * and the first (hydration) render.
 *
 * Used by the auth screens instead of `useSearchParams`, so their pages keep a
 * static shell without a Suspense boundary; they only read the URL once.
 */
export function useQueryParams(): URLSearchParams | null {
  const search = useSyncExternalStore(
    subscribe,
    () => window.location.search,
    () => null,
  );
  return search === null ? null : new URLSearchParams(search);
}
