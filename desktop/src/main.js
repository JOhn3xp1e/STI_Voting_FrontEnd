/**
 * SLVP Admin: the admin portal in its own window.
 *
 * The portal runs on Cloudflare (server routes for AI, the photo editor, …), so the app loads the
 * deployed site rather than bundling it. Its address comes from package.json (`slvp.adminUrl`,
 * set at packaging time from SLVP_ADMIN_URL; see electron-builder.config.cjs).
 *
 * - Pages of the portal and the sign-in providers open in the app; every other link opens in the
 *   default browser.
 * - The election QR viewer (`/elections/<id>/qr`) opens in its own full-screen window, for a
 *   kiosk or a second screen.
 * - Updates come from `<admin>/api/desktop/` (latest.yml + installer in R2).
 */
const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, screen, session, shell } = require("electron");
const { autoUpdater } = require("electron-updater");

const pkg = require("../package.json");

/* -------------------------------------------------------------------------- */
/*                                   Config                                   */
/* -------------------------------------------------------------------------- */

// SLVP_ADMIN_URL overrides the address in development (`npm start`) only.
const ADMIN_URL = new URL((!app.isPackaged && process.env.SLVP_ADMIN_URL?.trim()) || pkg.slvp.adminUrl);
const ADMIN_ORIGIN = ADMIN_URL.origin;

/** Hosts the sign-in flows pass through (Supabase auth, Google, Microsoft); they stay in the app. */
const SIGN_IN_HOSTS = [
  /(^|\.)supabase\.co$/,
  /(^|\.)google\.com$/,
  /(^|\.)gstatic\.com$/,
  /(^|\.)youtube\.com$/, // accounts.youtube.com sets Google's sign-in cookie
  /(^|\.)microsoftonline\.com$/,
  /(^|\.)live\.com$/,
  /(^|\.)microsoft\.com$/,
];

const QR_VIEWER = /^\/elections\/[^/]+\/qr\/?$/;
const ICON = path.join(__dirname, "..", "build", "icon.png");
const DARK_BACKGROUND = "#0b1430";

/** How often a running app looks for a new version. */
const UPDATE_CHECK_MS = 4 * 60 * 60 * 1000;

/* -------------------------------------------------------------------------- */
/*                                 URL policy                                 */
/* -------------------------------------------------------------------------- */

