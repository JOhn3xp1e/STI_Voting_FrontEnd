/**
 * One-time dashboard entrance played after signing in.
 *
 * The sign-in screen sets `data-dashboard-entrance` on <html> right before it
 * navigates; the dashboard shell's CSS animates only while the attribute is
 * present, and removes it once the entrance has finished. Driving it from an
 * attribute keeps it pure CSS (no React state, no extra renders), and a normal
 * visit to the dashboard never plays it.
 */

const ENTRANCE_ATTRIBUTE = "data-dashboard-entrance";

export function beginDashboardEntrance(): void {
  document.documentElement.setAttribute(ENTRANCE_ATTRIBUTE, "");
}

export function endDashboardEntrance(): void {
  document.documentElement.removeAttribute(ENTRANCE_ATTRIBUTE);
}
