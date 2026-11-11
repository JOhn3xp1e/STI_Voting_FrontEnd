"use client";

import { useEffect, useLayoutEffect, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

import {
  applyTheme,
  getAppliedTheme,
  getStoredTheme,
  getSystemTheme,
  resolveTheme,
  storeTheme,
  subscribeToAppliedTheme,
  subscribeToSystemTheme,
  type Theme,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

import { headerIconButtonClassName } from "./header-icon-button";

const getServerTheme = (): Theme => "light";

/** Light / dark switch. The initial theme is applied by the inline script in the root layout. */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribeToAppliedTheme, getAppliedTheme, getServerTheme);

  // Development only: Strict Mode's remount resets <html> attributes, clearing the
  // script-set theme. Re-apply before paint (a no-op in production).
  useLayoutEffect(() => {
    applyTheme(resolveTheme());
  }, []);

  // Follow OS changes until the user picks a theme explicitly.
  useEffect(
    () =>
      subscribeToSystemTheme(() => {
        if (!getStoredTheme()) applyTheme(getSystemTheme());
      }),
    [],
  );

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    storeTheme(next);
    applyTheme(next);
  }

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Light theme" : "Dark theme"}
      className={cn(headerIconButtonClassName, "overflow-hidden", className)}
    >
      {/* Both icons render; CSS (dark variant) cross-fades them, so the server HTML is always correct. */}
      <Sun
        aria-hidden
        strokeWidth={1.75}
        className="absolute transition-[opacity,rotate,scale] duration-500 ease-out dark:scale-50 dark:-rotate-90 dark:opacity-0 motion-reduce:transition-none"
      />
      <Moon
        aria-hidden
        strokeWidth={1.75}
        className="absolute scale-50 rotate-90 opacity-0 transition-[opacity,rotate,scale] duration-500 ease-out dark:scale-100 dark:rotate-0 dark:opacity-100 motion-reduce:transition-none"
      />
    </button>
  );
}