function parseUrl(raw) {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

const isAdminUrl = (url) => url?.origin === ADMIN_ORIGIN;
const isSignInUrl = (url) => url?.protocol === "https:" && SIGN_IN_HOSTS.some((host) => host.test(url.hostname));

/** Whether a page in the app may navigate to `raw` (otherwise it opens in the browser). */
function mayNavigate(raw) {
  const url = parseUrl(raw);
  return isAdminUrl(url) || isSignInUrl(url);
}

/** Opens http(s) and mailto links in the default browser / mail app; ignores everything else. */
function openExternal(raw) {
  const url = parseUrl(raw);
  if (url && ["http:", "https:", "mailto:"].includes(url.protocol)) void shell.openExternal(url.href);
}

/* -------------------------------------------------------------------------- */
/*                                Window state                                */
/* -------------------------------------------------------------------------- */

const statePath = () => path.join(app.getPath("userData"), "window-state.json");

function loadWindowState() {
  const fallback = { width: 1440, height: 900, maximized: false };
  try {
    const saved = JSON.parse(fs.readFileSync(statePath(), "utf8"));
    const { x, y, width, height } = saved;
    if (![x, y, width, height].every(Number.isFinite)) return fallback;
    // Skip a position on a monitor that has since been unplugged.
    const visible = screen.getAllDisplays().some(({ workArea: a }) => x < a.x + a.width && x + width > a.x && y < a.y + a.height && y + height > a.y);
    return visible ? { x, y, width, height, maximized: Boolean(saved.maximized) } : { width, height, maximized: Boolean(saved.maximized) };
  } catch {
    return fallback;
  }
}

function saveWindowState(win) {
  try {
    fs.writeFileSync(statePath(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }));
  } catch {
    // Not worth bothering anyone about.
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Windows                                   */
/* -------------------------------------------------------------------------- */

/** @type {BrowserWindow | null} */
let mainWindow = null;

const webPreferences = () => ({
  preload: path.join(__dirname, "preload.js"),
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  spellcheck: true,
});

/** Options of the QR viewer's window: full screen, dark, no menu bar. */
const kioskWindowOptions = () => ({
  fullscreen: true,
  autoHideMenuBar: true,
  backgroundColor: DARK_BACKGROUND,
  icon: ICON,
  webPreferences: webPreferences(),
});

/** Options of any other portal page opened in a new window. */
const childWindowOptions = () => ({
  width: 1280,
  height: 820,
  autoHideMenuBar: true,
  backgroundColor: nativeTheme.shouldUseDarkColors ? DARK_BACKGROUND : "#ffffff",
  icon: ICON,
  webPreferences: webPreferences(),
});

function createMainWindow() {
  const { maximized, ...bounds } = loadWindowState();
  const win = new BrowserWindow({
    ...bounds,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: "SLVP Admin",
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? DARK_BACKGROUND : "#ffffff",
    icon: ICON,
    webPreferences: webPreferences(),
  });

  win.once("ready-to-show", () => {
    if (maximized) win.maximize();
    win.show();
  });
  win.on("close", () => saveWindowState(win));
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  void win.loadURL(ADMIN_URL.href);
  mainWindow = win;
  return win;
}

function goHome() {
  if (!mainWindow) return createMainWindow();
  void mainWindow.loadURL(ADMIN_URL.href);
  focus(mainWindow);
}

function focus(win) {
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

/** Shows a "can't reach the portal" page with a Retry button when a page fails to load. */
function handleLoadFailures(contents) {
  contents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
    // -3: the load was aborted (a redirect or a new navigation), not a failure.
    if (!isMainFrame || code === -3) return;
    const retry = mayNavigate(url) ? url : ADMIN_URL.href;
    void contents.loadFile(path.join(__dirname, "offline.html"), { query: { url: retry, reason: description } });
  });
}

/** F11 toggles full screen and Esc leaves it (the QR viewer's window starts full screen). */
function handleFullScreenKeys(win) {
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "F11") {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    } else if (input.key === "Escape" && win.isFullScreen()) {
      win.setFullScreen(false);
    }
  });
}

/** Rules for every page in the app (main window, QR viewer, other windows). */
app.on("web-contents-created", (_event, contents) => {
  contents.on("will-navigate", (event, url) => {
    if (mayNavigate(url)) return;
    event.preventDefault();
    openExternal(url);
  });

  contents.setWindowOpenHandler(({ url }) => {
    const target = parseUrl(url);
    if (isAdminUrl(target)) {
      const options = QR_VIEWER.test(target.pathname) ? kioskWindowOptions() : childWindowOptions();
      return { action: "allow", overrideBrowserWindowOptions: options };
    }
    openExternal(url);
    return { action: "deny" };
  });

  contents.on("did-create-window", (win) => handleFullScreenKeys(win));
  contents.on("will-attach-webview", (event) => event.preventDefault());
  if (contents.getType() === "window") handleLoadFailures(contents);
});

/* -------------------------------------------------------------------------- */
/*                                  Updates                                   */
/* -------------------------------------------------------------------------- */

let promptedVersion = null;

