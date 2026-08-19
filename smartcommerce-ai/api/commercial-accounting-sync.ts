import { timingSafeEqual } from "node:crypto";
import { syncProviderAccountingBatch, type ProviderAccountingEvent } from "../src/server/commercialAccountingSync.js";

const MAX_BODY_BYTES = 1_000_000;

function send(response: any, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(payload));
}

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readJsonBody<T>(request: AsyncIterable<unknown>): Promise<T> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    if (chunk == null) continue;
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    total += buffer.length;
    if (total > MAX_BODY_BYTES) throw Object.assign(new Error("BODY_TOO_LARGE"), { status: 413 });
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as T;
}

export default async function handler(request: any, response: any) {
  if (String(request.method || "").toUpperCase() !== "POST") {
    response.setHeader("Allow", "POST");
    return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "POST is required." } });
  }

  const configuredSecret = process.env.SMARTCOMMERCE_ACCOUNTING_SYNC_SECRET?.trim() || "";
  if (configuredSecret.length < 32) {
    return send(response, 503, { error: { code: "ACCOUNTING_SYNC_NOT_CONFIGURED", message: "Accounting synchronization is not configured." } });
  }

  const authorization = firstHeader(request.headers?.authorization) || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token || !secureEqual(token, configuredSecret)) {
    return send(response, 401, { error: { code: "ACCOUNTING_SYNC_UNAUTHORIZED", message: "Accounting synchronization credentials were rejected." } });
  }

  try {
    const input = await readJsonBody<{ events?: ProviderAccountingEvent[] }>(request);
    const results = await syncProviderAccountingBatch(input.events || []);
    return send(response, 202, { accepted: results.length });
  } catch (error) {
    if (error instanceof SyntaxError) return send(response, 400, { error: { code: "INVALID_JSON", message: "The request body is invalid." } });
    if ((error as any)?.status === 413) return send(response, 413, { error: { code: "REQUEST_TOO_LARGE", message: "The accounting sync payload is too large." } });
    const code = error instanceof Error ? error.message : "ACCOUNTING_SYNC_FAILED";
    if (code.startsWith("ACCOUNTING_SYNC_")) return send(response, 400, { error: { code, message: "One or more accounting records failed validation." } });
    console.error("commercial_accounting_sync_error", { code: "sync_failed" });
    return send(response, 503, { error: { code: "ACCOUNTING_SYNC_UNAVAILABLE", message: "Accounting synchronization is temporarily unavailable.", retryable: true } });
  }
}
