import { env } from "@/config/env";
import type {
  ApiErrorKind,
  ApiRequestOptions,
  HttpMethod,
  ProblemDetails,
  QueryParams,
  RequestBody,
} from "@/types/api.types";

const DEFAULT_TIMEOUT_MS = 30_000;

/* -------------------------------------------------------------------------- */
/*                                   Errors                                   */
/* -------------------------------------------------------------------------- */

interface ApiErrorInit {
  kind: ApiErrorKind;
  method: HttpMethod;
  url: string;
  status?: number | null;
  problem?: ProblemDetails;
  cause?: unknown;
}

/**
 * The single error type thrown by the API client.
 * Every failure — HTTP, network, timeout, abort, parse or configuration —
 * surfaces as an `ApiError`, so callers only need one `catch` branch.
 */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  /** HTTP status code, or `null` when no response was received. */
  readonly status: number | null;
  readonly method: HttpMethod;
  readonly url: string;
  /** Parsed ASP.NET Core `ProblemDetails` payload, when the server returned one. */
  readonly problem?: ProblemDetails;

  constructor(message: string, init: ApiErrorInit) {
    super(message, { cause: init.cause });
    this.name = "ApiError";
    this.kind = init.kind;
    this.status = init.status ?? null;
    this.method = init.method;
    this.url = init.url;
    this.problem = init.problem;
  }

  /** Field-level validation messages from a `ValidationProblemDetails` response. */
  get validationErrors(): Record<string, string[]> {
    return this.problem?.errors ?? {};
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isValidationError(): boolean {
    return this.status === 400 || this.status === 422;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

function getBaseUrl(method: HttpMethod, path: string): string {
  if (!env.apiUrl) {
    throw new ApiError(
      "NEXT_PUBLIC_API_URL is not set. Copy .env.example to .env.local and configure it.",
      { kind: "config", method, url: path },
    );
  }
  return env.apiUrl.replace(/\/+$/, "");
}

function buildUrl(method: HttpMethod, path: string, params?: QueryParams): string {
  const isAbsolute = /^https?:\/\//i.test(path);
  const url = isAbsolute
    ? path
    : `${getBaseUrl(method, path)}/${path.replace(/^\/+/, "")}`;

  if (!params) return url;

  const search = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    const values = Array.isArray(raw) ? raw : [raw];
    for (const value of values) {
      if (value !== null && value !== undefined) search.append(key, String(value));
    }
  }

  const query = search.toString();
  if (!query) return url;
  return `${url}${url.includes("?") ? "&" : "?"}${query}`;
}

/** `true` for bodies that should be JSON-serialized rather than sent as-is. */
function isJsonBody(body: RequestBody): boolean {
  return !(
    typeof body === "string" ||
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof URLSearchParams ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body) ||
    body instanceof ReadableStream
  );
}

function isJsonContentType(contentType: string | null): boolean {
  // Matches application/json, application/problem+json, text/json, etc.
  return !!contentType && /[/+]json\b/i.test(contentType);
}

/** Reads the response body. Empty bodies resolve to `undefined`. */
async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205 || response.status === 304) {
    return undefined;
  }

  const text = await response.text();
  if (!text) return undefined;

  return isJsonContentType(response.headers.get("content-type")) ? JSON.parse(text) : text;
}

function toProblemDetails(body: unknown, response: Response): ProblemDetails {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return { status: response.status, ...(body as ProblemDetails) };
  }
  // A list of messages, e.g. `Results.BadRequest(errors)` with a List<string>.
  if (Array.isArray(body)) {
    const messages = body.filter((item): item is string => typeof item === "string");
    return {
      status: response.status,
      title: response.statusText || undefined,
      detail: messages.length ? messages.join("\n") : undefined,
    };
  }
  return {
    status: response.status,
    title: response.statusText || undefined,
    detail: typeof body === "string" && body ? body : undefined,
  };
}

function createTimeoutSignal(timeoutMs: number): AbortSignal | undefined {
  return timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined;
}

