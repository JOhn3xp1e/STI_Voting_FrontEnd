"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Calendar, Check, History, Minus, Plus, RotateCcw, Shield, Square, SquareCheck, Trash2, Users, X, type LucideIcon } from "lucide-react";

import { answerQuickAction, askAssistant, type ChatMessage, type QuickActionId } from "@/lib/chat";
import {
  archiveChat,
  contextFor,
  deletePastChat,
  dueForSummary,
  listPastChats,
  loadChat,
  markSummarized,
  openPastChat,
  saveChat,
  type PastChat,
  type SavedChat,
} from "@/lib/chat-memory";
import { cn } from "@/lib/utils";
import { summarizeChat } from "@/services/chatbot/chatbot.service";
import { fetchElections } from "@/services/elections/elections.service";
import type { Election } from "@/types/election.types";

import { ChatMarkdown } from "./chat-markdown";
import { LAUNCHER_HEIGHT, LAUNCHER_WIDTH, clampPosition, saveLauncherPosition, useLauncherPosition, type LauncherPosition } from "./launcher-position";

/** Pointer travel (px) before a press on the launcher counts as a drag instead of a click. */
const DRAG_THRESHOLD = 5;
/** Alt + arrow keys move the launcher by this much. */
const KEY_STEP = 24;

/**
 * Where the panel goes for a moved launcher: 24 px above it (as in the design) when there's
 * room, otherwise below it; lined up with its right edge and kept 16 px inside the viewport.
 */
function panelPlacement(launcher: LauncherPosition, viewport: { width: number; height: number }): CSSProperties {
  const width = Math.min(360, viewport.width - 32);
  const left = Math.min(Math.max(launcher.x + LAUNCHER_WIDTH + 20 - width, 16), viewport.width - width - 16);
  const roomAbove = launcher.y - 24 - 16;
  const roomBelow = viewport.height - (launcher.y + LAUNCHER_HEIGHT + 16) - 16;
  const originX = launcher.x + LAUNCHER_WIDTH / 2 > viewport.width / 2 ? "right" : "left";
  return roomAbove >= 420 || roomAbove >= roomBelow
    ? { left, width, bottom: viewport.height - launcher.y + 24, maxHeight: roomAbove, transformOrigin: `${originX} bottom` }
    : { left, width, top: launcher.y + LAUNCHER_HEIGHT + 16, maxHeight: roomBelow, transformOrigin: `${originX} top` };
}

/*
 * Owlie (Figma "Chat launcher" + "Chat panel"): the owl at the bottom-right of every
 * dashboard page opens a 360 px panel 24 px above it. Quick actions are answered in the browser;
 * typed questions go to the backend's /api/chatbot/ask with the conversation so far.
 *
 * The conversation is kept in this tab's sessionStorage and summarized every 20 exchanges
 * (lib/chat-memory).
 */

/** After a failed summary, wait this long before trying again. */
const SUMMARY_RETRY_MS = 60_000;

const QUICK_ACTIONS: readonly { id: QuickActionId; label: string; icon: LucideIcon }[] = [
  { id: "how-to-vote", label: "How do I vote?", icon: SquareCheck },
  { id: "schedule", label: "Election schedule", icon: Calendar },
  { id: "candidates", label: "View candidates", icon: Users },
  { id: "secret", label: "Is my vote secret?", icon: Shield },
];

const MAX_QUESTION_CHARS = 2000;

const newId = () => crypto.randomUUID();

/** The owl from the design, cropped the same way (the source image has empty space around it). */
function Owl({ className, sizes }: { className: string; sizes: string }) {
  return (
    <span aria-hidden className={cn("relative block shrink-0 overflow-hidden", className)}>
      <Image src="/images/chat/owl.png" alt="" width={1024} height={1280} sizes={sizes} className="absolute top-[-17.19%] left-[6.8%] h-[138.94%] w-[87.42%] max-w-none" />
    </span>
  );
}

