import { NextResponse } from "next/server";

import { latestRelease, releasesBucket } from "@/lib/desktop-release";

/** GET: the newest desktop build (`DesktopRelease`), or 404 when none has been published. */
export async function GET() {
  const bucket = await releasesBucket();
  if (!bucket) return NextResponse.json({ message: "Desktop builds aren't available here (no DESKTOP_RELEASES binding)." }, { status: 503 });

  const release = await latestRelease(bucket);
  if (!release) return NextResponse.json({ message: "No desktop build has been published yet." }, { status: 404 });

  return NextResponse.json(release, { headers: { "Cache-Control": "no-store" } });
}
