import { NextResponse, type NextRequest } from "next/server";

import { PHOTO_TYPES, RouteCookies, checkEditorAccess, cloudflareBindings, sniffImageType } from "@/lib/photo-editor-route";
import { isUniformId, uniformPrompt, uniformReference } from "@/lib/uniforms";

/**
 * Uniform presets for the photo editor test page (`/photo-editor-test`).
 *
 * POST multipart/form-data:
 * - `image`: the candidate photo, at most 512 px on its long edge (the model's input limit)
 * - `uniform`: a preset id from lib/uniforms.ts, e.g. `it-pants`
 * - `width`, `height`: the size to generate (256–1920, multiples of 16)
 *
 * Redraws the candidate in that uniform with FLUX.2 [dev] on Workers AI (the
 * worker's `AI` binding), using the uniform's reference photo as image 1.
 * Responds with the new photo (JPEG or PNG).
 */

const MODEL = "@cf/black-forest-labs/flux-2-dev";
const MAX_INPUT_BYTES = 2 * 1024 * 1024;

interface AiApi {
  run(model: string, input: unknown): Promise<unknown>;
}
interface AssetsApi {
  fetch(input: Request | string | URL): Promise<Response>;
}

function sizeParam(value: FormDataEntryValue | null): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 256 && n <= 1920 && n % 16 === 0 ? n : null;
}

/** The uniform's reference photo from the static assets (or from the dev server). */
async function loadReference(path: string, request: NextRequest, assets: AssetsApi | undefined): Promise<Blob | null> {
  const url = new URL(path, request.nextUrl.origin);
  const fromAssets = await assets?.fetch(url).catch(() => null);
  const response = fromAssets?.ok ? fromAssets : await fetch(url).catch(() => null);
  return response?.ok ? response.blob() : null;
}

export async function POST(request: NextRequest) {
  const cookies = new RouteCookies();
  const denied = await checkEditorAccess(request, cookies);
  if (denied) return denied;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return cookies.fail(400, "Send the photo as multipart/form-data.");
  }
  const image = form.get("image");
  const uniform = form.get("uniform");
  const width = sizeParam(form.get("width"));
  const height = sizeParam(form.get("height"));
  if (!(image instanceof File)) return cookies.fail(400, "No photo was sent.");
  if (!PHOTO_TYPES.has(image.type)) return cookies.fail(415, "Use a PNG, JPG or WebP image.");
  if (!isUniformId(uniform)) return cookies.fail(400, "Unknown uniform.");
  if (!width || !height) return cookies.fail(400, "Width and height must be 256–1920 and multiples of 16.");
  // A 512 px photo is well under this; the model itself rejects larger dimensions.
  if (image.size > MAX_INPUT_BYTES) return cookies.fail(413, "Scale the photo down to 512 px on its long edge first.");

  const bindings = await cloudflareBindings();
  const ai = bindings.AI as AiApi | undefined;
  if (!ai) return cookies.fail(503, "Workers AI isn't available here. Run `npx wrangler login`, then restart `npm run dev`.");

  const reference = await loadReference(uniformReference(uniform), request, bindings.ASSETS as AssetsApi | undefined);
  if (!reference) return cookies.fail(500, "Couldn't load the uniform's reference photo.");

  const body = new FormData();
  body.append("input_image_0", image, "candidate");
  body.append("input_image_1", reference, "uniform.jpg");
  body.append("prompt", uniformPrompt(uniform));
  body.append("width", String(width));
  body.append("height", String(height));
  // Encoding through a Response gives the multipart stream and its boundary.
  const encoded = new Response(body);

  const started = Date.now();
  let base64: unknown;
  try {
    const result = (await ai.run(MODEL, {
      multipart: { body: encoded.body, contentType: encoded.headers.get("content-type") },
    })) as { image?: unknown };
    base64 = result?.image;
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return cookies.fail(502, `Workers AI couldn't apply the uniform: ${detail}`);
  }
  if (typeof base64 !== "string" || !base64) return cookies.fail(502, "Workers AI didn't return an image.");

  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return cookies.apply(
    new NextResponse(bytes, {
      headers: { "Content-Type": sniffImageType(bytes), "X-Processing-Ms": String(Date.now() - started) },
    }),
  );
}
