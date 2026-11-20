"use client";

import { useSyncExternalStore } from "react";

/*
 * Where the admin dragged Owlie's launcher, remembered in this browser (localStorage; a
 * per-viewer convenience, so it falls back to memory when storage is blocked). `null` means
 * the design's default spot at the bottom-right, which CSS places.
 */

/** Top-left corner of the launcher box, in CSS pixels from the viewport's top-left. */
export interface LauncherPosition {
  x: number;
  y: number;
}

/** The launcher box (the owl's cap reaches CAP_OVERFLOW px above it). */
export const LAUNCHER_WIDTH = 69;
export const LAUNCHER_HEIGHT = 52;
const CAP_OVERFLOW = 22;
const MARGIN = 8;

const KEY = "slvp.chat.launcher";
const listeners = new Set<() => void>();
let memory: string | null = null;

function read(): string | null {
  try {
    return window.localStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("resize", listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("resize", listener);
    window.removeEventListener("storage", listener);
  };
}

/** Keeps the whole launcher (with its cap) inside the viewport. */
export function clampPosition({ x, y }: LauncherPosition, viewport = { width: window.innerWidth, height: window.innerHeight }): LauncherPosition {
  return {
    x: Math.round(Math.min(Math.max(x, MARGIN), Math.max(MARGIN, viewport.width - LAUNCHER_WIDTH - MARGIN))),
    y: Math.round(Math.min(Math.max(y, CAP_OVERFLOW + MARGIN), Math.max(CAP_OVERFLOW + MARGIN, viewport.height - LAUNCHER_HEIGHT - MARGIN))),
  };
}

function parse(raw: string | null): LauncherPosition | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { x?: unknown; y?: unknown };
    return typeof value.x === "number" && typeof value.y === "number" && Number.isFinite(value.x) && Number.isFinite(value.y) ? { x: value.x, y: value.y } : null;
  } catch {
    return null;
  }
}

/** Saves the spot, or forgets it (`null`) to go back to the default. */
export function saveLauncherPosition(position: LauncherPosition | null) {
  memory = position ? JSON.stringify(position) : null;
  try {
    if (memory) window.localStorage.setItem(KEY, memory);
    else window.localStorage.removeItem(KEY);
  } catch {
    // Blocked storage: kept in memory for this page only.
  }
  notify();
}

/** Viewport size as a string, so the snapshot only changes when the size does. */
const viewportSnapshot = () => `${window.innerWidth}x${window.innerHeight}`;

/**
 * The saved spot, clamped to the current viewport, plus the viewport size. Both are `null` while
 * server-rendering and on the first client render, so the markup matches the server's.
 */
export function useLauncherPosition(): { position: LauncherPosition | null; viewport: { width: number; height: number } | null } {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const size = useSyncExternalStore(subscribe, viewportSnapshot, () => null);
  if (!size) return { position: null, viewport: null };
  const [width, height] = size.split("x").map(Number);
  const saved = parse(raw);
  return { position: saved ? clampPosition(saved, { width, height }) : null, viewport: { width, height } };
}
