/**
 * Centralized access to environment variables.
 *
 * `NEXT_PUBLIC_*` variables are inlined into the client bundle at build time,
 * so they must be referenced with a literal `process.env.NAME` expression.
 * Everything in them is public: only put values here that are safe for any
 * visitor to read (the Supabase anon / publishable key is; the service-role
 * key is NOT and must never be added).
 */
export const env = {
  /** Base URL of the ASP.NET Core Web API, including `/api`, e.g. `https://slvp-api.kape-dev.workers.dev/api`. */
  apiUrl: process.env.NEXT_PUBLIC_API_URL?.trim() ?? "",

  /** Supabase project URL, e.g. `https://abcd.supabase.co`. */
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "",

  /** Supabase anon / publishable key (public by design; access is enforced by the backend and RLS). */
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "",
} as const;
