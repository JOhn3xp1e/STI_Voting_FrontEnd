import { getCloudflareContext } from "@opennextjs/cloudflare";
import { connection } from "next/server";

import type { DesktopRelease } from "@/types/desktop.types";

/*
 * The desktop app's builds, in the R2 bucket `slvp-desktop` (binding DESKTOP_RELEASES).
 *
 * CI (.github/workflows/build-desktop.yml) uploads, per build, the installer
 * `SLVP-Admin-Setup-<version>.exe` and then `latest.yml`, electron-builder's description of the
 * newest build. The app's updater reads both through `/api/desktop/<file>`; the Desktop app page
 * reads `/api/desktop/latest` and downloads through `/api/desktop/download`.
 */

/** The part of an R2 object this code reads. */
export interface R2ObjectLike {
  size: number;
  etag: string;
  httpEtag: string;
  uploaded: Date;
  range?: { offset?: number; length?: number; suffix?: number };
  writeHttpMetadata(headers: Headers): void;
}
export interface R2ObjectBodyLike extends R2ObjectLike {
  body: ReadableStream<Uint8Array>;
  text(): Promise<string>;
}
/** The part of the R2 binding this code uses. */
export interface R2BucketLike {
  get(key: string, options?: { range?: Headers; onlyIf?: Headers }): Promise<R2ObjectBodyLike | R2ObjectLike | null>;
  head(key: string): Promise<R2ObjectLike | null>;
}

export const LATEST_MANIFEST = "latest.yml";

/** Files the routes serve: the manifest and installers (`SLVP-Admin-Setup-0.1.12.exe`). */
export const RELEASE_FILE = /^(latest\.yml|SLVP-Admin-Setup-\d+\.\d+\.\d+\.exe)$/;

/** The R2 bucket, or `null` without the binding. Also keeps the calling route out of build-time prerendering. */
export async function releasesBucket(): Promise<R2BucketLike | null> {
  await connection();
  const { env: bindings } = await getCloudflareContext({ async: true });
  return ((bindings as unknown as Record<string, unknown>).DESKTOP_RELEASES as R2BucketLike | undefined) ?? null;
}

const field = (yaml: string, name: string) => {
  const match = new RegExp(`^${name}:\\s*(.+)$`, "m").exec(yaml);
  return match ? match[1].trim().replace(/^['"]|['"]$/g, "") : null;
};

/** Reads electron-builder's latest.yml (`version`, `path`, `releaseDate`, `files[0].size`). */
export function parseManifest(yaml: string): Omit<DesktopRelease, "size"> & { size: number | null } | null {
  const version = field(yaml, "version");
  const fileName = field(yaml, "path");
  if (!version || !fileName || !RELEASE_FILE.test(fileName)) return null;
  const size = /^\s+size:\s*(\d+)/m.exec(yaml);
  return { version, fileName, size: size ? Number(size[1]) : null, releaseDate: field(yaml, "releaseDate") };
}

/** The newest build, or `null` when none has been uploaded (or the manifest is unreadable). */
export async function latestRelease(bucket: R2BucketLike): Promise<DesktopRelease | null> {
  const manifest = await bucket.get(LATEST_MANIFEST);
  if (!manifest || !("text" in manifest)) return null;
  const parsed = parseManifest(await manifest.text());
  if (!parsed) return null;
  const size = parsed.size ?? (await bucket.head(parsed.fileName))?.size ?? 0;
  return { ...parsed, size };
}
