/** The newest desktop build (`GET /api/desktop/latest`). */
export interface DesktopRelease {
  version: string;
  /** e.g. `SLVP-Admin-Setup-0.1.12.exe` */
  fileName: string;
  /** Installer size in bytes. */
  size: number;
  /** ISO date the build was made. */
  releaseDate: string | null;
}

/** Result of the desktop app's update check. */
export interface DesktopUpdateCheck {
  /** `dev`: an unpackaged build (`npm start`), which doesn't update. */
  status: "current" | "available" | "dev" | "error";
  version: string;
  message?: string;
}

/** What the desktop app's preload (`desktop/src/preload.js`) exposes as `window.slvpDesktop`. */
export interface DesktopBridge {
  getInfo(): Promise<{ version: string; platform: string } | null>;
  checkForUpdates(): Promise<DesktopUpdateCheck | null>;
}

declare global {
  interface Window {
    /** Present only inside the desktop app. */
    slvpDesktop?: DesktopBridge;
  }
}
