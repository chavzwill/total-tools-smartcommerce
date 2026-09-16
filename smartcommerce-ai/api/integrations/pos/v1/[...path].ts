import { timingSafeEqual, createHmac } from "node:crypto";
import { applyPosCommerceSyncEvent } from "../../../../src/server/posCommerceSyncRepository.js";
import {
  POS_COMMERCE_SYNC_SOURCE,
  type PosCommerceSyncEntityType,
  type PosCommerceSyncEnvelope,
} from "../../../../src/integrations/posCommerceSyncContract.js";

const MAX_BODY_BYTES = 512 * 1024;
const MAX_SIGNATURE_AGE_SECONDS = 300;
const SIGNING_SECRET_ENV = "SMARTCOMMERCE_POS_SYNC_SECRET";
const ALLOWED_ENTITY_TYPES = new Set<PosCommerceSyncEntityType>([
  "brand", "category", "product", "product_variation", "media", "price",
  "availability", "promotion", "customer", "repair", "rental", "request",
]);

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function send(response: any, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.end(JSON.stringify(payload));
}

async function readBody(request: AsyncIterable<unknown>) {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk ?? ""));
    total += buffer.length;
    if (total > MAX_BODY_BYTES) throw Object.assign(new Error("BODY_TOO_LARGE"), { status: 413 });
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}
function verifySignature(rawBody: Buffer, request: any) {
  const secret = process.env[SIGNING_SECRET_ENV]?.trim() || "";
  if (secret.length < 32) return { configured: false, valid: false, code: "POS_SYNC_NOT_CONFIGURED" };

  const timestamp = firstHeader(request.headers?.["x-pos-timestamp"])?.trim() || "";
  const supplied = firstHeader(request.headers?.["x-pos-signature"])?.trim().replace(/^sha256=/i, "") || "";
  const timestampSeconds = Number(timestamp);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(nowSeconds - timestampSeconds) > MAX_SIGNATURE_AGE_SECONDS) {
    return { configured: true, valid: false, code: "POS_SYNC_SIGNATURE_EXPIRED" };
  }
  if (!/^[a-f0-9]{64}$/i.test(supplied)) {
    return { configured: true, valid: false, code: "POS_SYNC_SIGNATURE_INVALID" };
  }

  const expected = createHmac("sha256", secret)
    .update(timestamp)
    .update(".")
    .update(rawBody)
    .digest("hex");
  const suppliedBuffer = Buffer.from(supplied, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const valid = suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
  return { configured: true, valid, code: valid ? "OK" : "POS_SYNC_SIGNATURE_INVALID" };
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function validId(value: unknown, max = 200) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function validateEnvelope(value: unknown): PosCommerceSyncEnvelope | undefined {
  const input = asObject(value);
  if (!input) return undefined;
  const allowed = new Set(["eventId", "eventType", "entityType", "entityId", "entityVersion", "occurredAt", "source", "correlationId", "payload"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) return undefined;
  if (!validId(input.eventId) || !validId(input.eventType) || !validId(input.entityId)) return undefined;
  if (!validId(input.correlationId) || input.source !== POS_COMMERCE_SYNC_SOURCE) return undefined;
  if (typeof input.entityType !== "string" || !ALLOWED_ENTITY_TYPES.has(input.entityType as PosCommerceSyncEntityType)) return undefined;
  if (!Number.isSafeInteger(input.entityVersion) || Number(input.entityVersion) < 0) return undefined;
  if (typeof input.occurredAt !== "string" || !Number.isFinite(Date.parse(input.occurredAt))) return undefined;
  if (!asObject(input.payload)) return undefined;
  if (!String(input.eventType).startsWith(`${input.entityType}.`)) return undefined;

  return {
    eventId: String(input.eventId),
    eventType: String(input.eventType),
    entityType: input.entityType as PosCommerceSyncEntityType,
    entityId: String(input.entityId),
    entityVersion: Number(input.entityVersion),
    occurredAt: String(input.occurredAt),
    source: POS_COMMERCE_SYNC_SOURCE,
    correlationId: String(input.correlationId),
    payload: input.payload as Record<string, unknown>,
  };
}

function requestPath(request: any) {
  try { return new URL(String(request.url || "/"), "https://smartcommerce.local").pathname; }
  catch { return "/"; }
}

export default async function handler(request: any, response: any) {
  const method = String(request.method || "GET").toUpperCase();
  const path = requestPath(request);
  if (path !== "/api/integrations/pos/v1/events") {
    return send(response, 404, { error: { code: "POS_SYNC_ROUTE_NOT_FOUND", message: "That POS synchronization endpoint does not exist." } });
  }
  if (method !== "POST") {
    response.setHeader("Allow", "POST");
    return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "POST is required for POS synchronization events." } });
  }

  try {
    const rawBody = await readBody(request);
    const signature = verifySignature(rawBody, request);
    if (!signature.configured) {
      return send(response, 503, { error: { code: signature.code, message: "POS synchronization is not configured." } });
    }
    if (!signature.valid) {
      return send(response, 401, { error: { code: signature.code, message: "POS synchronization authentication failed." } });
    }

    let parsed: unknown;
    try { parsed = JSON.parse(rawBody.toString("utf8") || "{}"); }
    catch { return send(response, 400, { error: { code: "INVALID_JSON", message: "The synchronization payload is not valid JSON." } }); }

    const event = validateEnvelope(parsed);
    if (!event) {
      return send(response, 400, { error: { code: "INVALID_SYNC_ENVELOPE", message: "The synchronization event does not match the required POS contract." } });
    }

    const result = await applyPosCommerceSyncEvent(event);
    if (result.disposition === "conflict") {
      return send(response, 409, {
        eventId: event.eventId,
        entityType: event.entityType,
        entityId: event.entityId,
        status: "needs_review",
        message: "This event conflicts with the accepted version and was not applied.",
      });
    }
    if (result.disposition === "blocked") {
      return send(response, 409, {
        eventId: event.eventId,
        status: "blocked",
        message: "This event is waiting for required catalog dependencies.",
      });
    }

    return send(response, result.disposition === "applied" ? 202 : 200, {
      eventId: event.eventId,
      entityType: event.entityType,
      entityId: event.entityId,
      websiteId: result.websiteId,
      status: result.disposition,
      currentVersion: result.currentVersion,
    });
  } catch (error) {
    if (Number((error as any)?.status) === 413) {
      return send(response, 413, { error: { code: "POS_SYNC_REQUEST_TOO_LARGE", message: "The synchronization request is too large." } });
    }
    console.error("pos_commerce_sync_error", { code: "POS_SYNC_PROCESSING_FAILED", path, method });
    return send(response, 503, { error: { code: "POS_SYNC_UNAVAILABLE", message: "POS synchronization is temporarily unavailable. The sender may retry safely.", retryable: true } });
  }
}
