import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/config/env";
import { DEV_SKIP_AUTH } from "@/lib/dev-auth";
import { createRouteClient } from "@/lib/supabase/server";

/* Shared pieces of the photo editor's API routes (they spend Cloudflare Images / Workers AI usage). */

export const PHOTO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/** Carries refreshed auth cookies onto whatever response the route sends. */
export class RouteCookies {
  readonly jar = new NextResponse();

  apply<T extends NextResponse>(response: T): T {
    for (const cookie of this.jar.cookies.getAll()) response.cookies.set(cookie);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  fail(status: number, message: string) {
    return this.apply(NextResponse.json({ message }, { status }));
  }
}

/**
 * Only signed-in admins (or anyone, under the local DEV_SKIP_AUTH shortcut).
 * Returns an error response to send, or `null` to go on.
 */
export async function checkEditorAccess(request: NextRequest, cookies: RouteCookies): Promise<NextResponse | null> {
  if (DEV_SKIP_AUTH) return null;
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    return cookies.fail(503, "Supabase isn't configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.");
  }
  const { data, error } = await createRouteClient(request, cookies.jar).auth.getUser();
  return error || !data.user ? cookies.fail(401, "Sign in to the admin dashboard first.") : null;
}

/** The worker's Cloudflare bindings (IMAGES, AI, ASSETS). */
export async function cloudflareBindings(): Promise<Record<string, unknown>> {
  const { env: bindings } = await getCloudflareContext({ async: true });
  return bindings as unknown as Record<string, unknown>;
}

/** Content type of PNG, JPEG or WebP bytes. */
export function sniffImageType(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57) return "image/webp";
  return "image/jpeg";
}
