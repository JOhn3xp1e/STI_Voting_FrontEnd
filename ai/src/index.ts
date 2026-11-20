import { handleChat } from "./chat";
import { handleImportNames, handleImportSpec } from "./import";
import { AiError, modelReady } from "./models";

/**
 * slvp-ai: the AI behind SLVP, in one place (prompts, models and provider keys).
 *
 *   GET  /health        { ok: true }                       (no token; for uptime checks)
 *   GET  /status        which models are set up             (token)
 *   POST /chat          STI Vote Buddy (the backend)       (token)
 *   POST /import/spec   "Convert with AI" rules (admin)     (token)
 *   POST /import/names  first / middle name splits (admin)  (token)
 *
 * Every other request needs `Authorization: Bearer <AI_API_TOKEN>`. Callers check who the
 * signed-in user is; this worker only checks that the caller is one of ours.
 * Errors are JSON `{ message }`.
 */

const MAX_BODY_CHARS = 200_000;

type Handler = (env: Env, body: unknown, signal: AbortSignal) => Promise<Response>;

const POST_ROUTES: Record<string, Handler> = {
  "/chat": handleChat,
  "/import/spec": handleImportSpec,
  "/import/names": handleImportNames,
};

export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url);
    try {
      if (pathname === "/health" && request.method === "GET") return json(200, { ok: true });

      await checkToken(request, env);

      if (pathname === "/status" && request.method === "GET") {
        return json(200, {
          chat: { model: env.CHAT_MODEL, ready: modelReady(env, env.CHAT_MODEL) },
          import: { model: env.IMPORT_MODEL, ready: modelReady(env, env.IMPORT_MODEL) },
        });
      }

      const handler = POST_ROUTES[pathname];
      if (!handler) return json(404, { message: "Not found." });
      if (request.method !== "POST") return json(405, { message: "Use POST." });

      const raw = await request.text();
      if (raw.length > MAX_BODY_CHARS) return json(413, { message: "Too much data for one request." });
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        return json(400, { message: "Send a JSON body." });
      }
      const response = await handler(env, body, request.signal);
      response.headers.set("Cache-Control", "no-store");
      return response;
    } catch (error) {
      if (error instanceof AiError) return json(error.status, { message: error.message });
      console.error("slvp-ai failed", pathname, error);
      return json(500, { message: "The AI service ran into a problem. Try again." });
    }
  },
} satisfies ExportedHandler<Env>;

/** Constant-time check of the caller's bearer token. Fails closed when AI_API_TOKEN isn't set. */
async function checkToken(request: Request, env: Env): Promise<void> {
  const expected = env.AI_API_TOKEN?.trim();
  if (!expected) throw new AiError(503, "AI_API_TOKEN isn't set on the slvp-ai worker.");
  const header = request.headers.get("Authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(given)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  if (!given || !crypto.subtle.timingSafeEqual(a, b)) throw new AiError(401, "Missing or wrong AI_API_TOKEN.");
}

function json(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
