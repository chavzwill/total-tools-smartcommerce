import { timingSafeEqual } from "node:crypto";
import {
  syncProviderRentalLifecycleBatch,
  type ProviderRentalLifecycleEvent,
} from "../src/server/customerRentalLifecycleSync.js";

const MAX_BODY_BYTES = 512_000;

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

  const configuredSecret = process.env.SMARTCOMMERCE_RENTAL_SYNC_SECRET?.trim() || "";
  if (configuredSecret.length < 32) {
    return send(response, 503, { error: { code: "RENTAL_SYNC_NOT_CONFIGURED", message: "Rental lifecycle synchronization is not configured." } });
  }

  const authorization = firstHeader(request.headers?.authorization) || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token || !secureEqual(token, configuredSecret)) {
    return send(response, 401, { error: { code: "RENTAL_SYNC_UNAUTHORIZED", message: "Rental synchronization credentials were rejected." } });
  }

  try {
    const input = await readJsonBody<{ events?: ProviderRentalLifecycleEvent[] }>(request);
    const events = Array.isArray(input.events) ? input.events : [];
    if (!events.length) return send(response, 400, { error: { code: "RENTAL_SYNC_EMPTY", message: "Provide at least one rental lifecycle event." } });

    const results = await syncProviderRentalLifecycleBatch(events);
    const updated = results.reduce((sum, result) => sum + result.updated, 0);
    return send(response, 202, { accepted: events.length, updated, unmatched: events.length - updated });
  } catch (error) {
    if (error instanceof SyntaxError) return send(response, 400, { error: { code: "INVALID_JSON", message: "The request body is invalid." } });
    if ((error as any)?.status === 413) return send(response, 413, { error: { code: "REQUEST_TOO_LARGE", message: "The rental sync payload is too large." } });
    const code = error instanceof Error ? error.message : "RENTAL_SYNC_FAILED";
    if (code.startsWith("RENTAL_SYNC_")) return send(response, 400, { error: { code, message: "One or more rental lifecycle records failed validation." } });
    console.error("customer_rental_sync_error", { code: "sync_failed" });
    return send(response, 503, { error: { code: "RENTAL_SYNC_UNAVAILABLE", message: "Rental lifecycle synchronization is temporarily unavailable.", retryable: true } });
  }
}
