import { apiClient } from "@/services/api/client";
import type { ChatTurn } from "@/lib/chat-memory";

/**
 * Owlie (SLVP-BE `Endpoints/ChatbotEndpoints.cs`).
 *
 * POST chatbot/ask `{ question, summary?, history? }` → `{ question, answer }`. Needs a signed-in
 * admin: super admins get answers about every election, election admins only about the elections
 * they're assigned to; anyone else gets 403 `{ message }`. `summary` and `history` are the
 * conversation so far (lib/chat-memory); a backend without them just ignores them.
 *
 * The running summary itself comes from the admin app's own route (app/api/chat/summarize),
 * which asks the slvp-ai worker. Not the ASP.NET Web API.
 */

const ROUTE = "chatbot/ask";
const SUMMARIZE_ROUTE = "/api/chat/summarize";

/** Answers can take a while to generate. */
const ASK_TIMEOUT_MS = 90_000;

interface AskOptions {
  summary?: string;
  history?: ChatTurn[];
  signal?: AbortSignal;
}

interface AskChatbotRequest {
  question: string;
  summary?: string;
  history?: ChatTurn[];
}

interface AskChatbotResponse {
  question: string;
  answer: string;
}

export async function askChatbot(question: string, { summary, history, signal }: AskOptions = {}): Promise<string> {
  const body: AskChatbotRequest = { question };
  if (summary) body.summary = summary;
  if (history?.length) body.history = history;
  const response = await apiClient.post<AskChatbotResponse, AskChatbotRequest>(
    ROUTE,
    body,
    // 401/403 here mean "no chatbot access", not an expired session: the panel explains it
    // instead of the global handler signing the admin out.
    { signal, timeoutMs: ASK_TIMEOUT_MS, skipAuthHandling: true },
  );
  return typeof response?.answer === "string" ? response.answer : "";
}

/** The updated running summary: `summary` (may be empty) plus `turns`. Throws when it couldn't be made. */
export async function summarizeChat(summary: string, turns: ChatTurn[], signal?: AbortSignal): Promise<string> {
  const response = await fetch(SUMMARIZE_ROUTE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ summary, turns }),
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  const json = (await response.json().catch(() => null)) as { summary?: unknown; message?: unknown } | null;
  if (!response.ok || typeof json?.summary !== "string" || !json.summary.trim()) {
    throw new Error(typeof json?.message === "string" ? json.message : `Couldn't summarize the chat (HTTP ${response.status}).`);
  }
  return json.summary.trim();
}
