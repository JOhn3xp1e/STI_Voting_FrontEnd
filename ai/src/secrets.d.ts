/*
 * Secrets aren't in wrangler.jsonc, so `wrangler types` only knows them from a local .dev.vars.
 * Declaring them here keeps the typecheck working in CI, where there is no .dev.vars.
 * (Same types as the generated ones, so the declarations merge with the global Env.)
 */
interface Env {
  /** Shared with the callers (admin worker, backend). */
  AI_API_TOKEN: string;
  /** Only needed for Groq models. */
  GROQ_API_KEY: string;
}
