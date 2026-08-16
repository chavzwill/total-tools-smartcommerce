import crypto from "node:crypto";

const windows = new Map<string, { count: number; resetAt: number }>();

export class RequestGuardError extends Error {
  statusCode: number;
  code: string;
  retryAfterSeconds?: number;

  constructor(statusCode: number, code: string, message: string, retryAfterSeconds?: number) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const firstHeader = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export function requestId(request: any) {
  return firstHeader(request.headers?.["x-request-id"]) || firstHeader(request.headers?.["x-vercel-id"]) || crypto.randomUUID();
}

function clientKey(request: any, scope: string) {
  const forwarded = firstHeader(request.headers?.["x-forwarded-for"]) || "unknown";
  const ip = forwarded.split(",")[0]?.trim() || "unknown";
  return crypto.createHash("sha256").update(`${scope}:${ip}`).digest("hex").slice(0, 24);
}

export function enforceBurstLimit(request: any, scope: string, limit: number, windowMs = 60_000) {
  const now = Date.now();
  const key = clientKey(request, scope);
  const current = windows.get(key);
  if (!current || current.resetAt <= now) { windows.set(key, { count: 1, resetAt: now + windowMs }); return; }
  if (current.count >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    throw new RequestGuardError(429, "RATE_LIMITED", "Too many AI requests. Please wait a moment and try again.", retryAfterSeconds);
  }
  current.count += 1;
}

export async function readJsonBody<T>(request: AsyncIterable<unknown> & { headers?: Record<string, string | string[] | undefined> }, maxBytes: number): Promise<T> {
  const contentLength = Number(firstHeader(request.headers?.["content-length"]));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new RequestGuardError(413, "PAYLOAD_TOO_LARGE", "The request payload is too large.");
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    if (chunk === undefined || chunk === null) continue;
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    total += buffer.length;
    if (total > maxBytes) throw new RequestGuardError(413, "PAYLOAD_TOO_LARGE", "The request payload is too large.");
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  try { return JSON.parse(text || "{}") as T; }
  catch { throw new RequestGuardError(400, "INVALID_JSON", "The request body must be valid JSON."); }
}

export function sendGuardError(response: any, error: unknown, id: string) {
  if (!(error instanceof RequestGuardError)) return false;
  response.statusCode = error.statusCode;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("X-Request-Id", id);
  if (error.retryAfterSeconds) response.setHeader("Retry-After", String(error.retryAfterSeconds));
  response.end(JSON.stringify({ success: false, requestId: id, error: { code: error.code, message: error.message, retryable: error.statusCode === 429 } }));
  return true;
}

export function logAiEvent(event: string, data: Record<string, string | number | boolean | undefined>) {
  console.info(JSON.stringify({ event, at: new Date().toISOString(), ...data }));
}
