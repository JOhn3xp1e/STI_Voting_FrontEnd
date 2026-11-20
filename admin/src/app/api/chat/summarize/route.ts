import { NextResponse, type NextRequest } from "next/server";

import { AiServiceError, callAiService } from "@/lib/ai-service";
import { RouteCookies, checkEditorAccess } from "@/lib/photo-editor-route";

/**
 * Owlie's running summary (see lib/chat-memory). Checks the admin here; the prompt and
 * the model live in the slvp-ai worker (../ai, POST /chat/summarize), reached through SLVP_AI.
 *
 * POST `{ summary?: string, turns: [{ role: "user" | "assistant", content }] }` → `{ summary }`
 */

const MAX_BODY_CHARS = 300_000;
const MAX_TURNS = 60;
const MAX_TURN_CHARS = 4000;
const MAX_SUMMARY_CHARS = 2000;

interface Turn {
  role: "user" | "assistant";
  content: string;
}

function readRequest(input: unknown): { summary: string; turns: Turn[] } | string {
  if (typeof input !== "object" || input === null) return "Send a JSON body.";
  const { summary, turns } = input as Record<string, unknown>;
  if (!Array.isArray(turns)) return "Send the messages to summarize in turns.";
  const read: Turn[] = [];
  for (const item of turns.slice(-MAX_TURNS)) {
    const { role, content } = (item ?? {}) as Record<string, unknown>;
    if ((role === "user" || role === "assistant") && typeof content === "string" && content.trim()) {
      read.push({ role, content: content.trim().slice(0, MAX_TURN_CHARS) });
    }
  }
  if (read.length === 0) return "Send the messages to summarize in turns.";
  return { summary: typeof summary === "string" ? summary.trim().slice(0, MAX_SUMMARY_CHARS) : "", turns: read };
}

export async function POST(request: NextRequest) {
  const cookies = new RouteCookies();
  const denied = await checkEditorAccess(request, cookies);
  if (denied) return denied;

  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS) return cookies.fail(413, "Too much data for one request.");
  let parsed: ReturnType<typeof readRequest>;
  try {
    parsed = readRequest(JSON.parse(raw));
  } catch {
    return cookies.fail(400, "Send a JSON body.");
  }
  if (typeof parsed === "string") return cookies.fail(400, parsed);

  try {
    const { summary } = await callAiService<{ summary: string }>("/chat/summarize", { body: parsed, signal: request.signal });
    return cookies.apply(NextResponse.json({ summary }));
  } catch (error) {
    if (request.signal.aborted) return cookies.fail(499, "Cancelled.");
    if (error instanceof AiServiceError) return cookies.fail(error.status, error.message);
    return cookies.fail(502, error instanceof Error ? error.message : "The AI couldn't summarize the chat.");
  }
}
