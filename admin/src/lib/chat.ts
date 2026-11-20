import { formatDayTime, formatVotingDates, instantToLocal } from "@/lib/elections";
import { sortPositions } from "@/lib/ballot";
import { isApiError } from "@/services/api/client";
import { getApiErrorMessage } from "@/services/api/error-message";
import { fetchCandidates, fetchPositions } from "@/services/ballot/ballot.service";
import { askChatbot } from "@/services/chatbot/chatbot.service";
import type { Election } from "@/types/election.types";

/*
 * STI Vote Buddy, the chat panel's assistant.
 *
 * Quick actions are answered here in the browser (fixed text, or the admin API);
 * typed questions go to the backend's chatbot endpoint (services/chatbot), one question at a time.
 */

export type ChatRole = "user" | "assistant";

export interface ChatLink {
  href: string;
  label: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  /** Pages to open from a quick-action answer. */
  links?: ChatLink[];
  /** `pending` while the answer is on its way; `error` when the text is an error message. */
  state?: "pending" | "error";
}

export type QuickActionId = "how-to-vote" | "schedule" | "candidates" | "secret";

export interface QuickAnswer {
  text: string;
  links?: ChatLink[];
}

/** Elections people ask about first: ongoing, then upcoming, then the latest completed ones. */
function relevantElections(elections: readonly Election[]): Election[] {
  const rank = { Ongoing: 0, Upcoming: 1, Completed: 2, Draft: 3, Cancelled: 4 } as const;
  return elections
    .filter((e) => e.status !== "Cancelled")
    .sort((a, b) => rank[a.status] - rank[b.status] || (a.status === "Completed" ? b.endsAt.localeCompare(a.endsAt) : a.startsAt.localeCompare(b.startsAt)));
}

const active = (elections: readonly Election[]) => relevantElections(elections).filter((e) => e.status === "Ongoing" || e.status === "Upcoming");

const HOW_TO_VOTE = [
  "Here's how voting works on SLVP:",
  "1. When voting opens, check your email for “Your SLVP voting code”.",
  "2. Sign in to SLVP with that one-time code before it expires.",
  "3. For each position, pick up to as many candidates as it has seats.",
  "4. Submit your ballot before voting closes.",
  "Only students in the election's careers, programs and levels can vote.",
].join("\n");

const VOTE_SECRET = [
  "Yes. Your choices are private: results are counted per candidate, so admins and candidates see totals, not how each student voted.",
  "Never share your one-time code. No admin or candidate will ever ask for it.",
].join("\n");

/** Answers a quick action without AI. `elections` is null when the list couldn't be loaded. */
export async function answerQuickAction(id: QuickActionId, elections: readonly Election[] | null, signal?: AbortSignal): Promise<QuickAnswer> {
  if (id === "how-to-vote") return { text: HOW_TO_VOTE };
  if (id === "secret") return { text: VOTE_SECRET };
  if (!elections) return { text: "I couldn't load the elections just now. Try again in a moment.", links: [{ href: "/elections", label: "Open Elections" }] };

  const shown = active(elections).slice(0, 4);
  if (shown.length === 0) {
    return {
      text: "There are no ongoing or upcoming elections right now.",
      links: [{ href: "/elections/new", label: "Create an election" }],
    };
  }

  if (id === "schedule") {
    const lines = shown.map((e) => {
      const when =
        e.status === "Ongoing"
          ? `voting closes ${formatDayTime(instantToLocal(e.endsAt))}`
          : `voting opens ${formatDayTime(instantToLocal(e.startsAt))}`;
      return `• ${e.title}: ${e.status.toLowerCase()}, ${formatVotingDates(e.startsAt, e.endsAt)} (${when})`;
    });
    return {
      text: [shown.length === 1 ? "Here's the election schedule:" : "Here are the election schedules:", ...lines].join("\n"),
      links: shown.map((e) => ({ href: `/elections/${e.id}/manage`, label: `Open ${e.title}` })),
    };
  }

  // Candidates: positions and how many run for each, per election.
  const ballots = await Promise.all(
    shown.slice(0, 3).map(async (e) => {
      const [positions, candidates] = await Promise.all([fetchPositions(e.id, { signal }), fetchCandidates(e.id, { signal })]);
      return { election: e, positions: sortPositions(positions), candidates };
    }),
  );
  const blocks = ballots.map(({ election, positions, candidates }) => {
    if (positions.length === 0) return `${election.title}: no positions yet.`;
    const rows = positions.map((p) => {
      const count = candidates.filter((c) => c.positionId === p.id).length;
      return `• ${p.title}: ${count} ${count === 1 ? "candidate" : "candidates"}`;
    });
    return [`${election.title} (${candidates.length} ${candidates.length === 1 ? "candidate" : "candidates"}):`, ...rows].join("\n");
  });
  return {
    text: blocks.join("\n\n"),
    links: ballots.map(({ election }) => ({ href: `/elections/${election.id}/ballot`, label: `${election.title} ballot` })),
  };
}

/** Asks the backend's chatbot. Throws an Error with a message for the panel when it can't answer. */
export async function askAssistant(question: string, signal?: AbortSignal): Promise<string> {
  try {
    const answer = (await askChatbot(question, { signal })).trim();
    if (!answer) throw new Error("The assistant didn't answer. Try asking another way.");
    return answer;
  } catch (error) {
    if (isApiError(error) && error.isUnauthorized) {
      throw new Error("Sign in again to use the assistant. (The local sign-in shortcut has no account the backend can check.)", { cause: error });
    }
    if (isApiError(error) && error.isForbidden) {
      // e.g. "You are not authorized to use the chatbot." (not a super admin or an election admin)
      const message = error.problem?.message;
      throw new Error(typeof message === "string" && message ? message : "Your account can't use the assistant.", { cause: error });
    }
    throw isApiError(error) ? new Error(getApiErrorMessage(error), { cause: error }) : error;
  }
}
