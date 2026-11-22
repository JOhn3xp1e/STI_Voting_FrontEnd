/**
 * Exposes `window.slvpDesktop` to the portal, so its pages can tell they run in the desktop app
 * (the Desktop app page shows the installed version and a "Check for updates" button).
 * The main process answers only the portal's own origin.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("slvpDesktop", {
  /** @returns {Promise<{ version: string, platform: string } | null>} */
  getInfo: () => ipcRenderer.invoke("desktop:info"),
  /** @returns {Promise<{ status: "current" | "available" | "dev" | "error", version: string, message?: string } | null>} */
  checkForUpdates: () => ipcRenderer.invoke("desktop:check-updates"),
});