/** `adminId` keys the saved conversation; render with `key={adminId}` so another admin starts fresh. */
export function ChatWidget({ adminId }: { adminId: string }) {
  const [open, setOpen] = useState(false);
  // The panel starts closed, so restoring here doesn't change the server-rendered markup.
  const [saved] = useState(() => loadChat(adminId));
  const [messages, setMessages] = useState<ChatMessage[]>(() => saved?.messages ?? []);
  const [summary, setSummary] = useState(() => saved?.summary ?? "");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  /** The earlier-conversations list in place of the chat (History button). */
  const [showHistory, setShowHistory] = useState(false);
  const [pastChats, setPastChats] = useState<PastChat[]>([]);
  const elections = useRef<Promise<Election[] | null> | null>(null);
  const request = useRef<AbortController | null>(null);
  const summarizing = useRef<AbortController | null>(null);
  const summaryRetryAt = useRef(0);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Movable launcher: the saved spot, or the spot under the pointer while dragging.
  const { position: savedPosition, viewport } = useLauncherPosition();
  const [dragPosition, setDragPosition] = useState<LauncherPosition | null>(null);
  const drag = useRef<{ startX: number; startY: number; origin: LauncherPosition; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const launcherPosition = dragPosition ?? savedPosition;
  const panelStyle = launcherPosition && viewport ? panelPlacement(launcherPosition, viewport) : undefined;

  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    const box = event.currentTarget.getBoundingClientRect();
    drag.current = { startX: event.clientX, startY: event.clientY, origin: { x: box.left, y: box.top }, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current) return;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    if (!current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    current.moved = true;
    setDragPosition(clampPosition({ x: current.origin.x + dx, y: current.origin.y + dy }));
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    drag.current = null;
    if (!current?.moved) return;
    // The click that follows a drag shouldn't open or close the panel.
    suppressClick.current = true;
    saveLauncherPosition(clampPosition({ x: current.origin.x + event.clientX - current.startX, y: current.origin.y + event.clientY - current.startY }));
    setDragPosition(null);
  }

  function cancelDrag() {
    drag.current = null;
    setDragPosition(null);
  }

  /** Alt + arrows move the launcher; Alt + Home puts it back in its default spot. */
  function moveWithKeys(event: KeyboardEvent<HTMLButtonElement>) {
    if (!event.altKey) return;
    if (event.key === "Home") {
      event.preventDefault();
      saveLauncherPosition(null);
      return;
    }
    const steps: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const step = steps[event.key];
    if (!step) return;
    event.preventDefault();
    const box = event.currentTarget.getBoundingClientRect();
    saveLauncherPosition(clampPosition({ x: box.left + step[0] * KEY_STEP, y: box.top + step[1] * KEY_STEP }));
  }

  /** The elections list, loaded once per conversation (null when it couldn't be loaded). */
  function loadElections() {
    elections.current ??= fetchElections().catch(() => null);
    return elections.current;
  }

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Keep the newest message in view while the reply streams in.
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages]);

  useEffect(
    () => () => {
      request.current?.abort();
      summarizing.current?.abort();
      summarizing.current = null;
    },
    [],
  );

  // Keep the conversation in this tab (finished messages only).
  useEffect(() => saveChat(adminId, { summary, messages }), [adminId, summary, messages]);

  // Every 20 exchanges, fold them into the running summary in the background. On failure the
  // messages stay as they are and it tries again after a later exchange.
  useEffect(() => {
    if (summarizing.current || Date.now() < summaryRetryAt.current) return;
    const due = dueForSummary(messages);
    if (!due) return;
    const controller = new AbortController();
    summarizing.current = controller;
    summarizeChat(summary, due.turns, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setSummary(next);
        setMessages((current) => markSummarized(current, due.throughId));
      })
      .catch(() => {
        if (!controller.signal.aborted) summaryRetryAt.current = Date.now() + SUMMARY_RETRY_MS;
      })
      .finally(() => {
        if (summarizing.current === controller) summarizing.current = null;
      });
  }, [messages, summary]);

  function show() {
    setOpen(true);
    void loadElections();
  }

  /** Hides the panel; the conversation stays for next time. */
  function minimize() {
    setOpen(false);
    launcherRef.current?.focus();
  }

  /**
   * Stops anything in flight (so a summary of this chat can't land on the next one) and starts
   * over, empty or with `next` (a past chat being reopened).
   */
  function reset(next?: SavedChat) {
    request.current?.abort();
    request.current = null;
    summarizing.current?.abort();
    summarizing.current = null;
    summaryRetryAt.current = 0;
    elections.current = null;
    setMessages(next?.messages ?? []);
    setSummary(next?.summary ?? "");
    setQuestion("");
    setBusy(false);
  }

  /** Keeps the current conversation in History (only if it has finished messages). */
  function archiveCurrent() {
    archiveChat(adminId, { summary, messages });
  }

  /** Closes the panel and ends the conversation (it stays in History). */
  function close() {
    archiveCurrent();
    reset();
    setShowHistory(false);
    minimize();
  }

  function startNewChat() {
    archiveCurrent();
    reset();
    setShowHistory(false);
    void loadElections();
    inputRef.current?.focus();
  }

  function toggleHistory() {
    if (!showHistory) setPastChats(listPastChats(adminId));
    setShowHistory(!showHistory);
  }

  /** Puts the current chat in History and continues the chosen one. */
  function reopen(id: string) {
    archiveCurrent();
    const chat = openPastChat(adminId, id);
    if (!chat) {
      setPastChats(listPastChats(adminId));
      return;
    }
    reset(chat);
    setShowHistory(false);
    void loadElections();
    inputRef.current?.focus();
  }

  function remove(id: string) {
    deletePastChat(adminId, id);
    setPastChats(listPastChats(adminId));
  }

  /** Adds the user's message and a pending reply, then fills the reply from `produce`. */
  async function exchange(userText: string, produce: (signal: AbortSignal) => Promise<Partial<ChatMessage>>) {
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    const replyId = newId();
    const update = (patch: Partial<ChatMessage>) => setMessages((current) => current.map((m) => (m.id === replyId ? { ...m, ...patch } : m)));

    setMessages((current) => [...current, { id: newId(), role: "user", text: userText }, { id: replyId, role: "assistant", text: "", state: "pending" }]);
    setBusy(true);
    try {
      update({ ...(await produce(controller.signal)), state: undefined });
    } catch (error) {
      if (controller.signal.aborted) {
        // Stopped by the user: drop the pending reply.
        setMessages((current) => current.filter((m) => m.id !== replyId));
      } else {
        update({ text: error instanceof Error ? error.message : "Something went wrong. Try again.", state: "error" });
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }

  function runQuickAction(id: QuickActionId, label: string) {
    if (busy) return;
    void exchange(label, async (signal) => answerQuickAction(id, id === "schedule" || id === "candidates" ? await loadElections() : null, signal));
  }

  /** Sends the question with the running summary and the latest messages not in it yet. */
  function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setQuestion("");
    const context = contextFor(summary, messages);
    void exchange(trimmed, async (signal) => ({ text: await askAssistant(trimmed, context, signal) }));
  }

  function retry(index: number) {
    const question = messages[index - 1];
    if (question?.role !== "user") return;
    // Drop the failed question and its error, then ask again.
    const quick = QUICK_ACTIONS.find((a) => a.label === question.text);
    setMessages(messages.slice(0, index - 1));
    if (quick) runQuickAction(quick.id, quick.label);
    else ask(question.text);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setShowHistory(false);
    ask(question);
  }

  const started = messages.length > 0;

  return (
    <>
      {open ? (
        <section
          role="dialog"
          aria-labelledby={titleId}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              minimize();
            }
          }}
          style={panelStyle}
          className={cn(
            "fixed z-40 flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground",
            // Default spot (launcher not moved): 24 px above the launcher at the bottom-right, as in the design.
            !panelStyle && "right-4 bottom-29.5 left-4 max-h-[calc(100dvh-8.5rem)] origin-bottom-right sm:left-auto sm:right-6 sm:w-90",
            "shadow-[0_12px_32px_0_rgb(15_23_41/0.18)] dark:shadow-[0_12px_32px_0_rgb(0_0_0/0.5)]",
            "animate-in fade-in-0 zoom-in-95 duration-200 motion-reduce:animate-none",
          )}
        >
          {/* Header (brand gold in both themes, as in the design) */}
          <header className="flex shrink-0 items-center gap-2.5 bg-brand-gold px-4 py-3.5">
            <Owl className="h-7 w-9" sizes="32px" />
            <div className="min-w-0 flex-1 text-white">
              <h2 id={titleId} className="truncate text-[0.875rem] font-semibold">
                Owlie
              </h2>
              <p className="truncate text-[0.6875rem]">Your friendly election assistant</p>
            </div>
            <div className="flex shrink-0 items-center gap-1 text-[#0f172a]">
              <WindowButton label="Minimize" onClick={minimize}>
                <Minus aria-hidden className="size-4" strokeWidth={1.75} />
              </WindowButton>
              <WindowButton label="Close and end the chat" onClick={close}>
                <X aria-hidden className="size-4" strokeWidth={1.75} />
              </WindowButton>
            </div>
          </header>

          {/* Status bar */}
          <div className="flex shrink-0 items-center gap-2 border-y border-border px-4 py-2.5">
            <p className="flex flex-1 items-center gap-2 text-[0.6875rem] text-muted-foreground" aria-live="polite">
              {busy ? (
                <span className="size-1.5 animate-pulse rounded-full bg-brand-blue motion-reduce:animate-none" aria-hidden />
              ) : (
                <Check aria-hidden className="size-3" strokeWidth={2} />
              )}
              {busy ? "Thinking…" : "Here to help you vote"}
            </p>
            <button
              type="button"
              onClick={toggleHistory}
              aria-pressed={showHistory}
              aria-label="Chat history"
              title="Chat history"
              className={cn(
                "flex h-7 w-8.75 cursor-pointer items-center justify-center rounded-md border border-border bg-card text-muted-foreground outline-none transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand-blue/30",
                showHistory && "bg-muted text-foreground",
              )}
            >
              <History aria-hidden className="size-4" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={startNewChat}
              disabled={!started && !question}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[0.6875rem] font-medium text-foreground outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand-blue/30 disabled:cursor-default disabled:hover:bg-transparent"
            >
              <Plus aria-hidden className="size-3.5" strokeWidth={1.75} />
              New chat
            </button>
          </div>

          {/* Earlier conversations (History button), in place of the chat */}
          {showHistory ? (
            <HistoryList chats={pastChats} onOpen={reopen} onDelete={remove} />
          ) : (
            <>
              {/* Conversation */}
              <div ref={logRef} role="log" aria-label="Conversation" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {started ? (
                  <ol className="flex flex-col gap-3 px-4 py-4">
                    {messages.map((message, index) => (
                      <MessageItem key={message.id} message={message} onRetry={() => retry(index)} retryDisabled={busy} />
                    ))}
                  </ol>
              ) : (
                  <div className="flex flex-col items-center gap-2.5 px-7 pt-7 pb-6">
                    <Owl className="h-15.75 w-20" sizes="72px" />
                    <p className="text-center text-[1.0625rem] font-semibold text-foreground">Hi! Need help with the election?</p>
                  </div>
                )}
              </div>

              {/* Quick actions (until the conversation starts) */}
              {started ? null : (
                <div className="grid shrink-0 grid-cols-2 gap-x-2 gap-y-2.5 border-t border-border px-4 pt-4 pb-3">
                  {QUICK_ACTIONS.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => runQuickAction(id, label)}
                      className="flex min-w-0 cursor-pointer items-center gap-2 rounded-[0.625rem] border border-border px-3 py-2.5 text-left text-[0.75rem] font-medium text-foreground outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand-blue/30"
                    >
                      <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                      <span className="truncate">{label}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Composer */}
          <form onSubmit={handleSubmit} className={cn("flex shrink-0 flex-col gap-2.5 px-4 pb-3.5", started ? "border-t border-border pt-3.5" : "pt-1")}>
            <div className="flex items-center gap-2 rounded-xl border-[1.5px] border-brand-background py-1.5 pr-1.5 pl-3.5 transition-shadow duration-150 focus-within:ring-3 focus-within:ring-brand-blue/20 dark:border-white/70">
              <input
                ref={inputRef}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                maxLength={MAX_QUESTION_CHARS}
                placeholder="Ask about the election…"
                aria-label="Ask about the election"
                className="min-w-0 flex-1 bg-transparent text-[0.8125rem] text-foreground outline-none placeholder:text-muted-foreground"
              />
              {busy ? (
                <button
                  type="button"
                  onClick={() => request.current?.abort()}
                  aria-label="Stop answering"
                  title="Stop"
                  className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-muted text-foreground outline-none transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-brand-blue/30"
                >
                  <Square aria-hidden className="size-3 fill-current" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!question.trim()}
                  aria-label="Send"
                  title="Send"
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand-blue/30",
                    question.trim()
                      ? "cursor-pointer bg-brand-background text-white hover:bg-brand-background/85 dark:bg-white dark:text-brand-background"
                      : "bg-card text-muted-foreground",
                  )}
                >
                  <ArrowRight aria-hidden className="size-4" strokeWidth={1.75} />
                </button>
              )}
            </div>
            <p className="text-center text-[0.625rem] leading-[1.4] text-muted-foreground">
              Quick actions run on your device. Typed questions go to AI, which can make mistakes.
            </p>
          </form>
        </section>
      ) : null}

      {/* Launcher */}
      <button
        ref={launcherRef}
        type="button"
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          if (open) minimize();
          else show();
        }}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={cancelDrag}
        onKeyDown={moveWithKeys}
        aria-expanded={open}
        aria-label={open ? "Hide Owlie" : "Open Owlie, the election assistant"}
        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight Alt+Home"
        title="Owlie · drag to move"
        style={launcherPosition ? { left: launcherPosition.x, top: launcherPosition.y } : undefined}
        className={cn(
          "group fixed z-40 h-13 w-17.25 touch-none rounded-xl outline-none select-none",
          !launcherPosition && "right-4 bottom-10.5 sm:right-11",
          dragPosition
            ? "cursor-grabbing scale-105"
            : "cursor-pointer transition-transform duration-200 ease-out hover:-translate-y-0.5 active:translate-y-0 active:scale-95 motion-reduce:transition-none",
          "focus-visible:ring-3 focus-visible:ring-brand-blue/40",
        )}
      >
        <Image src="/images/chat/launcher-bubble.svg" alt="" width={67} height={54} unoptimized className="pointer-events-none absolute top-[-0.74px] left-px h-[53.97px] w-16.75 max-w-none" />
        <span aria-hidden className="pointer-events-none absolute -top-5.5 left-0.75 h-16.25 w-16">
          <Image src="/images/chat/launcher-owl.png" alt="" fill sizes="64px" className="object-cover" />
        </span>
      </button>
    </>
  );
}

