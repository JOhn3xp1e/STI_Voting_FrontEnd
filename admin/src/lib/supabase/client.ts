import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { env } from "@/config/env";

/**
 * Browser Supabase client. The session lives in cookies (so the
 * `/auth/callback` route handler can read and write it too) and is refreshed
 * automatically while a tab is open.
 *
 * "Remember me": when it's off, the auth cookies are written without an
 * expiry, so the browser drops them when it closes. The choice is stored in
 * its own cookie so it also applies to the token refreshes that follow.
 */

const REMEMBER_COOKIE = "slvp-remember";

/** Thrown when the Supabase environment variables are missing. */
export class SupabaseConfigError extends Error {
  constructor() {
    super(
      "Supabase isn't configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local and restart the dev server.",
    );
    this.name = "SupabaseConfigError";
  }
}

export function isSupabaseConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}

function readCookies(): { name: string; value: string }[] {
  if (!document.cookie) return [];
  return document.cookie.split("; ").map((pair) => {
    const index = pair.indexOf("=");
    const name = index === -1 ? pair : pair.slice(0, index);
    const raw = index === -1 ? "" : pair.slice(index + 1);
    let value = raw;
    try {
      value = decodeURIComponent(raw);
    } catch {
      // Keep the raw value if it isn't valid percent-encoding.
    }
    return { name, value };
  });
}

interface CookieWriteOptions {
  path?: string;
  domain?: string;
  maxAge?: number;
  expires?: Date;
  sameSite?: boolean | "lax" | "strict" | "none";
  secure?: boolean;
}

function writeCookie(name: string, value: string, options: CookieWriteOptions) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path ?? "/"}`];
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  const sameSite = options.sameSite === true ? "strict" : options.sameSite || "lax";
  parts.push(`SameSite=${sameSite[0]!.toUpperCase()}${sameSite.slice(1)}`);
  if (options.secure ?? location.protocol === "https:") parts.push("Secure");
  document.cookie = parts.join("; ");
}

function remembers(): boolean {
  // Defaults to remembering (Supabase's own behaviour) until the user chooses otherwise.
  return readCookies().find((c) => c.name === REMEMBER_COOKIE)?.value !== "0";
}

/** Stores the "Remember me" choice. Call it before signing in. */
export function setRememberSession(remember: boolean) {
  // The preference itself is kept for a year either way; it holds no secret.
  writeCookie(REMEMBER_COOKIE, remember ? "1" : "0", { maxAge: 60 * 60 * 24 * 365 });
}

let client: SupabaseClient | null = null;

/** The shared browser client. Throws `SupabaseConfigError` when the env variables are missing. */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  if (!isSupabaseConfigured()) throw new SupabaseConfigError();

  client = createBrowserClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: readCookies,
      setAll(cookies) {
        const persist = remembers();
        for (const { name, value, options } of cookies) {
          const removing = options.maxAge === 0 || value === "";
          // Session cookie (no expiry) unless the admin chose "Remember me". Removals keep Max-Age=0.
          const lifetime =
            removing || persist ? { maxAge: options.maxAge, expires: options.expires } : { maxAge: undefined, expires: undefined };
          writeCookie(name, value, {
            path: options.path,
            domain: options.domain,
            sameSite: options.sameSite,
            secure: options.secure,
            ...lifetime,
          });
        }
      },
    },
  });
  return client;
}
