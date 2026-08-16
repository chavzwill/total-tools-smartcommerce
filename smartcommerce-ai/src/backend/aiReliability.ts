import type { PlatformApiResult } from "../platform";

export class OperationTimeoutError extends Error {
  code = "OPERATION_TIMEOUT";
  constructor(operation: string, timeoutMs: number) {
    super(`${operation} timed out after ${timeoutMs}ms.`);
    this.name = "OperationTimeoutError";
  }
}

export async function withTimeout<T>(operation: string, task: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([task, new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new OperationTimeoutError(operation, timeoutMs)), timeoutMs); })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchWithTimeoutAndRetry(url: string, init: RequestInit, options: { timeoutMs?: number; retries?: number } = {}) {
  const timeoutMs = options.timeoutMs ?? 20_000;
  const retries = options.retries ?? 1;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if ((response.status === 429 || response.status >= 500) && attempt < retries) { await wait(250 * (attempt + 1)); continue; }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt >= retries) throw error;
      await wait(250 * (attempt + 1));
    } finally { clearTimeout(timer); }
  }
  throw lastError instanceof Error ? lastError : new Error("Request failed.");
}

export async function retryPlatformRead<T>(operation: string, task: () => Promise<PlatformApiResult<T>>, options: { timeoutMs?: number; retries?: number } = {}): Promise<PlatformApiResult<T>> {
  const timeoutMs = options.timeoutMs ?? 8_000;
  const retries = options.retries ?? 1;
  let lastResult: PlatformApiResult<T> | undefined;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const result = await withTimeout(operation, task(), timeoutMs);
      lastResult = result;
      if (result.success || !result.error.retryable || attempt >= retries) return result;
    } catch (error) {
      if (attempt >= retries) return { success: false, error: { code: error instanceof OperationTimeoutError ? "PROVIDER_TIMEOUT" : "PROVIDER_READ_FAILED", message: error instanceof Error ? error.message : `${operation} failed.`, retryable: true } };
    }
    await wait(150 * (attempt + 1));
  }
  return lastResult || { success: false, error: { code: "PROVIDER_READ_FAILED", message: `${operation} failed.`, retryable: true } };
}
