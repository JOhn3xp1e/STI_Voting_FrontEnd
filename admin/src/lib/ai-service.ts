import { cloudflareBindings } from "@/lib/photo-editor-route";

/*
 * Server-side calls to the slvp-ai worker (../ai) through the SLVP_AI service binding.
 * Needs the AI_API_TOKEN secret (same value as on slvp-ai): a Worker secret in production,
 * `.dev.vars` for `next dev`. Locally, run `npm run dev` in ../ai as well.
 */

const NOT_RUNNING = "The AI service (slvp-ai) isn't reachable. For local development, run `npm run dev` in the ai folder.";

interface ServiceBinding {
  fetch(input: string, init?: RequestInit): Promise<Response>;
}

/** Failure with the HTTP status to pass on and a message for the admin. */
export class AiServiceError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function connection(): Promise<{ binding: ServiceBinding; token: string }> {
  let bindings: Record<string, unknown> = {};
  try {
    bindings = await cloudflareBindings();
  } catch {
    // Outside the Workers runtime: no binding.
  }
  const binding = bindings.SLVP_AI as ServiceBinding | undefined;
  const token = [bindings.AI_API_TOKEN, process.env.AI_API_TOKEN].find((v): v is string => typeof v === "string" && v.trim() !== "")?.trim();
  if (!binding) throw new AiServiceError(503, NOT_RUNNING);
  if (!token) throw new AiServiceError(503, "AI_API_TOKEN isn't set on the admin app. Add it as a Worker secret, or to .dev.vars for npm run dev.");
  return { binding, token };
}

/** Calls slvp-ai and returns its JSON. Throws AiServiceError with slvp-ai's own message on failure. */
export async function callAiService<T>(path: string, init: { method?: "GET" | "POST"; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const { binding, token } = await connection();
  let response: Response;
  try {
    response = await binding.fetch(`https://slvp-ai${path}`, {
      method: init.method ?? "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init.signal,
    });
  } catch (cause) {
    if (init.signal?.aborted) throw cause;
    throw new AiServiceError(503, NOT_RUNNING);
  }

  const json = (await response.json().catch(() => null)) as (T & { message?: unknown }) | null;
  if (!response.ok) {
    // No JSON `{ message }`: the binding didn't reach slvp-ai (e.g. not started locally).
    if (typeof json?.message !== "string") throw new AiServiceError(503, NOT_RUNNING);
    if (response.status === 401) throw new AiServiceError(503, "slvp-ai refused the admin app's AI_API_TOKEN. Use the same value on both workers.");
    throw new AiServiceError(response.status >= 500 ? 502 : response.status, json.message);
  }
  if (json === null) throw new AiServiceError(502, "slvp-ai sent a response this app couldn't read.");
  return json;
}
