/**
 * Sign-in ANIMATION PREVIEW (local development, or a demo deployment that opts in).
 *
 * This is a visual demonstration of the sign-in experience, NOT authentication:
 * it never looks at the credentials, never contacts the Web API, and never
 * creates a token, cookie or session. It only waits, so the loading, success
 * and dashboard-transition animations can be previewed before the backend exists.
 *
 * Enabled through `env.authDemoMode` (see `config/env.ts`).
 */

import { env } from "@/config/env";

/** Simulated time the "backend" takes to answer. */
export const SIGN_IN_PREVIEW_DELAY_MS = 2000;

export function simulateSignInPreview(signal?: AbortSignal): Promise<void> {
  // Defence in depth: never simulate unless the preview is explicitly enabled.
  if (!env.authDemoMode) {
    return Promise.reject(new Error("The sign-in preview is not enabled."));
  }

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(resolve, SIGN_IN_PREVIEW_DELAY_MS);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}
