import type { ChatMessage } from "@/lib/chat";

/*
 * Owlie's memory.
 *
 * - The conversation is kept in this tab's sessionStorage, one entry per admin, so it survives
 *   reloads and page changes. Signing out clears it; closing the tab drops it.
 * - Earlier conversations (archiveChat, e.g. on New chat) are kept for the History list: up to
 *   MAX_PAST per admin, newest first, in the same sessionStorage.
 * - Every SUMMARY_EVERY question/answer pairs, those messages are folded into a running summary
 *   (slvp-ai's /chat/summarize, through app/api/chat/summarize). They stay on screen, marked
 *   `summarized`, but only the summary goes to the model from then on.
 * - Each question goes to the backend with the summary and the latest HISTORY_SENT messages that
 *   aren't in it yet.
 */

const KEY_PREFIX = "slvp.chat.";
const VERSION = 1;
/** Earlier conversations kept for the History list. */
const MAX_PAST = 20;
const TITLE_CHARS = 60;

/** Fold the conversation into the summary after this many question/answer pairs. */
export const SUMMARY_EVERY = 20;
/** At most this many pairs per summary (when an earlier summary failed and they piled up). */
const MAX_FOLDED = 30;
/** Messages since the last summary that go with each question. */
const HISTORY_SENT = 10;
/** Messages kept on screen and in storage; older ones are already in the summary. */
const MAX_KEPT = 200;
const MAX_TURN_CHARS = 4000;

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface SavedChat {
  summary: string;
  messages: ChatMessage[];
}

/** What goes with a question to the backend. */
export interface ChatContext {
  summary: string;
  history: ChatTurn[];
}

/* -------------------------------------------------------------------------- */
/*                                   Storage                                  */
/* -------------------------------------------------------------------------- */

const keyFor = (adminId: string) => `${KEY_PREFIX}current.${adminId}`;
const pastKeyFor = (adminId: string) => `${KEY_PREFIX}past.${adminId}`;

/** sessionStorage, or null where it can't be used (server render, blocked storage). */
function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function isSavedMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.id === "string" &&
    (m.role === "user" || m.role === "assistant") &&
    typeof m.text === "string" &&
    m.state === undefined &&
    (m.summarized === undefined || typeof m.summarized === "boolean") &&
    (m.links === undefined ||
      (Array.isArray(m.links) && m.links.every((l) => typeof l?.href === "string" && l.href.startsWith("/") && typeof l?.label === "string")))
  );
}

/** A stored `{ summary, messages }`, or null when it isn't one. */
function readChat(data: unknown): SavedChat | null {
  if (typeof data !== "object" || data === null) return null;
  const { summary, messages } = data as { summary?: unknown; messages?: unknown };
  if (!Array.isArray(messages)) return null;
  return { summary: typeof summary === "string" ? summary : "", messages: messages.filter(isSavedMessage) };
}

/** Finished messages only: pending replies and errors aren't kept. */
const finished = (messages: readonly ChatMessage[]) => messages.filter((m) => !m.state);

/** The admin's conversation in this tab, or null when there is none (or it can't be read). */
export function loadChat(adminId: string): SavedChat | null {
  try {
    const raw = storage()?.getItem(keyFor(adminId));
    if (!raw) return null;
    const data = JSON.parse(raw) as { version?: unknown };
    return data.version === VERSION ? readChat(data) : null;
  } catch {
    return null;
  }
}

/** Saves the finished messages (not pending replies or errors). An empty chat removes the entry. */
export function saveChat(adminId: string, { summary, messages }: SavedChat): void {
  const kept = finished(messages);
  try {
    const store = storage();
    if (!store) return;
    if (kept.length === 0 && !summary) store.removeItem(keyFor(adminId));
    else store.setItem(keyFor(adminId), JSON.stringify({ version: VERSION, summary, messages: kept }));
  } catch {
    // Storage full or blocked: the chat still works on this page, it just won't survive a reload.
  }
}

/* -------------------------------------------------------------------------- */
/*                                Past chats                                  */
/* -------------------------------------------------------------------------- */

/** One earlier conversation, as the History list shows it. */
export interface PastChat {
  id: string;
  /** The first question, shortened. */
  title: string;
  /** ISO time it was archived. */
  updatedAt: string;
  messageCount: number;
}

interface StoredPastChat extends SavedChat {
  id: string;
  updatedAt: string;
}

function readPast(adminId: string): StoredPastChat[] {
  try {
    const raw = storage()?.getItem(pastKeyFor(adminId));
    if (!raw) return [];
    const data = JSON.parse(raw) as { version?: unknown; chats?: unknown };
    if (data.version !== VERSION || !Array.isArray(data.chats)) return [];
    return data.chats.flatMap((item: unknown) => {
      const chat = readChat(item);
      const { id, updatedAt } = (item ?? {}) as { id?: unknown; updatedAt?: unknown };
      return chat && typeof id === "string" && typeof updatedAt === "string" && chat.messages.length > 0 ? [{ ...chat, id, updatedAt }] : [];
    });
  } catch {
    return [];
  }
}