/* -------------------------------------------------------------------------- */
/*                                Core request                                */
/* -------------------------------------------------------------------------- */

/**
 * Sends a request to the API and returns the parsed response body.
 *
 * - JSON responses are parsed; empty responses (e.g. `204 No Content`) resolve to `undefined`,
 *   so type those endpoints as `void`.
 * - Any non-2xx response, network failure, timeout or abort throws an {@link ApiError}.
 * - Next.js fetch options (`cache`, `next: { revalidate, tags }`) and standard
 *   `RequestInit` options (`credentials`, `headers`, `signal`) are passed through.
 */
export async function request<TResponse>(
  method: HttpMethod,
  path: string,
  body?: RequestBody,
  options: ApiRequestOptions = {},
): Promise<TResponse> {
  const { params, timeoutMs = DEFAULT_TIMEOUT_MS, headers: headersInit, signal, ...init } = options;

  const url = buildUrl(method, path, params);

  const headers = new Headers(headersInit);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");

  let payload: BodyInit | undefined;
  if (body !== undefined) {
    if (isJsonBody(body)) {
      payload = JSON.stringify(body);
      if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    } else {
      payload = body as BodyInit;
    }
  }

  const timeoutSignal = createTimeoutSignal(timeoutMs);
  const signals = [signal, timeoutSignal].filter((s): s is AbortSignal => !!s);
  const combinedSignal =
    signals.length > 1 ? AbortSignal.any(signals) : signals[0];

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      method,
      headers,
      body: payload,
      signal: combinedSignal,
    });
  } catch (cause) {
    if (timeoutSignal?.aborted) {
      throw new ApiError(`Request timed out after ${timeoutMs} ms.`, {
        kind: "timeout",
        method,
        url,
        cause,
      });
    }
    if (signal?.aborted) {
      throw new ApiError("Request was aborted.", { kind: "aborted", method, url, cause });
    }
    throw new ApiError("Network error: unable to reach the API.", {
      kind: "network",
      method,
      url,
      cause,
    });
  }

  let data: unknown;
  try {
    data = await readBody(response);
  } catch (cause) {
    if (response.ok) {
      throw new ApiError("Failed to parse the API response.", {
        kind: "parse",
        method,
        url,
        status: response.status,
        cause,
      });
    }
    data = undefined;
  }

  if (!response.ok) {
    const problem = toProblemDetails(data, response);
    throw new ApiError(
      problem.detail ?? problem.title ?? `Request failed with status ${response.status}.`,
      { kind: "http", method, url, status: response.status, problem },
    );
  }

  return data as TResponse;
}

/* -------------------------------------------------------------------------- */
/*                                Public client                               */
/* -------------------------------------------------------------------------- */

/**
 * Centralized REST client for the ASP.NET Core Web API.
 *
 * @example
 * const items = await apiClient.get<ItemDto[]>("/items", { params: { page: 1 } });
 * const created = await apiClient.post<ItemDto, CreateItemRequest>("/items", { name: "A" });
 * await apiClient.delete(`/items/${id}`);
 */
export const apiClient = {
  request,

  get<TResponse>(path: string, options?: ApiRequestOptions) {
    return request<TResponse>("GET", path, undefined, options);
  },

  post<TResponse, TBody extends RequestBody = RequestBody>(
    path: string,
    body?: TBody,
    options?: ApiRequestOptions,
  ) {
    return request<TResponse>("POST", path, body, options);
  },

  put<TResponse, TBody extends RequestBody = RequestBody>(
    path: string,
    body?: TBody,
    options?: ApiRequestOptions,
  ) {
    return request<TResponse>("PUT", path, body, options);
  },

  patch<TResponse, TBody extends RequestBody = RequestBody>(
    path: string,
    body?: TBody,
    options?: ApiRequestOptions,
  ) {
    return request<TResponse>("PATCH", path, body, options);
  },

  delete<TResponse = void>(path: string, options?: ApiRequestOptions) {
    return request<TResponse>("DELETE", path, undefined, options);
  },
} as const;

export type ApiClient = typeof apiClient;
