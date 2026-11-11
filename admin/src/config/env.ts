/**
 * Centralized access to environment variables.
 *
 * `NEXT_PUBLIC_*` variables are inlined into the client bundle at build time,
 * so they must be referenced with a literal `process.env.NAME` expression.
 * Never place secrets in `NEXT_PUBLIC_*` variables.
 */
export const env = {
  /** Base URL of the ASP.NET Core Web API, e.g. `https://localhost:7001/api`. */
  apiUrl: process.env.NEXT_PUBLIC_API_URL?.trim() ?? "",

  /**
   * Sign-in ANIMATION PREVIEW — a visual demonstration only, not authentication.
   *
   * When on, "Sign in" waits ~2 seconds and then plays the success animation
   * and dashboard transition without contacting the Web API. No credentials
   * are checked, and no token or session is created.
   *
   * On only when BOTH hold:
   * - `NEXT_PUBLIC_AUTH_DEMO_MODE=true`, and
   * - the app runs with `next dev` (`NODE_ENV === "development"`).
   *
   * `next build` always compiles with `NODE_ENV=production`, so this is the
   * constant `false` in production bundles and the preview code is dropped.
   */
  authDemoMode:
    process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_AUTH_DEMO_MODE?.trim() === "true",
} as const;
