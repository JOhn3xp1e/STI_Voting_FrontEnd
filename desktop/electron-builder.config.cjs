/**
 * electron-builder settings (`npm run dist`).
 *
 * SLVP_ADMIN_URL (required) is the deployed admin portal, e.g. `https://slvp-admin.example.workers.dev`.
 * It is written into the packaged package.json (`slvp.adminUrl`), which the app loads at start, and
 * it is the base of the update feed: the admin Worker serves the R2 bucket `slvp-desktop` at
 * `<admin>/api/desktop/<file>` (latest.yml and the installer).
 */
const adminUrl = (process.env.SLVP_ADMIN_URL ?? "").trim().replace(/\/+$/, "");
if (!/^https?:\/\/[^/]+$/.test(adminUrl)) {
  throw new Error(
    "Set SLVP_ADMIN_URL to the admin portal's origin (e.g. https://slvp-admin.example.workers.dev) before packaging.",
  );
}

/** @type {import("electron-builder").Configuration} */
module.exports = {
  appId: "dev.kape.slvp.admin",
  productName: "SLVP Admin",
  copyright: "Kape.Dev",
  directories: { output: "dist", buildResources: "build" },
  files: ["src/**/*", "build/icon.png", "package.json"],
  extraMetadata: { slvp: { adminUrl } },
  // No spaces: the file name ends up in URLs (latest.yml, /api/desktop/<file>).
  artifactName: "SLVP-Admin-Setup-${version}.${ext}",
  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
    icon: "build/icon.png",
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "SLVP Admin",
    deleteAppDataOnUninstall: false,
  },
  // Writes latest.yml (and app-update.yml inside the app) for electron-updater.
  publish: [{ provider: "generic", url: `${adminUrl}/api/desktop/` }],
};