function setUpUpdates() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  // Blockmaps aren't uploaded, so skip partial (differential) downloads.
  autoUpdater.disableDifferentialDownload = true;
  autoUpdater.disableWebInstaller = true;

  autoUpdater.on("update-downloaded", async (info) => {
    if (promptedVersion === info.version) return;
    promptedVersion = info.version;
    const { response } = await dialog.showMessageBox(mainWindow ?? undefined, {
      type: "info",
      title: "Update ready",
      message: `SLVP Admin ${info.version} is ready to install.`,
      detail: "Restart now to finish updating, or it installs the next time you close the app.",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });
  autoUpdater.on("error", (error) => console.error("Update check failed:", error?.message ?? error));

  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  void check();
  setInterval(check, UPDATE_CHECK_MS);
}

/**
 * Looks for a new version now.
 * @returns {Promise<{ status: "current" | "available" | "dev" | "error", version: string, message?: string }>}
 */
async function checkForUpdates() {
  const version = app.getVersion();
  if (!app.isPackaged) return { status: "dev", version };
  try {
    const result = await autoUpdater.checkForUpdates();
    if (result?.isUpdateAvailable) return { status: "available", version: result.updateInfo.version };
    return { status: "current", version };
  } catch (error) {
    return { status: "error", version, message: error instanceof Error ? error.message : String(error) };
  }
}

async function checkForUpdatesFromMenu() {
  const result = await checkForUpdates();
  const messages = {
    current: `You have the latest version (${result.version}).`,
    available: `Version ${result.version} is downloading. You'll be asked to restart when it's ready.`,
    dev: "Updates are off in development builds.",
    error: `Couldn't check for updates: ${result.message}`,
  };
  void dialog.showMessageBox(mainWindow ?? undefined, {
    type: result.status === "error" ? "warning" : "info",
    title: "Check for updates",
    message: messages[result.status],
  });
}

/* -------------------------------------------------------------------------- */
/*                                IPC (preload)                               */
/* -------------------------------------------------------------------------- */

/** Only the portal's own pages may call the app (the preload also runs on sign-in pages). */
function fromPortal(event) {
  return isAdminUrl(parseUrl(event.senderFrame?.url ?? ""));
}

ipcMain.handle("desktop:info", (event) => (fromPortal(event) ? { version: app.getVersion(), platform: process.platform } : null));
ipcMain.handle("desktop:check-updates", (event) => (fromPortal(event) ? checkForUpdates() : null));

/* -------------------------------------------------------------------------- */
/*                                    Menu                                    */
/* -------------------------------------------------------------------------- */

function focusedContents() {
  return BrowserWindow.getFocusedWindow()?.webContents ?? mainWindow?.webContents ?? null;
}

function buildMenu() {
  /** @type {Electron.MenuItemConstructorOptions[]} */
  const template = [
    {
      label: "&File",
      submenu: [
        { label: "Home", accelerator: "CmdOrCtrl+Shift+H", click: goHome },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { role: "editMenu" },
    {
      label: "&View",
      submenu: [
        {
          label: "Back",
          accelerator: "Alt+Left",
          click: () => {
            const history = focusedContents()?.navigationHistory;
            if (history?.canGoBack()) history.goBack();
          },
        },
        {
          label: "Forward",
          accelerator: "Alt+Right",
          click: () => {
            const history = focusedContents()?.navigationHistory;
            if (history?.canGoForward()) history.goForward();
          },
        },
        { type: "separator" },
        { role: "reload" },
        { role: "forceReload" },
        ...(app.isPackaged ? [] : [{ role: "toggleDevTools" }]),
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "&Help",
      submenu: [
        { label: "Check for updates…", click: () => void checkForUpdatesFromMenu() },
        { label: "Open in browser", click: () => openExternal(focusedContents()?.getURL() || ADMIN_URL.href) },
        { type: "separator" },
        {
          label: "About SLVP Admin",
          click: () =>
            void dialog.showMessageBox(mainWindow ?? undefined, {
              type: "info",
              title: "About SLVP Admin",
              message: `SLVP Admin ${app.getVersion()}`,
              detail: `Admin portal: ${ADMIN_ORIGIN}\nElectron ${process.versions.electron} · Chromium ${process.versions.chrome}`,
            }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* -------------------------------------------------------------------------- */
/*                                  Startup                                   */
/* -------------------------------------------------------------------------- */

// Google refuses sign-in from embedded browsers it recognises, so present as plain Chrome: drop
// `Electron/x` and the app's own token (`SLVPAdmin/x`, between "like Gecko)" and "Chrome/").
app.userAgentFallback = app.userAgentFallback
  .replace(/\sElectron\/\S+/, "")
  .replace(/(\(KHTML, like Gecko\))\s+(?!Chrome\/)\S+\/\S+/, "$1");

app.setAppUserModelId("dev.kape.slvp.admin");

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => (mainWindow ? focus(mainWindow) : createMainWindow()));

  app.whenReady().then(() => {
    // Camera, clipboard, notifications, …: only for the portal itself.
    session.defaultSession.setPermissionRequestHandler((contents, _permission, callback) => {
      callback(isAdminUrl(parseUrl(contents.getURL())));
    });
    session.defaultSession.setPermissionCheckHandler((_contents, _permission, requestingOrigin) => requestingOrigin === ADMIN_ORIGIN);

    buildMenu();
    const win = createMainWindow();
    handleFullScreenKeys(win);
    setUpUpdates();
  });

  app.on("window-all-closed", () => app.quit());
}
