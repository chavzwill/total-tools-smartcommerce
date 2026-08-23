import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { getCommercialCreditAvailability } from "../src/server/commercialCreditReservations.js";
import { enforceDurableRateLimit, firstHeader, requestIp } from "../src/server/securityInfrastructure.js";

const COOKIE_NAME = "sc_session";
const VIEW_ROLES = new Set(["owner", "admin", "buyer", "approver"]);
let sqlClient: ReturnType<typeof neon> | undefined;

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("COMMERCIAL_CREDIT_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}
function hashToken(value: string) { return createHash("sha256").update(value).digest("hex"); }
function parseCookie(header?: string) {
  const out: Record<string, string> = {};
  for (const part of (header || "").split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    try { out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim()); }
    catch { out[part.slice(0, index).trim()] = part.slice(index + 1).trim(); }
  }
  return out;
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
  if (String(request.method || "GET").toUpperCase() !== "GET") {
    response.setHeader("Allow", "GET");
    return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "GET is required." } });
  }
  try {
    const token = parseCookie(firstHeader(request.headers?.cookie))[COOKIE_NAME];
    if (!token) return send(response, 401, { error: { code: "AUTH_REQUIRED", message: "Sign in to view commercial credit availability." } });
    const sessions = await sql()`SELECT customer_id FROM customer_sessions WHERE token_hash=${hashToken(token)} AND revoked_at IS NULL AND expires_at>NOW() LIMIT 1` as Array<{ customer_id: string }>;
    const customerId = sessions[0]?.customer_id;
    if (!customerId) return send(response, 401, { error: { code: "AUTH_REQUIRED", message: "Sign in to view commercial credit availability." } });
    await enforceDurableRateLimit({ request, action: "commercial_credit_availability", subject: customerId || requestIp(request), limit: 120, windowSeconds: 600 });

    const commercialAccountId = String(request.query?.commercialAccountId || "").trim().slice(0, 80);
    if (!commercialAccountId) return send(response, 400, { error: { code: "COMMERCIAL_ACCOUNT_REQUIRED", message: "Choose a commercial account." } });

    const rows = await sql()`
      SELECT m.role,m.authority_status,a.verification_status,a.privilege_status,
             pm.mapping_status,pm.provider_id,
             c.control_status,c.credit_enabled,c.credit_limit_minor,c.credit_currency,c.payment_terms_code
      FROM commercial_account_members m
      JOIN commercial_accounts a ON a.id=m.commercial_account_id
      LEFT JOIN commercial_provider_mappings pm ON pm.commercial_account_id=a.id AND pm.mapping_status='verified'
      LEFT JOIN LATERAL (
        SELECT control_status,credit_enabled,credit_limit_minor,credit_currency,payment_terms_code
        FROM commercial_financial_controls c0
        WHERE c0.commercial_account_id=a.id AND (c0.provider_id=pm.provider_id OR c0.provider_id IS NULL)
        ORDER BY c0.provider_id IS NOT NULL DESC,c0.updated_at DESC LIMIT 1
      ) c ON TRUE
      WHERE m.customer_id=${customerId} AND m.commercial_account_id=${commercialAccountId} AND m.status='active'
      LIMIT 1
    ` as unknown as Array<any>;
    const row = rows[0];
    if (!row || !VIEW_ROLES.has(String(row.role || ""))) return send(response, 404, { error: { code: "COMMERCIAL_ACCOUNT_NOT_FOUND", message: "That commercial account is not available to you." } });
    const approved = row.authority_status === "verified" && row.verification_status === "verified" && row.privilege_status === "enabled" && row.mapping_status === "verified" && row.control_status === "approved" && !!row.credit_enabled && !!row.payment_terms_code;
    if (!approved) return send(response, 200, { approved: false, commercialAccountId, credit: null });

    const creditLimitMinor = Number(row.credit_limit_minor || 0);
    const currency = String(row.credit_currency || "JMD").toUpperCase();
    if (!Number.isFinite(creditLimitMinor) || creditLimitMinor <= 0) return send(response, 200, { approved: false, commercialAccountId, credit: null });
    const availability = await getCommercialCreditAvailability({ commercialAccountId, currency, creditLimitMinor });
    return send(response, 200, {
      approved: true,
      commercialAccountId,
      paymentTermsCode: row.payment_terms_code,
      credit: availability,
      basis: "approved_limit_minus_provider_receivables_and_active_reservations",
    });
  } catch (error: any) {
    if (error?.message === "RATE_LIMITED") return send(response, 429, { error: { code: "RATE_LIMITED", message: "Too many credit availability requests. Please wait and try again." } });
    console.error("commercial_credit_availability_error", { code: error instanceof Error ? error.message : "unknown" });
    return send(response, 503, { error: { code: "COMMERCIAL_CREDIT_AVAILABILITY_UNAVAILABLE", message: "Commercial credit availability is temporarily unavailable.", retryable: true } });
  }
}
