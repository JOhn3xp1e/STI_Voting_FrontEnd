import { LIMITS, sanitizeSpec, type ConversionSpec, type NameSplit, type SpecRequest } from "@/lib/ai-convert-spec";

/*
 * "Convert with AI" <-> the admin app's own route (app/api/students/convert),
 * which holds the Groq key. Not the ASP.NET Web API.
 */

const ROUTE = "/api/students/convert";

async function call<T>(init: RequestInit): Promise<T> {
  const response = await fetch(ROUTE, { ...init, credentials: "same-origin", cache: "no-store" });
  const json = (await response.json().catch(() => null)) as (T & { message?: string }) | null;
  if (!response.ok || !json) throw new Error(json?.message ?? `The converter failed (HTTP ${response.status}).`);
  return json;
}

/** Whether GROQ_API_KEY is set. `null` when that couldn't be checked. */
export async function fetchConvertReady(signal?: AbortSignal): Promise<boolean | null> {
  try {
    return (await call<{ ready: boolean }>({ method: "GET", signal })).ready;
  } catch {
    return null;
  }
}

/** Groq's conversion rules, checked against the file's columns. */
export async function requestConversionSpec(body: Omit<SpecRequest, "task">, signal?: AbortSignal): Promise<ConversionSpec> {
  const json = await call<{ spec: unknown }>({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task: "spec", ...body }),
    signal,
  });
  return sanitizeSpec(json.spec, body.columns);
}

/** First / middle name splits, asked in batches; `onProgress` gets the names done so far. */
export async function requestNameSplits(names: readonly string[], onProgress: (done: number) => void, signal?: AbortSignal): Promise<Record<string, NameSplit>> {
  const out: Record<string, NameSplit> = {};
  for (let i = 0; i < names.length; i += LIMITS.names) {
    const batch = names.slice(i, i + LIMITS.names);
    const json = await call<{ splits: Record<string, NameSplit> }>({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: "names", names: batch }),
      signal,
    });
    Object.assign(out, json.splits);
    onProgress(Math.min(names.length, i + batch.length));
  }
  return out;
}
