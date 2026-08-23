import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";
import {
  deleteCustomerDeliveryAddress,
  listCustomerDeliveryAddresses,
  saveCustomerDeliveryAddress,
  setDefaultCustomerDeliveryAddress,
  type CustomerDeliveryAddressInput,
} from "../src/server/customerDeliveryAddresses.js";
import { enforceDurableRateLimit, firstHeader, recordSecurityEvent, requestIp } from "../src/server/securityInfrastructure.js";

const COOKIE_NAME = "sc_session";
const MAX_BODY_BYTES = 20_000;
let sqlClient: ReturnType<typeof neon> | undefined;

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("COMMERCE_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

function parseCookie(header?: string) {
  const result: Record<string, string> = {};
  for (const part of (header || "").split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try { result[key] = decodeURIComponent(value); } catch { result[key] = value; }
  }
  return result;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function sameOrigin(request: any) {
  const origin = firstHeader(request.headers?.origin);
  if (!origin) return true;
  const host = firstHeader(request.headers?.host);
  if (!host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

async function currentCustomerId(request: any) {
  const token = parseCookie(firstHeader(request.headers?.cookie))[COOKIE_NAME];
  if (!token) return undefined;
  const rows = await sql()`
    SELECT customer_id FROM customer_sessions
    WHERE token_hash = ${hashToken(token)} AND revoked_at IS NULL AND expires_at > NOW()
    LIMIT 1
  ` as Array<{ customer_id: string }>;
  return rows[0]?.customer_id;
}

async function readJsonBody<T>(request: AsyncIterable<unknown>): Promise<T> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    if (chunk == null) continue;
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    total += buffer.length;
    if (total > MAX_BODY_BYTES) throw Object.assign(new Error("REQUEST_TOO_LARGE"), { status: 413 });
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as T;
}

function send(response: any, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");
  response.end(JSON.stringify(payload));
}

export default async function handler(request: any, response: any) {
  const method = String(request.method || "GET").toUpperCase();
  if (!sameOrigin(request)) return send(response, 403, { error: { code: "ORIGIN_REJECTED", message: "This request was rejected." } });

  try {
    const customerId = await currentCustomerId(request);
    if (!customerId) return send(response, 401, { error: { code: "AUTH_REQUIRED", message: "Sign in to manage saved delivery addresses." } });

    if (method === "GET") {
      const addresses = await listCustomerDeliveryAddresses(customerId);
      return send(response, 200, { addresses });
    }

    if (method !== "POST") {
      response.setHeader("Allow", "GET, POST");
      return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "GET or POST is required." } });
    }

    await enforceDurableRateLimit({ request, action: "customer_delivery_addresses", subject: customerId, limit: 60, windowSeconds: 600 });
    await enforceDurableRateLimit({ request, action: "customer_delivery_addresses_ip", subject: requestIp(request), limit: 120, windowSeconds: 600 });

    const input = await readJsonBody<{ action?: "save" | "delete" | "set_default"; id?: string; address?: CustomerDeliveryAddressInput }>(request);
    const action = input.action;
    if (action === "save") {
      const result = await saveCustomerDeliveryAddress(customerId, { ...(input.address || {}), id: input.address?.id || input.id });
      await recordSecurityEvent({ request, eventType: "customer_delivery_address_saved", eventStatus: "success", riskLevel: "info", customerId, metadata: { addressId: result.address.id, zoneStatus: result.zone.status, zoneClass: result.zone.status === "resolved" ? result.zone.destinationClass : null } }).catch(() => undefined);
      return send(response, 200, result);
    }
    if (action === "delete") {
      const id = String(input.id || "").trim().slice(0, 80);
      if (!id) return send(response, 400, { error: { code: "DELIVERY_ADDRESS_REQUIRED", message: "Choose an address to remove." } });
      const result = await deleteCustomerDeliveryAddress(customerId, id);
      await recordSecurityEvent({ request, eventType: "customer_delivery_address_deleted", eventStatus: "success", riskLevel: "info", customerId, metadata: { addressId: result.id } }).catch(() => undefined);
      return send(response, 200, result);
    }
    if (action === "set_default") {
      const id = String(input.id || "").trim().slice(0, 80);
      if (!id) return send(response, 400, { error: { code: "DELIVERY_ADDRESS_REQUIRED", message: "Choose an address to make default." } });
      const address = await setDefaultCustomerDeliveryAddress(customerId, id);
      return send(response, 200, { address });
    }
    return send(response, 400, { error: { code: "INVALID_ADDRESS_ACTION", message: "That address action is not supported." } });
  } catch (error: any) {
    if (error instanceof SyntaxError) return send(response, 400, { error: { code: "INVALID_JSON", message: "The request body is invalid." } });
    if (error?.message === "DELIVERY_ADDRESS_INCOMPLETE") return send(response, 400, { error: { code: "DELIVERY_ADDRESS_INCOMPLETE", message: "Add the recipient, phone, street address, town/city and parish before saving." } });
    if (error?.message === "DELIVERY_ADDRESS_NOT_FOUND") return send(response, 404, { error: { code: "DELIVERY_ADDRESS_NOT_FOUND", message: "That saved address no longer exists." } });
    if (error?.message === "RATE_LIMITED") return send(response, 429, { error: { code: "RATE_LIMITED", message: "Too many address changes. Please wait and try again." } });
    if (Number(error?.status) === 413) return send(response, 413, { error: { code: "REQUEST_TOO_LARGE", message: "The request is too large." } });
    console.error("customer_addresses_error", { code: error instanceof Error ? error.message : "unknown" });
    return send(response, 503, { error: { code: "CUSTOMER_ADDRESSES_UNAVAILABLE", message: "Saved addresses are temporarily unavailable.", retryable: true } });
  }
}
