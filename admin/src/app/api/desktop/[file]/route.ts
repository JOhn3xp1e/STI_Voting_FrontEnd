import { NextResponse, type NextRequest } from "next/server";

import { LATEST_MANIFEST, RELEASE_FILE, releasesBucket } from "@/lib/desktop-release";

/**
 * GET: a file of the desktop builds, straight from R2: `latest.yml` (the updater's manifest) or an
 * installer. Public on purpose: the app only opens the portal's sign-in page. Supports single
 * `Range` requests and `If-None-Match`, so browsers can resume downloads.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/api/desktop/[file]">) {
  const { file } = await params;
  if (!RELEASE_FILE.test(file)) return NextResponse.json({ message: "Not found." }, { status: 404 });

  const bucket = await releasesBucket();
  if (!bucket) return NextResponse.json({ message: "Desktop builds aren't available here." }, { status: 503 });

  let object: Awaited<ReturnType<typeof bucket.get>>;
  try {
    object = await bucket.get(file, { range: request.headers, onlyIf: request.headers });
  } catch {
    // An unsatisfiable or multi-part Range.
    const size = (await bucket.head(file))?.size;
    return new NextResponse(null, { status: 416, headers: size === undefined ? {} : { "Content-Range": `bytes */${size}` } });
  }
  if (!object) return NextResponse.json({ message: "Not found." }, { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Accept-Ranges", "bytes");
  if (file === LATEST_MANIFEST) {
    headers.set("Content-Type", "text/yaml; charset=utf-8");
    headers.set("Cache-Control", "no-cache");
  } else {
    headers.set("Content-Type", "application/vnd.microsoft.portable-executable");
    headers.set("Content-Disposition", `attachment; filename="${file}"`);
    // Installers never change under the same (versioned) name.
    headers.set("Cache-Control", "public, max-age=86400");
  }

  // A failed precondition (If-None-Match matched): R2 returns the object without a body.
  if (!("body" in object)) return new NextResponse(null, { status: 304, headers });

  const range = object.range;
  if (range && request.headers.has("range")) {
    const offset = range.offset ?? (range.suffix !== undefined ? object.size - range.suffix : 0);
    const length = range.length ?? object.size - offset;
    headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set("Content-Length", String(length));
    return new NextResponse(object.body, { status: 206, headers });
  }

  headers.set("Content-Length", String(object.size));
  return new NextResponse(object.body, { status: 200, headers });
}
