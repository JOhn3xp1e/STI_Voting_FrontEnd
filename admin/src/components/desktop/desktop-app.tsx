"use client";

import { useCallback, useEffect, useState } from "react";
import { AppWindow, Download, LoaderCircle, MonitorDown, QrCode, RefreshCw, ShieldAlert } from "lucide-react";

import styles from "@/components/shared/motion.module.css";
import { SettingRow, SettingsCard, rowListClassName, settingsPrimaryButtonClassName, settingsSecondaryButtonClassName } from "@/components/settings/settings-ui";
import { cn } from "@/lib/utils";
import type { DesktopRelease, DesktopUpdateCheck } from "@/types/desktop.types";

type ReleaseState =
  | { kind: "loading" }
  | { kind: "ready"; release: DesktopRelease }
  | { kind: "none"; message: string }
  | { kind: "error"; message: string };

const formatSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

function formatDate(iso: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(date);
}

function useLatestRelease() {
  const [state, setState] = useState<ReleaseState>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const response = await fetch("/api/desktop/latest", { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as (DesktopRelease & { message?: string }) | null;
      if (response.ok && body?.version) return setState({ kind: "ready", release: body });
      if (response.status === 404) return setState({ kind: "none", message: body?.message ?? "No desktop build has been published yet." });
      setState({ kind: "error", message: body?.message ?? `The server answered ${response.status}.` });
    } catch {
      setState({ kind: "error", message: "Couldn't reach the server. Check your connection." });
    }
  }, []);

  useEffect(() => {
    // Async: the state updates land after the fetch, not during the effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return { state, reload: load };
}

/** The running desktop app's version, or `null` in a browser. */
function useDesktopInfo() {
  const [info, setInfo] = useState<{ version: string } | null>(null);
  useEffect(() => {
    let live = true;
    window.slvpDesktop
      ?.getInfo()
      .then((result) => live && setInfo(result))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return info;
}

const UPDATE_MESSAGES: Record<DesktopUpdateCheck["status"], (check: DesktopUpdateCheck) => string> = {
  current: (c) => `You have the latest version (${c.version}).`,
  available: (c) => `Version ${c.version} is downloading. The app asks you to restart when it's ready.`,
  dev: () => "This is a development build, which doesn't update.",
  error: (c) => `Couldn't check for updates${c.message ? `: ${c.message}` : "."}`,
};

/** Shown inside the desktop app: its version and a "Check for updates" button. */
function InstalledPanel({ version }: { version: string }) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<DesktopUpdateCheck | null>(null);

  async function check() {
    setChecking(true);
    try {
      setResult(await window.slvpDesktop!.checkForUpdates());
    } catch {
      setResult({ status: "error", version });
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-[0.8125rem] font-medium text-foreground">You&rsquo;re using the desktop app · version {version}</p>
        <p role="status" className={cn("mt-0.5 text-xs", result?.status === "error" ? "text-destructive" : "text-muted-foreground")}>
          {result ? UPDATE_MESSAGES[result.status](result) : "It checks for updates on its own every few hours."}
        </p>
      </div>
      <button type="button" onClick={() => void check()} disabled={checking} className={cn(settingsSecondaryButtonClassName, "gap-2")}>
        {checking ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <RefreshCw aria-hidden className="size-4" strokeWidth={1.75} />}
        Check for updates
      </button>
    </div>
  );
}

/** The download button and the build's version, size and date. */
function DownloadPanel({ state, onRetry }: { state: ReleaseState; onRetry: () => void }) {
  if (state.kind === "loading") {
    return (
      <p role="status" className="flex items-center gap-2 text-[0.8125rem] text-muted-foreground">
        <LoaderCircle aria-hidden className="size-4 animate-spin" />
        Looking for the latest build…
      </p>
    );
  }
  if (state.kind !== "ready") {
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <p role={state.kind === "error" ? "alert" : "status"} className="min-w-0 flex-1 text-[0.8125rem] text-muted-foreground">
          {state.message}
        </p>
        <button type="button" onClick={onRetry} className={settingsSecondaryButtonClassName}>
          Check again
        </button>
      </div>
    );
  }

  const { release } = state;
  const date = formatDate(release.releaseDate);
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <a href="/api/desktop/download" download={release.fileName} className={cn(settingsPrimaryButtonClassName, "gap-2 self-start sm:self-auto")}>
        <Download aria-hidden className="size-4" strokeWidth={2} />
        Download for Windows
      </a>
      <p className="font-mono text-[0.71875rem] text-muted-foreground">
        Version {release.version} · {formatSize(release.size)}
        {date ? ` · ${date}` : null} · 64-bit installer
      </p>
    </div>
  );
}

/** Account → Desktop app: download the Windows app (or, inside it, check for updates). */
export function DesktopApp() {
  const { state, reload } = useLatestRelease();
  const installed = useDesktopInfo();

  return (
    <div className={cn("flex max-w-3xl flex-col gap-5 px-4 pt-4 pb-28 sm:px-6 lg:px-8", styles.riseIn)}>
      <section className="flex flex-col gap-5 rounded-[0.625rem] border border-border bg-card p-5 sm:flex-row sm:items-start sm:p-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/desktop-app-icon.png" alt="" width={64} height={64} className="size-16 shrink-0 rounded-xl" />
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div>
            <h2 className="text-[1.0625rem] font-semibold text-foreground">SLVP Admin for Windows</h2>
            <p className="mt-1 text-[0.8125rem] leading-5 text-muted-foreground">
              The admin portal in its own window, with a desktop shortcut. You sign in the same way and see the same data as in the
              browser.
            </p>
          </div>
          {installed ? <InstalledPanel version={installed.version} /> : <DownloadPanel state={state} onRetry={() => void reload()} />}
        </div>
      </section>

      <SettingsCard title="What you get" bodyClassName={rowListClassName}>
        <SettingRow
          icon={<AppWindow className="size-4 text-brand-navy/70" strokeWidth={1.75} />}
          title="Its own window"
          description="Opens where you left it. Links outside the portal open in your browser."
          control={null}
        />
        <SettingRow
          icon={<QrCode className="size-4 text-brand-navy/70" strokeWidth={1.75} />}
          title="Full-screen QR viewer"
          description="The election QR viewer opens full screen, for a kiosk or a second screen. Esc leaves full screen, F11 toggles it."
          control={null}
        />
        <SettingRow
          icon={<MonitorDown className="size-4 text-brand-navy/70" strokeWidth={1.75} />}
          title="Updates itself"
          description="New versions download in the background and install when you restart the app."
          control={null}
        />
      </SettingsCard>

      {installed ? null : (
        <SettingsCard title="Installing" meta="Windows 10 or 11, 64-bit">
          <ol className="list-decimal space-y-1.5 py-3 pl-4 text-[0.8125rem] leading-5 text-foreground">
            <li>Download the installer and open it.</li>
            <li>Choose where to install it, then finish. It adds a desktop and Start menu shortcut.</li>
            <li>Sign in with your admin account.</li>
          </ol>
          <p className="flex gap-2 border-t border-border py-3 text-xs leading-5 text-muted-foreground">
            <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
            <span>
              The installer isn&rsquo;t code-signed yet, so Windows may say &ldquo;Windows protected your PC&rdquo;. Choose{" "}
              <strong className="font-semibold text-foreground">More info</strong>, then{" "}
              <strong className="font-semibold text-foreground">Run anyway</strong>.
            </span>
          </p>
        </SettingsCard>
      )}
    </div>
  );
}
