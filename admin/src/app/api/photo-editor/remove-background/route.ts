import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/config/env";
import { createRouteClient } from "@/lib/supabase/server";

/**
 * Background removal for the photo editor test page (`/photo-editor-test`).
 *
 * POST multipart/form-data with an `image` (PNG, JPG or WebP). Responds with a
 * PNG of the same size where everything but the subject is transparent.
 *
 * Runs on Cloudflare Images (the worker's `IMAGES` binding) with
 * `segment: "foreground"`, Cloudflare's background-removal model. Only
 * signed-in admins can call it, so the endpoint can't be used by anyone on
 * the internet to spend our Images quota.
 */

const MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/** The part of the Cloudflare Images binding this route uses. */
interface ImageTransformer {
  transform(options: Record<string, unknown>): ImageTransformer;
  output(options: { format: "image/png" }): Promise<{ response(): Response }>;
}
interface ImagesApi {
  input(stream: ReadableStream<Uint8Array>): ImageTransformer;
}

function fail(status: number, message: string, cookies: NextResponse) {
  const response = NextResponse.json({ message }, { status, headers: { "Cache-Control": "no-store" } });
  for (const cookie of cookies.cookies.getAll()) response.cookies.set(cookie);
  return response;
}

export async function POST(request: NextRequest) {
  // Collects any refreshed auth cookies so they reach the browser.
  const cookies = new NextResponse();
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    return fail(503, "Supabase isn't configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.", cookies);
  }
  const { data, error: authError } = await createRouteClient(request, cookies).auth.getUser();
  if (authError || !data.user) return fail(401, "Sign in to the admin dashboard first.", cookies);

  let image: FormDataEntryValue | null;
  try {
    image = (await request.formData()).get("image");
  } catch {
    return fail(400, "Send the photo as multipart/form-data in an `image` field.", cookies);
  }
  if (!(image instanceof File)) return fail(400, "No photo was sent.", cookies);
  if (!IMAGE_TYPES.has(image.type)) return fail(415, "Use a PNG, JPG or WebP image.", cookies);
  if (image.size > MAX_BYTES) return fail(413, "The photo is over 10 MB.", cookies);

  const { env: bindings } = await getCloudflareContext({ async: true });
  const images = bindings.IMAGES as unknown as ImagesApi | undefined;
  if (!images) {
    return fail(503, "Cloudflare Images isn't available here. Run the app on Cloudflare (npm run deploy), or turn on the remote IMAGES binding for local dev.", cookies);
  }

  const started = Date.now();
  let result: Response;
  try {
    const output = await images.input(image.stream()).transform({ segment: "foreground" }).output({ format: "image/png" });
    result = output.response();
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return fail(502, `Cloudflare couldn't remove the background: ${detail}`, cookies);
  }

  const response = new NextResponse(result.body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
      "X-Processing-Ms": String(Date.now() - started),
    },
  });
  for (const cookie of cookies.cookies.getAll()) response.cookies.set(cookie);
  return response;
}