/** Saves the list, dropping the oldest chats if storage is full. */
function writePast(adminId: string, chats: StoredPastChat[]): void {
  const store = storage();
  if (!store) return;
  let kept = chats.slice(0, MAX_PAST);
  for (;;) {
    try {
      if (kept.length === 0) store.removeItem(pastKeyFor(adminId));
      else store.setItem(pastKeyFor(adminId), JSON.stringify({ version: VERSION, chats: kept }));
      return;
    } catch {
      if (kept.length === 0) return;
      kept = kept.slice(0, -1);
    }
  }
}

function titleOf(messages: readonly ChatMessage[]): string {
  const first = messages.find((m) => m.role === "user")?.text.replace(/\s+/g, " ").trim() ?? "";
  if (!first) return "Conversation";
  return first.length > TITLE_CHARS ? `${first.slice(0, TITLE_CHARS - 1).trimEnd()}…` : first;
}

/** The admin's earlier conversations in this tab, newest first. */
export function listPastChats(adminId: string): PastChat[] {
  return readPast(adminId).map(({ id, updatedAt, messages }) => ({ id, title: titleOf(messages), updatedAt, messageCount: messages.length }));
}

/** Adds the conversation to the History list (when it has finished messages). Keeps the newest MAX_PAST. */
export function archiveChat(adminId: string, { summary, messages }: SavedChat): void {
  const kept = finished(messages);
  if (kept.length === 0) return;
  const chat: StoredPastChat = { id: crypto.randomUUID(), updatedAt: new Date().toISOString(), summary, messages: kept };
  writePast(adminId, [chat, ...readPast(adminId)]);
}

/** That conversation, taken off the History list because it becomes the current one again. Null when it's gone. */
export function openPastChat(adminId: string, id: string): SavedChat | null {
  const chats = readPast(adminId);
  const chat = chats.find((c) => c.id === id);
  if (!chat) return null;
  writePast(
    adminId,
    chats.filter((c) => c.id !== id),
  );
  return { summary: chat.summary, messages: chat.messages };
}

/** Removes one conversation from the History list. */
export function deletePastChat(adminId: string, id: string): void {
  writePast(
    adminId,
    readPast(adminId).filter((c) => c.id !== id),
  );
}

/** Forgets every saved conversation in this tab, current and past (on sign-out). */
export function clearSavedChats(): void {
  try {
    const store = storage();
    if (!store) return;
    const keys = Array.from({ length: store.length }, (_, i) => store.key(i)).filter((k): k is string => k?.startsWith(KEY_PREFIX) ?? false);
    for (const key of keys) store.removeItem(key);
  } catch {
    // Nothing saved, or storage is blocked.
  }
}

/* -------------------------------------------------------------------------- */
/*                              Context & summary                             */
/* -------------------------------------------------------------------------- */

const toTurn = (m: ChatMessage): ChatTurn => ({ role: m.role, content: m.text.trim().slice(0, MAX_TURN_CHARS) });

/** Answered question/answer pairs, in order. Failed or unanswered questions are left out. */
function exchanges(messages: readonly ChatMessage[]): [ChatMessage, ChatMessage][] {
  const pairs: [ChatMessage, ChatMessage][] = [];
  for (let i = 1; i < messages.length; i++) {
    const question = messages[i - 1];
    const answer = messages[i];
    if (question.role === "user" && answer.role === "assistant" && !question.state && !answer.state && answer.text.trim()) {
      pairs.push([question, answer]);
    }
  }
  return pairs;
}

const unsummarized = (messages: readonly ChatMessage[]) => messages.filter((m) => !m.summarized);

/** The summary and the latest messages not in it yet. */
export function contextFor(summary: string, messages: readonly ChatMessage[]): ChatContext {
  const recent = exchanges(unsummarized(messages)).flat().slice(-HISTORY_SENT);
  return { summary, history: recent.map(toTurn) };
}

/** The pairs to fold into the summary now (and the last message they cover), or null when it isn't time yet. */
export function dueForSummary(messages: readonly ChatMessage[]): { turns: ChatTurn[]; throughId: string } | null {
  const pairs = exchanges(unsummarized(messages));
  if (pairs.length < SUMMARY_EVERY) return null;
  const folded = pairs.slice(0, MAX_FOLDED);
  return { turns: folded.flat().map(toTurn), throughId: folded[folded.length - 1][1].id };
}

/** Marks every message up to `throughId` as summarized, dropping the oldest summarized ones past MAX_KEPT. */
export function markSummarized(messages: readonly ChatMessage[], throughId: string): ChatMessage[] {
  const end = messages.findIndex((m) => m.id === throughId);
  if (end === -1) return [...messages];
  const marked = messages.map((m, i) => (i <= end && !m.summarized ? { ...m, summarized: true } : m));
  let extra = marked.length - MAX_KEPT;
  return extra > 0 ? marked.filter((m) => !(m.summarized && extra-- > 0)) : marked;
}
