import { NextResponse, type NextRequest } from "next/server";

import { PHOTO_TYPES, RouteCookies, checkEditorAccess, cloudflareBindings } from "@/lib/photo-editor-route";

/**
 * Background removal for the photo editor test page (`/photo-editor-test`).
 *
 * POST multipart/form-data with an `image` (PNG, JPG or WebP). Responds with a
 * PNG of the same size where everything but the subject is transparent.
 *
 * Runs on Cloudflare Images (the worker's `IMAGES` binding) with
 * `segment: "foreground"`, Cloudflare's background-removal model (BiRefNet).
 * In `next dev` the binding must be remote: Wrangler's local stand-in returns
 * the photo unchanged.
 */

const MAX_BYTES = 10 * 1024 * 1024;

/** The part of the Cloudflare Images binding this route uses. */
interface ImageTransformer {
  transform(options: Record<string, unknown>): ImageTransformer;
  output(options: { format: "image/png" }): Promise<{ response(): Response }>;
}
interface ImagesApi {
  input(stream: ReadableStream<Uint8Array>): ImageTransformer;
}

export async function POST(request: NextRequest) {
  const cookies = new RouteCookies();
  const denied = await checkEditorAccess(request, cookies);
  if (denied) return denied;

  let image: FormDataEntryValue | null;
  try {
    image = (await request.formData()).get("image");
  } catch {
    return cookies.fail(400, "Send the photo as multipart/form-data in an `image` field.");
  }
  if (!(image instanceof File)) return cookies.fail(400, "No photo was sent.");
  if (!PHOTO_TYPES.has(image.type)) return cookies.fail(415, "Use a PNG, JPG or WebP image.");
  if (image.size > MAX_BYTES) return cookies.fail(413, "The photo is over 10 MB.");

  const images = (await cloudflareBindings()).IMAGES as ImagesApi | undefined;
  if (!images) {
    return cookies.fail(503, "Cloudflare Images isn't available here. Run `npx wrangler login`, then restart `npm run dev`.");
  }

  const started = Date.now();
  let result: Response;
  try {
    const output = await images.input(image.stream()).transform({ segment: "foreground" }).output({ format: "image/png" });
    result = output.response();
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return cookies.fail(502, `Cloudflare couldn't remove the background: ${detail}`);
  }

  return cookies.apply(
    new NextResponse(result.body, {
      headers: { "Content-Type": "image/png", "X-Processing-Ms": String(Date.now() - started) },
    }),
  );
}