const historyTime = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function formatHistoryTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : historyTime.format(date);
}

/** Earlier conversations in this tab, newest first: open one to continue it, or delete it. */
function HistoryList({ chats, onOpen, onDelete }: { chats: readonly PastChat[]; onOpen: (id: string) => void; onDelete: (id: string) => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
      <p className="px-4 pt-3.5 pb-2 font-mono text-[0.625rem] tracking-[0.08em] text-muted-foreground uppercase">Earlier chats</p>
      {chats.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-7 pt-6 pb-8 text-center">
          <History aria-hidden className="size-5 text-muted-foreground" strokeWidth={1.75} />
          <p className="text-[0.8125rem] font-medium text-foreground">No earlier chats yet</p>
          <p className="text-[0.75rem] leading-[1.4] text-muted-foreground">When you start a new chat, the current one is kept here until you close this tab.</p>
        </div>
      ) : (
        <ul className="flex flex-col pb-2">
          {chats.map((chat) => (
            <li key={chat.id} className="group/chat relative flex items-center border-t border-border first:border-t-0">
              <button
                type="button"
                onClick={() => onOpen(chat.id)}
                className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 px-4 py-2.5 pr-12 text-left outline-none transition-colors duration-150 hover:bg-muted focus-visible:bg-muted dark:hover:bg-white/4"
              >
                <span className="truncate text-[0.8125rem] font-medium text-foreground">{chat.title}</span>
                <span className="text-[0.6875rem] text-muted-foreground">
                  {chat.messageCount} {chat.messageCount === 1 ? "message" : "messages"}
                  {formatHistoryTime(chat.updatedAt) ? ` · ${formatHistoryTime(chat.updatedAt)}` : ""}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onDelete(chat.id)}
                aria-label={`Delete “${chat.title}”`}
                title="Delete"
                className="absolute right-3 flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none transition-[opacity,color,background-color] duration-150 group-hover/chat:opacity-100 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-brand-blue/30"
              >
                <Trash2 aria-hidden className="size-3.5" strokeWidth={1.75} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WindowButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-7 cursor-pointer items-center justify-center rounded-md outline-none transition-colors duration-150 hover:bg-black/10 focus-visible:ring-2 focus-visible:ring-brand-navy/40"
    >
      {children}
    </button>
  );
}

function MessageItem({ message, onRetry, retryDisabled }: { message: ChatMessage; onRetry: () => void; retryDisabled: boolean }) {
  if (message.role === "user") {
    return (
      <li className="flex justify-end">
        <p className="max-w-[85%] rounded-xl rounded-br-sm bg-brand-background px-3 py-2 text-[0.8125rem] leading-[1.45] whitespace-pre-wrap text-white dark:bg-brand-blue">
          {message.text}
        </p>
      </li>
    );
  }

  const waiting = message.state === "pending";
  return (
    <li className="flex items-end gap-2">
      <Owl className="mb-0.5 h-5 w-6.5" sizes="24px" />
      <div className="flex max-w-[85%] min-w-0 flex-col gap-2">
        <div
          className={cn(
            "min-w-0 rounded-xl rounded-bl-sm px-3 py-2 text-[0.8125rem] leading-[1.45]",
            message.state === "error" ? "border border-destructive/25 bg-destructive/5 whitespace-pre-wrap text-destructive" : "bg-muted text-foreground dark:bg-white/6",
          )}
        >
          {waiting ? (
            <span className="flex h-4.5 items-center gap-1" aria-label="Writing an answer">
              {[0, 150, 300].map((delay) => (
                <span key={delay} className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 motion-reduce:animate-none" style={{ animationDelay: `${delay}ms` }} />
              ))}
            </span>
          ) : message.state === "error" ? (
            message.text
          ) : (
            <ChatMarkdown text={message.text} />
          )}
        </div>
        {message.links?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {message.links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="inline-flex max-w-full items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[0.6875rem] font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand-blue/30"
              >
                <span className="truncate">{link.label}</span>
                <ArrowUpRight aria-hidden className="size-3 shrink-0" strokeWidth={1.75} />
              </Link>
            ))}
          </div>
        ) : null}
        {message.state === "error" ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={retryDisabled}
            className="inline-flex w-fit cursor-pointer items-center gap-1 rounded-md text-[0.6875rem] font-medium text-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand-blue/30 disabled:cursor-default disabled:opacity-50"
          >
            <RotateCcw aria-hidden className="size-3" strokeWidth={1.75} />
            Try again
          </button>
        ) : null}
      </div>
    </li>
  );
}
