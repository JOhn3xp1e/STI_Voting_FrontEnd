import { NextResponse, type NextRequest } from "next/server";

import { LIMITS, sanitizeSpec, sanitizeSplits, type ConvertRequest, type NamesRequest, type SpecRequest } from "@/lib/ai-convert-spec";
import { RouteCookies, checkEditorAccess, cloudflareBindings } from "@/lib/photo-editor-route";

/**
 * "Convert with AI" on the Students page, backed by Groq.
 *
 * GET: whether Groq is set up, `{ ready: boolean }`.
 *
 * POST JSON (see ConvertRequest in lib/ai-convert-spec.ts):
 * - `{ task: "spec", columns, profiles, sample, instruction, context, previous?, adjustment? }`
 *   → `{ spec }`: the rules the browser applies to every row.
 * - `{ task: "names", names }` → `{ splits }`: first / middle name splits for
 *   given names such as "ANGELINA KATE MILLENA" (no surnames or student numbers).
 *
 * The whole file never comes here: only column names, a few sample rows, short
 * value lists of repetitive columns, and given names.
 *
 * Settings, as Worker secrets (`npx wrangler secret put GROQ_API_KEY`) or in
 * `.dev.vars` / `.env.local` for `next dev`:
 * - GROQ_API_KEY: from console.groq.com → API Keys
 * - GROQ_MODEL (optional): a Groq chat model id, default `openai/gpt-oss-120b`
 */

const DEFAULT_MODEL = "openai/gpt-oss-120b";
const MAX_BODY_CHARS = 200_000;
const SETUP = "Add GROQ_API_KEY as a Worker secret (npx wrangler secret put GROQ_API_KEY), or to .env.local for npm run dev.";

