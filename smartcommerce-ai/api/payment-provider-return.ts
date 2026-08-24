import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { getPaymentAttemptForCustomer } from "../src/server/paymentSettlement.js";
import { applyVerifiedProviderEvidence } from "../src/server/paymentProviderEvidence.js";
import { getPaymentProviderAdapter, type PaymentProviderKey } from "../src/server/paymentProviderAdapters.js";

const COOKIE_NAME = "sc_session";
let sqlClient: ReturnType<typeof neon> | undefined;

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("PAYMENT_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}
function firstHeader(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
function parseCookie(header?: string) {
  const result: Record<string,string> = {};
  for (const part of (header || "").split(";")) {
    const index = part.indexOf("="); if (index <= 0) continue;
    const key = part.slice(0,index).trim(); const value = part.slice(index+1).trim();
    try { result[key] = decodeURIComponent(value); } catch { result[key] = value; }
  }
  return result;
}
async function currentCustomerId(request:any) {
  const token = parseCookie(firstHeader(request.headers?.cookie))[COOKIE_NAME];
  if (!token) return undefined;
  const rows = await sql()`SELECT customer_id FROM customer_sessions WHERE token_hash=${hashToken(token)} AND revoked_at IS NULL AND expires_at > NOW() LIMIT 1` as Array<{customer_id:string}>;
  return rows[0]?.customer_id;
}
function redirect(response:any, location:string) {
  response.statusCode = 303;
  response.setHeader("Location", location);
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Referrer-Policy", "same-origin");
  response.end();
}

export default async function handler(request:any,response:any) {
  if (String(request.method || "GET").toUpperCase() !== "GET") {
    response.setHeader("Allow", "GET");
    response.statusCode = 405;
    return response.end();
  }
  try {
    const customerId = await currentCustomerId(request);
    if (!customerId) return redirect(response, "/#/account/orders?payment=signin-required");

    const provider = String(request.query?.provider || "").trim() as PaymentProviderKey;
    const attemptId = String(request.query?.attemptId || "").trim();
    if (!provider || !attemptId || attemptId.length > 100) return redirect(response, "/#/account/orders?payment=invalid-return");

    const attempt = await getPaymentAttemptForCustomer({ customerId, attemptId });
    if (!attempt) return redirect(response, "/#/account/orders?payment=attempt-not-found");
    if (String(attempt.provider || "") !== provider) return redirect(response, "/#/account/orders?payment=provider-mismatch");
    if (request.query?.cancel === "1") return redirect(response, `/#/account/orders?payment=cancelled&attemptId=${encodeURIComponent(attemptId)}`);
    if (attempt.status === "confirmed") return redirect(response, `/#/account/orders?payment=confirmed&attemptId=${encodeURIComponent(attemptId)}`);

    const providerPaymentId = String(attempt.provider_payment_id || "").trim();
    if (!providerPaymentId) return redirect(response, `/#/account/orders?payment=pending&attemptId=${encodeURIComponent(attemptId)}`);
    const adapter = getPaymentProviderAdapter(provider);
    if (!adapter?.completeReturn) return redirect(response, `/#/account/orders?payment=pending&attemptId=${encodeURIComponent(attemptId)}`);

    const evidence = await adapter.completeReturn({ attemptId, providerPaymentId, query: request.query || {} });
    const applied = await applyVerifiedProviderEvidence(provider, evidence);
    const state = evidence.status === "confirmed" && applied.applied ? "confirmed" : evidence.status === "failed" ? "failed" : "pending";
    return redirect(response, `/#/account/orders?payment=${state}&attemptId=${encodeURIComponent(attemptId)}`);
  } catch (error:any) {
    console.error("payment_provider_return_error", { code: error instanceof Error ? error.message : "unknown" });
    return redirect(response, "/#/account/orders?payment=verification-pending");
  }
}
