"use client";

type JsonRecord = Record<string, unknown>;

type RequestJsonOptions = RequestInit & {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  retryOnStatuses?: number[];
};

export class ClientHttpError extends Error {
  status: number;
  payload?: JsonRecord | null;

  constructor(message: string, status: number, payload?: JsonRecord | null) {
    super(message);
    this.name = "ClientHttpError";
    this.status = status;
    this.payload = payload;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toErrorMessage(payload: JsonRecord | null, fallback: string): string {
  if (!payload) return fallback;
  const textError = typeof payload.error === "string" ? payload.error : null;
  const textMessage = typeof payload.message === "string" ? payload.message : null;
  return textError ?? textMessage ?? fallback;
}

async function parseJsonSafe(response: Response): Promise<JsonRecord | null> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return null;

  try {
    return (await response.json()) as JsonRecord;
  } catch {
    return null;
  }
}

export async function requestJson<T>(input: RequestInfo | URL, options: RequestJsonOptions = {}): Promise<T> {
  const {
    timeoutMs = 20_000,
    retries = 0,
    retryDelayMs = 350,
    retryOnStatuses = [408, 425, 429, 500, 502, 503, 504],
    ...init
  } = options;

  const maxAttempts = Math.max(1, retries + 1);
  let attempt = 0;
  let lastError: unknown = null;

  while (attempt < maxAttempts) {
    attempt += 1;
    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const response = await fetch(input, {
        ...init,
        signal: abortController.signal,
      });

      clearTimeout(timeoutHandle);
      const payload = await parseJsonSafe(response);

      if (!response.ok) {
        const message = toErrorMessage(payload, `Request failed (${response.status}).`);
        const retriable = retryOnStatuses.includes(response.status);
        if (attempt < maxAttempts && retriable) {
          await sleep(retryDelayMs * attempt);
          continue;
        }
        throw new ClientHttpError(message, response.status, payload);
      }

      return (payload ?? {}) as T;
    } catch (error) {
      clearTimeout(timeoutHandle);
      lastError = error;

      const shouldRetry =
        attempt < maxAttempts &&
        (!(error instanceof ClientHttpError) || retryOnStatuses.includes(error.status));

      if (shouldRetry) {
        await sleep(retryDelayMs * attempt);
        continue;
      }

      if (error instanceof ClientHttpError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Request timed out. Please try again.");
      }

      throw error instanceof Error ? error : new Error("Unexpected request failure.");
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Request failed.");
}

