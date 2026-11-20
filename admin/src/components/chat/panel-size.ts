"use client";

/*
 * The size the admin resized Owlie's panel to, remembered in this browser (localStorage; a
 * per-viewer convenience, so it falls back to memory when storage is blocked). `null` means the
 * design's default: 360 px wide, as tall as its content.
 */

export interface PanelSize {
  width: number;
  height: number;
}

export const DEFAULT_PANEL_WIDTH = 360;
export const MIN_PANEL_WIDTH = 300;
export const MAX_PANEL_WIDTH = 720;
export const MIN_PANEL_HEIGHT = 360;

const KEY = "slvp.chat.size";
let memory: string | null = null;

/** Keeps the panel between its minimum size and what fits in the viewport (16 px margins). */
export function clampPanelSize({ width, height }: PanelSize, viewport = { width: window.innerWidth, height: window.innerHeight }): PanelSize {
  const maxWidth = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, viewport.width - 32));
  const maxHeight = Math.max(MIN_PANEL_HEIGHT, viewport.height - 32);
  return {
    width: Math.round(Math.min(Math.max(width, MIN_PANEL_WIDTH), maxWidth)),
    height: Math.round(Math.min(Math.max(height, MIN_PANEL_HEIGHT), maxHeight)),
  };
}

export function loadPanelSize(): PanelSize | null {
  if (typeof window === "undefined") return null;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(KEY) ?? memory;
  } catch {
    raw = memory;
  }
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { width?: unknown; height?: unknown };
    return typeof value.width === "number" && typeof value.height === "number" && Number.isFinite(value.width) && Number.isFinite(value.height)
      ? { width: value.width, height: value.height }
      : null;
  } catch {
    return null;
  }
}

/** Saves the size, or forgets it (`null`) to go back to the default. */
export function savePanelSize(size: PanelSize | null) {
  memory = size ? JSON.stringify(size) : null;
  try {
    if (memory) window.localStorage.setItem(KEY, memory);
    else window.localStorage.removeItem(KEY);
  } catch {
    // Blocked storage: kept in memory for this page only.
  }
}
