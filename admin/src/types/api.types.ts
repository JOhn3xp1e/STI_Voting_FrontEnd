/**
 * Shared types for communicating with the ASP.NET Core Web API.
 */

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** A single query-string value. `null`/`undefined` values are omitted from the URL. */
export type QueryParamValue = string | number | boolean | null | undefined;

/**
 * Query-string parameters. Arrays are serialized as repeated keys
 * (`?id=1&id=2`), which is the format ASP.NET Core model binding expects.
 */
export type QueryParams = Record<string, QueryParamValue | readonly QueryParamValue[]>;

/**
 * Request body accepted by the client.
 *
 * Plain objects and arrays (including DTOs declared as `interface`s) are
 * serialized as JSON. `FormData`, `Blob`, `ArrayBuffer`, `URLSearchParams`
 * and strings are sent as-is, letting `fetch` set the matching content type.
 */
export type RequestBody = object | string;

/** Options accepted by every API client method. */
export interface ApiRequestOptions extends Omit<RequestInit, "method" | "body"> {
  /** Query-string parameters appended to the request URL. */
  params?: QueryParams;
  /** Request timeout in milliseconds. Defaults to 30 seconds. Use `0` to disable. */
  timeoutMs?: number;
}

/**
 * RFC 7807 Problem Details — the default error payload returned by ASP.NET Core
 * (`Results.Problem()`, `ProblemDetails`, `[ApiController]` validation failures).
 */
export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  /** Correlation id added by ASP.NET Core; useful when reporting errors. */
  traceId?: string;
  /** Field-level validation errors (present on `ValidationProblemDetails`). */
  errors?: Record<string, string[]>;
  [extension: string]: unknown;
}

/** Categorizes failures so callers can branch without inspecting status codes. */
export type ApiErrorKind =
  /** The server responded with a non-2xx status. */
  | "http"
  /** The request never reached the server (offline, DNS, CORS, TLS). */
  | "network"
  /** The request exceeded `timeoutMs`. */
  | "timeout"
  /** The request was cancelled through a caller-provided `AbortSignal`. */
  | "aborted"
  /** The response body could not be parsed. */
  | "parse"
  /** The client is misconfigured (for example, a missing base URL). */
  | "config";
