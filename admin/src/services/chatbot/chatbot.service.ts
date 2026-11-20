import { apiClient } from "@/services/api/client";

/**
 * STI Vote Buddy (SLVP-BE `Endpoints/ChatbotEndpoints.cs`).
 *
 * POST chatbot/ask `{ question }` → `{ question, answer }`. Needs a signed-in admin: super admins
 * get answers about every election, election admins only about the elections they're assigned to;
 * anyone else gets 403 `{ message }`.
 */

const ROUTE = "chatbot/ask";

/** Answers can take a while to generate. */
const ASK_TIMEOUT_MS = 90_000;

interface RequestOptions {
  signal?: AbortSignal;
}

interface AskChatbotRequest {
  question: string;
}

interface AskChatbotResponse {
  question: string;
  answer: string;
}

export async function askChatbot(question: string, { signal }: RequestOptions = {}): Promise<string> {
  const response = await apiClient.post<AskChatbotResponse, AskChatbotRequest>(
    ROUTE,
    { question },
    // 401/403 here mean "no chatbot access", not an expired session: the panel explains it
    // instead of the global handler signing the admin out.
    { signal, timeoutMs: ASK_TIMEOUT_MS, skipAuthHandling: true },
  );
  return typeof response?.answer === "string" ? response.answer : "";
}
