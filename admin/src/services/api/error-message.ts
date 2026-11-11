import { isApiError } from "@/services/api/client";

/** User-facing message for a failed Web API request (any page). */
export function getApiErrorMessage(error: unknown): string {
  if (!isApiError(error)) {
    return error instanceof Error && error.message ? error.message : "Something went wrong. Please try again.";
  }
  switch (error.kind) {
    case "config":
      return "The API address isn't set. Add NEXT_PUBLIC_API_URL to .env.local and restart the dev server.";
    case "network":
      return "Can't reach the API. Make sure the backend is running and allows this site (CORS).";
    case "timeout":
      return "The API took too long to respond. Please try again.";
    case "parse":
      return "The API sent a response this page couldn't read.";
    case "aborted":
      return "The request was cancelled.";
    case "http": {
      // The backend answers some errors with `{ error: "...", detail?: "..." }`.
      const custom = error.problem?.error;
      const detail = error.problem?.detail;
      if (typeof custom === "string" && custom) {
        return typeof detail === "string" && detail ? `${custom} ${detail}` : custom;
      }
      // Plain-text or list-of-messages errors, e.g. "There's no current term."
      if (error.status === 400 && typeof detail === "string" && detail) return detail;
      if (error.status === 404) return "Not found. It may have been removed.";
      if (error.status === 401 || error.status === 403) return "You're not allowed to do this. Sign in again.";
      if (error.status !== null && error.status >= 500) {
        return `The server ran into a problem (${error.status}). Check the backend console for details.`;
      }
      return error.message;
    }
  }
}
