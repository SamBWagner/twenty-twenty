import { apiErrorResponseSchema } from "@twenty-twenty/shared";
import { getPublicApiBaseUrl } from "./runtime-urls";

export class ApiError extends Error {
  status: number;
  retryAfterSeconds?: number;

  constructor(message: string, status: number, retryAfterSeconds?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function parseRetryAfterSeconds(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeApiPath(path: string): string {
  if (path.startsWith("/api/v1/")) {
    return path;
  }
  if (path === "/api/v1") {
    return path;
  }
  if (path.startsWith("/api/")) {
    return `/api/v1${path.slice(4)}`;
  }
  if (path.startsWith("/")) {
    return `/api/v1${path}`;
  }
  return `/api/v1/${path}`;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${getPublicApiBaseUrl()}${normalizeApiPath(path)}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const parsedError = apiErrorResponseSchema.safeParse(body);
    const retryAfterSeconds = parseRetryAfterSeconds(res.headers.get("Retry-After"));
    const message = res.status === 429
      ? `Too many requests. ${retryAfterSeconds ? `Try again in ${retryAfterSeconds} second${retryAfterSeconds === 1 ? "" : "s"}.` : "Please try again shortly."}`
      : (parsedError.success ? parsedError.data.error.message : `Request failed: ${res.status}`);
    throw new ApiError(message, res.status, retryAfterSeconds);
  }

  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
