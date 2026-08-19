import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { listCustomerRentalLifecycle, recordCustomerRentalLifecycle } from "../src/server/customerRentalLifecycle.js";

const COOKIE_NAME = "sc_session";
let sqlClient: ReturnType<typeof neon> | undefined;

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("CUSTOMER_RENTAL_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

function firstHeader(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
function parseCookie(header?: string) {
  const result: Record<string, string> = {};
  for (const part of (header || "").split(";")) {
    const index = part.indexOf("="); if (index <= 0) continue;
    const key = part.slice(0, index).trim(); const value = part.slice(index + 1).trim();
    try { result[key] = decodeURIComponent(value); } catch { result[key] = value; }
  }
  return result;
}
async function currentCustomerId(request: any) {
  const token = parseCookie(firstHeader(request.headers?.cookie))[COOKIE_NAME];
  if (!token) return undefined;
  const rows = await sql()`SELECT customer_id FROM customer_sessions WHERE token_hash = ${hashToken(token)} AND revoked_at IS NULL AND expires_at > NOW() LIMIT 1` as unknown as Array<{ customer_id: string }>;
  return rows[0]?.customer_id;
}
function send(response: any, status: number, payload: unknown) {
  response.statusCode = status; response.setHeader("Content-Type", "application/json"); response.setHeader("Cache-Control", "no-store"); response.end(JSON.stringify(payload));
}
function daysUntil(endAt: string) { return Math.ceil((new Date(endAt).getTime() - Date.now()) / 86400000); }
function reminderLevel(days: number) { return days < 0 ? "overdue" : days <= 1 ? "urgent" : days <= 3 ? "due_soon" : days <= 7 ? "upcoming" : "none"; }

export default async function handler(request: any, response: any) {
  const method = String(request.method || "GET").toUpperCase();
  if (!['GET','POST'].includes(method)) { response.setHeader("Allow", "GET, POST"); return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "GET or POST is required." } }); }
  try {
    const customerId = await currentCustomerId(request);
    if (!customerId) return send(response, 401, { error: { code: "AUTH_REQUIRED", message: "Sign in to view your rentals." } });

    if (method === "POST") {
      const input = request.body && typeof request.body === "object" ? request.body : JSON.parse(String(request.body || "{}"));
      if (String(input.customerId || "") !== customerId) return send(response, 403, { error: { code: "CUSTOMER_MISMATCH", message: "That rental does not belong to this account." } });
      const row = await recordCustomerRentalLifecycle({
        customerId,
        providerReservationId: String(input.providerReservationId || ""),
        rentalAssetId: String(input.rentalAssetId || ""),
        equipmentName: String(input.equipmentName || ""),
        branch: input.branch ? String(input.branch) : null,
        startAt: String(input.startAt || ""),
        endAt: String(input.endAt || ""),
        status: String(input.status || "requested"),
        fulfillment: input.fulfillment ? String(input.fulfillment) : null,
        addOns: Array.isArray(input.addOns) ? input.addOns : [],
        extensionOfReservationId: input.extensionOfReservationId ? String(input.extensionOfReservationId) : null,
      });
      return send(response, 201, { rental: row });
    }

    const rows = await listCustomerRentalLifecycle(customerId);
    const rentals = rows.map((row) => {
      const daysRemaining = daysUntil(String(row.end_at));
      return { ...row, daysRemaining, reminderLevel: reminderLevel(daysRemaining) };
    });
    return send(response, 200, { rentals, dueSoon: rentals.filter((item) => item.reminderLevel !== "none" && !["completed","cancelled","declined"].includes(String(item.status))) });
  } catch (error) {
    console.error("customer_rentals_error", { code: error instanceof Error ? error.message : "request_failed" });
    return send(response, 503, { error: { code: "CUSTOMER_RENTALS_UNAVAILABLE", message: "Rental activity is temporarily unavailable." } });
  }
}
