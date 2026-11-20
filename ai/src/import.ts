import { AiError, complete } from "./models";

/*
 * "Convert with AI" on the admin Students page. The admin app's /api/students/convert route
 * checks the admin and the request, calls these, and checks the rules that come back
 * (sanitizeSpec / sanitizeSplits in admin/src/lib/ai-convert-spec.ts).
 *
 * POST /import/spec   { fileName, columns, profiles, sample, instruction, context, previous?, adjustment? }
 * POST /import/names  { names: string[] }
 * Both respond { answer: <the model's JSON object>, model }.
 *
 * Only column names, a few sample rows, short value lists and given names are sent, never the whole file.
 */

const MAX_NAMES = 100;

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

interface SpecBody {
  fileName?: unknown;
  columns?: unknown;
  profiles?: unknown;
  sample?: unknown;
  instruction?: unknown;
  context?: unknown;
  previous?: unknown;
  adjustment?: unknown;
}

function specMessage(body: SpecBody): string {
  const payload: Record<string, unknown> = {
    file: body.fileName,
    columns: body.columns,
    columnProfiles: body.profiles,
    sampleRows: body.sample,
    catalog: body.context,
    adminInstructions: (typeof body.instruction === "string" && body.instruction) || "(none: infer the best conversion)",
  };
  if (body.previous) {
    payload.currentRules = body.previous;
    payload.adjustment = body.adjustment;
    return `Adjust the current rules as the admin asks, keep everything else, and reply with the full rules.
${JSON.stringify(payload)}`;
  }
  return JSON.stringify(payload);
}

export async function handleImportSpec(env: Env, body: unknown, signal: AbortSignal): Promise<Response> {
  if (typeof body !== "object" || body === null) throw new AiError(400, "Send the file summary as JSON.");
  const spec = body as SpecBody;
  if (!Array.isArray(spec.columns) || spec.columns.length === 0) throw new AiError(400, "The file has no columns.");
  const answer = await complete(env, {
    model: env.IMPORT_MODEL,
    messages: [
      { role: "system", content: SPEC_SYSTEM },
      { role: "user", content: specMessage(spec) },
    ],
    json: true,
    maxTokens: 8192,
    temperature: 0.1,
    signal,
  });
  return Response.json({ answer, model: env.IMPORT_MODEL });
}

export async function handleImportNames(env: Env, body: unknown, signal: AbortSignal): Promise<Response> {
  const names = (body as { names?: unknown } | null)?.names;
  if (!Array.isArray(names) || names.length === 0 || names.length > MAX_NAMES || !names.every((n) => typeof n === "string")) {
    throw new AiError(400, `Send 1–${MAX_NAMES} names.`);
  }
  const answer = await complete(env, {
    model: env.IMPORT_MODEL,
    messages: [
      { role: "system", content: NAMES_SYSTEM },
      { role: "user", content: JSON.stringify({ names }) },
    ],
    json: true,
    maxTokens: 8192,
    temperature: 0.1,
    signal,
  });
  return Response.json({ answer, model: env.IMPORT_MODEL });
}
