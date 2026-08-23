import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";
import { validateCustomerCartInventory } from "../src/server/authoritativeCartInventory.js";
import { enforceDurableRateLimit, requestIp } from "../src/server/securityInfrastructure.js";

const COOKIE_NAME = "sc_session";
let sqlClient: ReturnType<typeof neon> | undefined;

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("COMMERCE_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}
function firstHeader(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
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
function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
async function currentCustomerId(request: any) {
  const token = parseCookie(firstHeader(request.headers?.cookie))[COOKIE_NAME];
  if (!token) return undefined;
  const rows = await sql()`
    SELECT customer_id FROM customer_sessions
    WHERE token_hash = ${hashToken(token)}
      AND revoked_at IS NULL
      AND expires_at > NOW()
    LIMIT 1
  ` as unknown as Array<{ customer_id: string }>;
  return rows[0]?.customer_id;
}
function send(response: any, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(payload));
}

export default async function handler(request: any, response: any) {
  if (String(request.method || "GET").toUpperCase() !== "GET") {
    response.setHeader("Allow", "GET");
    return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "GET is required." } });
  }
  try {
    const customerId = await currentCustomerId(request);
    if (!customerId) return send(response, 401, { error: { code: "AUTH_REQUIRED", message: "Sign in to validate cart inventory." } });
    await enforceDurableRateLimit({ request, action: "cart_inventory_validation", subject: customerId || requestIp(request), limit: 60, windowSeconds: 300 });
    const inventory = await validateCustomerCartInventory(customerId);
    return send(response, 200, { inventory });
  } catch (error: any) {
    if (error?.message === "RATE_LIMITED") return send(response, 429, { error: { code: "RATE_LIMITED", message: "Too many inventory checks. Please wait and try again." } });
    console.error("cart_inventory_validation_error", { code: error instanceof Error ? error.message : "unknown" });
    return send(response, 503, { error: { code: "INVENTORY_VALIDATION_UNAVAILABLE", message: "Live inventory validation is temporarily unavailable." } });
  }
}