async function loadSetup() {
  let bindings: Record<string, unknown> = {};
  try {
    bindings = await cloudflareBindings();
  } catch {
    // Outside the Workers runtime: process.env only.
  }
  const setting = (name: string) => {
    const value = bindings[name] ?? process.env[name];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  return { apiKey: setting("GROQ_API_KEY"), model: setting("GROQ_MODEL") ?? DEFAULT_MODEL };
}

/* -------------------------------------------------------------------------- */
/*                                   Prompts                                  */
/* -------------------------------------------------------------------------- */

const SPEC_SYSTEM = `You turn a school's class list into rules for the stiVote student import template. You never see the whole file: you get its column names, a few sample rows, a profile of each column, the school's catalog and the admin's instructions. Code applies your rules to every row, so be exact.

Template columns: student_no (11 digits, e.g. 02000799331), last_name, first_name, middle_name, career (career code), program (program code), year (a number), term (term id such as TRM-00004), email.

Reply with one JSON object and nothing else:
{
  "studentNo": Rule,
  "name": {"mode":"full","column":"<col>","order":"last_first" | "first_last"} or {"mode":"separate","last":"<col>","first":"<col>","middle":"<col>" | null},
  "titleCaseNames": true | false,
  "career": Rule, "program": Rule, "year": Rule, "term": Rule, "email": Rule,
  "generateEmailWhen": ["<cell value meaning no email>", ...],
  "changes": [{"column":"<col>","outputs":["<template column>", ...]}],
  "summary": "<one short sentence>"
}
Rule = {"column":"<col>" | null, "value":"<text>" | null, "regex":"<regex>" | null, "map":{"<cell value>":"<output>"} | null}

Rules:
- column: a column name copied exactly from the list. value: a fixed output for every row, or for rows where the column is blank.
- regex: a JavaScript regex run case-insensitively on the cell; capture group 1 is kept (the whole match without a group). Example: LEVEL "1Y1" means year 1, term 1, so year = {"column":"LEVEL","regex":"^(\\\\d+)"}.
- map: cell values (case-insensitive) to outputs, applied after the regex, e.g. {"BS Information Technology":"BSIT"}.
- Leave a rule all null when the file has nothing for it: career then comes from the program, term from the current term, and email is generated.
- name "full" when one column holds the whole name. "last_first" is "ACOSTA, ANGELINA KATE MILLENA" (surname first, comma optional); "first_last" is "Angelina Kate Millena Acosta". Code splits first and middle names itself.
- titleCaseNames: true when names are written in ALL CAPS or all lowercase.
- email: use the email column when it holds real addresses. Generated emails are lastname.<last 6 digits of the student no>@<emailDomain>. generateEmailWhen lists placeholder values such as "0", "n/a" or "none" (blank cells always count).
- changes: one entry per file column whose values you reshape, listing the template columns it feeds. Add fixed values (career, term) to the column the admin mentions them with, otherwise leave them out. Skip columns copied unchanged.
- Use only career codes, program codes and term ids from the catalog.
- The admin's instructions win over these defaults.`;

const NAMES_SYSTEM = `You split Filipino given names into first name and middle name. Each input is the part of a student's full name after the surname, e.g. "ANGELINA KATE MILLENA". In Philippine names the middle name is the mother's maiden surname and comes last; it can have particles ("DELA CRUZ", "DE LOS SANTOS"). First names are often two or more words ("ANGELINA KATE", "JOHN PAUL", "MA. CRISTINA", "JAN CLARENCE").

Reply with one JSON object and nothing else:
{"splits":[{"name":"<the input, exactly>","middle":"<the trailing word(s) that are the middle name, or empty>","sure":true | false}]}
- middle is copied exactly from the end of the input, or "" when every word is a given name.
- sure is false when you can't tell whether the last word is a surname or a given name.
- One entry per input, in the same order.`;

function specMessage(body: SpecRequest): string {
  const payload: Record<string, unknown> = {
    file: body.fileName,
    columns: body.columns,
    columnProfiles: body.profiles,
    sampleRows: body.sample,
    catalog: body.context,
    adminInstructions: body.instruction || "(none: infer the best conversion)",
  };
  if (body.previous) {
    payload.currentRules = body.previous;
    payload.adjustment = body.adjustment;
    return `Adjust the current rules as the admin asks, keep everything else, and reply with the full rules.\n${JSON.stringify(payload)}`;
  }
  return JSON.stringify(payload);
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
/*                                    Groq                                    */
/* -------------------------------------------------------------------------- */

class GroqError extends Error {}

async function askGroq(apiKey: string, model: string, system: string, user: string, signal: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_completion_tokens: 8192,
        response_format: { type: "json_object" },
        ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal,
    });
  } catch (cause) {
    throw new GroqError(`Couldn't reach Groq: ${cause instanceof Error ? cause.message : String(cause)}`);
  }

  const json = (await response.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string; code?: string };
  } | null;
  if (!response.ok) {
    const detail = json?.error?.message ?? `HTTP ${response.status}`;
    if (response.status === 401) throw new GroqError("Groq rejected the API key. Check GROQ_API_KEY.");
    if (response.status === 429) throw new GroqError("Groq is busy (rate limit reached). Wait a minute and try again.");
    if (response.status === 404 || json?.error?.code === "model_not_found" || json?.error?.code === "model_decommissioned") {
      throw new GroqError(`Groq doesn't offer the model "${model}" anymore. Set GROQ_MODEL to a current model from console.groq.com/docs/models.`);
    }
    throw new GroqError(`Groq couldn't convert the file: ${detail}`);
  }
  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new GroqError("Groq sent an empty answer. Try again.");
  try {
    return JSON.parse(content);
  } catch {
    throw new GroqError("Groq's answer wasn't valid JSON. Try again.");
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Handlers                                  */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const cookies = new RouteCookies();
  const denied = await checkEditorAccess(request, cookies);
  if (denied) return denied;
  const { apiKey, model } = await loadSetup();
  return cookies.apply(NextResponse.json({ ready: Boolean(apiKey), model }));
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

  const { apiKey, model } = await loadSetup();
  if (!apiKey) return cookies.fail(503, `Groq isn't set up. ${SETUP}`);

  try {
    if (parsed.task === "spec") {
      const answer = await askGroq(apiKey, model, SPEC_SYSTEM, specMessage(parsed), request.signal);
      try {
        return cookies.apply(NextResponse.json({ spec: sanitizeSpec(answer, parsed.columns) }));
      } catch (error) {
        return cookies.fail(422, error instanceof Error ? error.message : "Groq's rules couldn't be used.");
      }
    }
    const names = (parsed as NamesRequest).names;
    const answer = await askGroq(apiKey, model, NAMES_SYSTEM, JSON.stringify({ names }), request.signal);
    return cookies.apply(NextResponse.json({ splits: sanitizeSplits(answer, names) }));
  } catch (error) {
    if (request.signal.aborted) return cookies.fail(499, "Cancelled.");
    return cookies.fail(502, error instanceof Error ? error.message : "Groq couldn't convert the file.");
  }
}
