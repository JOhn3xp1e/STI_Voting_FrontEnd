import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

import { env } from "@/config/env";

/**
 * Supabase client for a Route Handler: reads the auth cookies from the request
 * and writes refreshed ones onto `response`.
 *
 * Honours the browser's "Remember me" choice (see lib/supabase/client.ts):
 * without it, auth cookies are written without an expiry.
 */
export function createRouteClient(request: NextRequest, response: NextResponse) {
  const persist = request.cookies.get("slvp-remember")?.value !== "0";

  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll().map(({ name, value }) => ({ name, value })),
      setAll(cookies, headers) {
        for (const { name, value, options } of cookies) {
          const removing = options.maxAge === 0 || value === "";
          const lifetime = removing || persist ? {} : { maxAge: undefined, expires: undefined };
          response.cookies.set(name, value, { ...options, ...lifetime });
        }
        // Responses that set auth cookies must not be cached.
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });
}
