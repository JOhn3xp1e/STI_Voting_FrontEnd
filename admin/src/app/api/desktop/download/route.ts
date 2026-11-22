import { NextResponse, type NextRequest } from "next/server";

import { latestRelease, releasesBucket } from "@/lib/desktop-release";

/** GET: redirects to the newest installer (`/api/desktop/SLVP-Admin-Setup-<version>.exe`). */
export async function GET(request: NextRequest) {
  const bucket = await releasesBucket();
  const release = bucket ? await latestRelease(bucket) : null;
  if (!release) return NextResponse.json({ message: "No desktop build has been published yet." }, { status: 404 });

  const target = new URL(`/api/desktop/${encodeURIComponent(release.fileName)}`, request.nextUrl.origin);
  return NextResponse.redirect(target, { status: 302, headers: { "Cache-Control": "no-store" } });
}
