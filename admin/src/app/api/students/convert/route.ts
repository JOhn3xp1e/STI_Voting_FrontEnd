import { NextResponse, type NextRequest } from "next/server";

import { LIMITS, sanitizeSpec, sanitizeSplits, type ConvertRequest, type SpecRequest } from "@/lib/ai-convert-spec";
import { AiServiceError, callAiService } from "@/lib/ai-service";
import { RouteCookies, checkEditorAccess } from "@/lib/photo-editor-route";

/**
 * "Convert with AI" on the Students page. Checks the admin and the request here; the prompts
 * and the model live in the slvp-ai worker (../ai), reached through the SLVP_AI binding.
 *
 * GET: whether the AI is set up, `{ ready: boolean, model?: string, message?: string }`.
 *
 * POST JSON (see ConvertRequest in lib/ai-convert-spec.ts):
 * - `{ task: "spec", columns, profiles, sample, instruction, context, previous?, adjustment? }`
 *   → `{ spec }`: the rules the browser applies to every row.
 * - `{ task: "names", names }` → `{ splits }`: first / middle name splits for
 *   given names such as "ANGELINA KATE MILLENA" (no surnames or student numbers).
 *
 * The whole file never comes here: only column names, a few sample rows, short
 * value lists of repetitive columns, and given names.
 */

const MAX_BODY_CHARS = 200_000;

interface AiAnswer {
  answer: unknown;
}

/* -------------------------------------------------------------------------- */
/*                                 Validation                                 */
/* -------------------------------------------------------------------------- */

const strings = (value: unknown, max: number, chars: number): string[] | null =>
  Array.isArray(value) && value.length <= max && value.every((v) => typeof v === "string") ? value.map((v: string) => v.slice(0, chars)) : null;

function readRequest(input: unknown): ConvertRequest | string {
  if (typeof input !== "object" || input === null) return "Send a JSON body.";
  const body = input as Record<string, unknown>;
  if (body.task === "names") {
    const names = strings(body.names, LIMITS.names, LIMITS.nameChars);
    if (!names?.length) return `Send 1–${LIMITS.names} names.`;
    return { task: "names", names };
  }
  if (body.task !== "spec") return "Unknown task.";
  const columns = strings(body.columns, LIMITS.columns, 120);
  if (!columns?.length) return "The file has no columns.";
  const sample = Array.isArray(body.sample) ? body.sample.slice(0, LIMITS.sampleRows).map((row) => strings(row, LIMITS.columns, LIMITS.cellChars) ?? []) : [];
  const instruction = typeof body.instruction === "string" ? body.instruction.slice(0, LIMITS.instructionChars) : "";
  const adjustment = typeof body.adjustment === "string" ? body.adjustment.slice(0, LIMITS.instructionChars) : undefined;
  let previous = null;
  if (body.previous) {
    try {
      previous = sanitizeSpec(body.previous, columns);
    } catch {
      previous = null;
    }
  }
  return {
    task: "spec",
    fileName: typeof body.fileName === "string" ? body.fileName.slice(0, 120) : "file",
    columns,
    profiles: Array.isArray(body.profiles) ? (body.profiles.slice(0, LIMITS.columns) as SpecRequest["profiles"]) : [],
    sample,
    instruction,
    context: (typeof body.context === "object" && body.context !== null ? body.context : {}) as SpecRequest["context"],
    previous,
    adjustment,
  };
}

/* -------------------------------------------------------------------------- */
/*                                  Handlers                                  */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const cookies = new RouteCookies();
  const denied = await checkEditorAccess(request, cookies);
  if (denied) return denied;
  try {
    const status = await callAiService<{ import?: { ready?: boolean; model?: string } }>("/status", { method: "GET", signal: request.signal });
    return cookies.apply(NextResponse.json({ ready: Boolean(status.import?.ready), model: status.import?.model }));
  } catch (error) {
    return cookies.apply(NextResponse.json({ ready: false, message: error instanceof Error ? error.message : "The AI service isn't reachable." }));
  }
}

export async function POST(request: NextRequest) {
  const cookies = new RouteCookies();
  const denied = await checkEditorAccess(request, cookies);
  if (denied) return denied;

  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS) return cookies.fail(413, "Too much data for one request.");
  let parsed: ConvertRequest | string;
  try {
    parsed = readRequest(JSON.parse(raw));
  } catch {
    return cookies.fail(400, "Send a JSON body.");
  }
  if (typeof parsed === "string") return cookies.fail(400, parsed);

  try {
    if (parsed.task === "spec") {
      const { fileName, columns, profiles, sample, instruction, context, previous, adjustment } = parsed;
      const body = { fileName, columns, profiles, sample, instruction, context, previous, adjustment };
      const { answer } = await callAiService<AiAnswer>("/import/spec", { body, signal: request.signal });
      try {
        return cookies.apply(NextResponse.json({ spec: sanitizeSpec(answer, parsed.columns) }));
      } catch (error) {
        return cookies.fail(422, error instanceof Error ? error.message : "The AI's rules couldn't be used.");
      }
    }
    const { answer } = await callAiService<AiAnswer>("/import/names", { body: { names: parsed.names }, signal: request.signal });
    return cookies.apply(NextResponse.json({ splits: sanitizeSplits(answer, parsed.names) }));
  } catch (error) {
    if (request.signal.aborted) return cookies.fail(499, "Cancelled.");
    if (error instanceof AiServiceError) return cookies.fail(error.status, error.message);
    return cookies.fail(502, error instanceof Error ? error.message : "The AI couldn't convert the file.");
  }
}
