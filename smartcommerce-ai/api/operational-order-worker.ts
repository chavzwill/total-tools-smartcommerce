import { timingSafeEqual } from "node:crypto";
import { processOperationalOutboxBatch } from "../src/server/operationalOrderOutboxWorker.js";
import { currentlyProcessableOperationalDestinations, processOperationalOutboxJob } from "../src/server/operationalOrderProcessors.js";

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function send(response: any, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(payload));
}

function authorized(request: any) {
  const secret = String(process.env.SMARTCOMMERCE_WORKER_SECRET || "");
  if (!secret) return false;
  const header = String(firstHeader(request.headers?.authorization) || "");
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!supplied) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(request: any, response: any) {
  if (String(request.method || "POST").toUpperCase() !== "POST") {
    response.setHeader("Allow", "POST");
    return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "POST is required." } });
  }
  if (!process.env.SMARTCOMMERCE_WORKER_SECRET) {
    return send(response, 503, { error: { code: "WORKER_NOT_CONFIGURED", message: "Operational processing is not configured." } });
  }
  if (!authorized(request)) {
    return send(response, 401, { error: { code: "WORKER_AUTH_REQUIRED", message: "Worker authorization is required." } });
  }

  try {
    const destinations = currentlyProcessableOperationalDestinations();
    const result = await processOperationalOutboxBatch(processOperationalOutboxJob, {
      limit: 20,
      leaseSeconds: 120,
      maxAttempts: 8,
      destinations,
    });
    return send(response, 200, { ok: true, destinations, ...result });
  } catch (error) {
    console.error("operational_order_worker_error", { code: error instanceof Error ? error.message : "unknown" });
    return send(response, 503, { error: { code: "OPERATIONAL_WORKER_UNAVAILABLE", message: "Operational processing is temporarily unavailable.", retryable: true } });
  }
}
