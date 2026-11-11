/**
 * Light / dark appearance for the dashboard.
 *
 * The active theme lives in `<html data-theme>`. An inline script in the root
 * layout sets it before the first paint (stored choice, else the system
 * preference), so there is no flash. Only regions marked `data-themed` react
 * to it — see the `dark` variant in `globals.css`.
 */

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "slvp-admin-theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Runs synchronously in `<head>`; keep it dependency-free and defensive. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t!=="light"&&t!=="dark"){t=window.matchMedia("${DARK_QUERY}").matches?"dark":"light"}document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

/** The theme the user explicitly chose, if any. */
export function getStoredTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

export function getSystemTheme(): Theme {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

/** Stored choice, falling back to the system preference. */
export function resolveTheme(): Theme {
  return getStoredTheme() ?? getSystemTheme();
}

/** Theme currently applied to the document. */
export function getAppliedTheme(): Theme {
  const value = document.documentElement.getAttribute("data-theme");
  return isTheme(value) ? value : "light";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
}

export function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage unavailable (private mode, blocked site data): the choice lasts for this page only.
  }
}

/** Notifies `onChange` whenever `data-theme` on `<html>` changes. */
export function subscribeToAppliedTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

/** Notifies `onChange` when the OS light/dark preference changes. */
export function subscribeToSystemTheme(onChange: () => void): () => void {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
