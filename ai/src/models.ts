/**
 * One way to run a prompt on either provider:
 * - a model id starting with "@cf/" runs on Workers AI (the AI binding),
 * - any other id is a Groq model (needs the GROQ_API_KEY secret).
 */

export class AiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface ChatTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompleteOptions {
  model: string;
  messages: ChatTurn[];
  /** Ask for a JSON object and parse it. */
  json?: boolean;
  maxTokens: number;
  temperature: number;
  signal?: AbortSignal;
}

export const isWorkersAiModel = (model: string) => model.startsWith("@cf/");

/** Whether the model can run with the current settings. */
export function modelReady(env: Env, model: string): boolean {
  return isWorkersAiModel(model) || Boolean(env.GROQ_API_KEY?.trim());
}

/** The model's reply: text, or the parsed object when `json` is set. */
export async function complete(env: Env, options: CompleteOptions): Promise<unknown> {
  const text = isWorkersAiModel(options.model) ? await runWorkersAi(env, options) : await runGroq(env, options);
  if (!options.json) return text.trim();
  try {
    return JSON.parse(stripCodeFence(text));
  } catch {
    throw new AiError(502, "The model's answer wasn't valid JSON. Try again.");
  }
}

/* -------------------------------------------------------------------------- */
/*                                 Workers AI                                 */
/* -------------------------------------------------------------------------- */

async function runWorkersAi(env: Env, { model, messages, json, maxTokens, temperature }: CompleteOptions): Promise<string> {
  let result: unknown;
  try {
    // Any text-generation model takes `messages`; the cast only satisfies the per-model typings.
    result = await env.AI.run(model as "@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
      messages,
      max_tokens: maxTokens,
      temperature,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/model.*(not found|no such)|invalid model/i.test(message)) {
      throw new AiError(502, `Workers AI doesn't offer "${model}". Pick one from npx wrangler ai models.`);
    }
    if (/capacity|rate|429/i.test(message)) throw new AiError(429, "Workers AI is busy. Wait a moment and try again.");
    throw new AiError(502, `Workers AI couldn't answer: ${message}`);
  }
  const text = replyText(result);
  if (!text) throw new AiError(502, "Workers AI sent an empty answer. Try again.");
  return text;
}

/** Text of a Workers AI result, whichever response format the model uses. */
function replyText(result: unknown): string {
  if (typeof result === "string") return result;
  if (typeof result !== "object" || result === null) return "";
  const r = result as {
    response?: unknown;
    choices?: { message?: { content?: unknown } }[];
    output?: { type?: string; content?: { type?: string; text?: unknown }[] }[];
  };
  // Most models: { response }. In JSON mode it can already be an object.
  if (typeof r.response === "string") return r.response;
  if (r.response && typeof r.response === "object") return JSON.stringify(r.response);
  // OpenAI chat-completions style.
  const content = r.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  // OpenAI Responses style (e.g. gpt-oss on Workers AI).
  const parts = r.output?.filter((o) => o.type === "message").flatMap((o) => o.content ?? []) ?? [];
  return parts
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .join("")
    .trim();
}

/* -------------------------------------------------------------------------- */
/*                                    Groq                                    */
/* -------------------------------------------------------------------------- */

async function runGroq(env: Env, { model, messages, json, maxTokens, temperature, signal }: CompleteOptions): Promise<string> {
  const apiKey = env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new AiError(503, `"${model}" is a Groq model, but GROQ_API_KEY isn't set on the slvp-ai worker.`);

  let response: Response;
  try {
    response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature,
        max_completion_tokens: maxTokens,
        ...(json ? { response_format: { type: "json_object" } } : {}),
        ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
        messages,
      }),
      signal,
    });
  } catch (cause) {
    throw new AiError(502, `Couldn't reach Groq: ${cause instanceof Error ? cause.message : String(cause)}`);
  }

  const body = (await response.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string; code?: string };
  } | null;
  if (!response.ok) {
    if (response.status === 401) throw new AiError(502, "Groq rejected the API key. Check GROQ_API_KEY on the slvp-ai worker.");
    if (response.status === 429) throw new AiError(429, "Groq is busy (rate limit reached). Wait a minute and try again.");
    if (response.status === 404 || body?.error?.code === "model_not_found" || body?.error?.code === "model_decommissioned") {
      throw new AiError(502, `Groq doesn't offer the model "${model}" anymore. Pick a current one from console.groq.com/docs/models.`);
    }
    throw new AiError(502, `Groq couldn't answer: ${body?.error?.message ?? `HTTP ${response.status}`}`);
  }
  const content = body?.choices?.[0]?.message?.content;
  if (!content) throw new AiError(502, "Groq sent an empty answer. Try again.");
  return content;
}

/** Some models wrap JSON in ```json fences even in JSON mode. */
function stripCodeFence(text: string): string {
  const match = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i.exec(text);
  return match ? match[1] : text;
}
