import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { enforceDurableRateLimit, requestIp } from "../src/server/securityInfrastructure.js";
import { getPaymentAttemptForCustomer, preparePaymentAttempt, type PaymentMethodId } from "../src/server/paymentSettlement.js";

const COOKIE_NAME = "sc_session";
const MAX_BODY_BYTES = 8_000;
const METHODS = new Set<PaymentMethodId>(["apple-pay", "google-pay", "click-to-pay", "paypal", "card", "pay-in-store"]);
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
function sameOrigin(request: any) {
  const origin = firstHeader(request.headers?.origin); if (!origin) return true;
  const host = firstHeader(request.headers?.host); if (!host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}
async function currentCustomerId(request: any) {
  const token = parseCookie(firstHeader(request.headers?.cookie))[COOKIE_NAME]; if (!token) return undefined;
  const rows = await sql()`SELECT customer_id FROM customer_sessions WHERE token_hash=${hashToken(token)} AND revoked_at IS NULL AND expires_at > NOW() LIMIT 1` as Array<{customer_id:string}>;
  return rows[0]?.customer_id;
}
async function readJsonBody<T>(request: AsyncIterable<unknown>): Promise<T> {
  const chunks: Buffer[]=[]; let total=0;
  for await (const chunk of request) { if (chunk == null) continue; const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(String(chunk)); total+=buffer.length; if (total>MAX_BODY_BYTES) throw Object.assign(new Error("BODY_TOO_LARGE"),{status:413}); chunks.push(buffer); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as T;
}
function configured(value: string | undefined) { return Boolean(value && value.trim()); }
function methodCapability(method: PaymentMethodId) {
  const primaryReady = configured(process.env.PAYMENT_PRIMARY_PROVIDER) && configured(process.env.PAYMENT_WEBHOOK_SECRET);
  const paypalReady = configured(process.env.PAYPAL_CLIENT_ID) && configured(process.env.PAYPAL_CLIENT_SECRET) && configured(process.env.PAYPAL_WEBHOOK_ID);
  const storeReady = configured(process.env.STORE_POS_PAYMENT_CONFIRMATION_URL) && configured(process.env.STORE_POS_PAYMENT_CONFIRMATION_SECRET);
  const flag = (name:string) => process.env[name] === "true";
  if (method === "paypal") return { enabled: paypalReady && flag("PAYMENT_PAYPAL_ENABLED"), provider: "paypal" };
  if (method === "pay-in-store") return { enabled: storeReady && flag("PAYMENT_PAY_IN_STORE_ENABLED"), provider: "store_pos" };
  const flags: Record<string,string> = { "apple-pay":"PAYMENT_APPLE_PAY_ENABLED", "google-pay":"PAYMENT_GOOGLE_PAY_ENABLED", "click-to-pay":"PAYMENT_CLICK_TO_PAY_ENABLED", card:"PAYMENT_CARD_ENABLED" };
  return { enabled: primaryReady && flag(flags[method]), provider: String(process.env.PAYMENT_PRIMARY_PROVIDER || "").trim() || "primary_acquirer" };
}
function send(response:any,status:number,payload:unknown){ response.statusCode=status; response.setHeader("Content-Type","application/json"); response.setHeader("Cache-Control","no-store"); response.setHeader("X-Content-Type-Options","nosniff"); response.setHeader("Referrer-Policy","same-origin"); response.end(JSON.stringify(payload)); }

export default async function handler(request:any,response:any) {
  const method = String(request.method || "GET").toUpperCase();
  if (!["GET","POST"].includes(method)) { response.setHeader("Allow","GET, POST"); return send(response,405,{error:{code:"METHOD_NOT_ALLOWED",message:"GET or POST is required."}}); }
  if (!sameOrigin(request)) return send(response,403,{error:{code:"ORIGIN_REJECTED",message:"This request was rejected."}});
  try {
    const customerId = await currentCustomerId(request);
    if (!customerId) return send(response,401,{error:{code:"AUTH_REQUIRED",message:"Sign in before starting an online payment."}});

    if (method === "GET") {
      const attemptId = String(request.query?.attemptId || "").trim();
      if (!attemptId || attemptId.length > 100) return send(response,400,{error:{code:"INVALID_PAYMENT_ATTEMPT",message:"Choose a valid payment attempt."}});
      const attempt = await getPaymentAttemptForCustomer({ customerId, attemptId });
      if (!attempt) return send(response,404,{error:{code:"PAYMENT_ATTEMPT_NOT_FOUND",message:"That payment attempt was not found."}});
      return send(response,200,{ attempt, policy:{ browserRedirectIsProofOfPayment:false, paidRequiresVerifiedProviderEvidence:true } });
    }

    await enforceDurableRateLimit({ request, action:"payment_attempt_customer", subject:customerId, limit:20, windowSeconds:600 });
    await enforceDurableRateLimit({ request, action:"payment_attempt_ip", subject:requestIp(request), limit:60, windowSeconds:600 });
    const input = await readJsonBody<{quoteId?:string; paymentMethod?:string}>(request);
    const quoteId = String(input.quoteId || "").trim();
    const paymentMethod = String(input.paymentMethod || "") as PaymentMethodId;
    if (!quoteId || quoteId.length > 80 || !METHODS.has(paymentMethod)) return send(response,400,{error:{code:"INVALID_PAYMENT_REQUEST",message:"Choose a valid verified quote and payment method."}});

    const rows = await sql()`SELECT id,currency,total_minor,snapshot,expires_at FROM checkout_quotes WHERE id=${quoteId} AND customer_id=${customerId} LIMIT 1` as unknown as Array<any>;
    const quote = rows[0];
    if (!quote) return send(response,404,{error:{code:"CHECKOUT_QUOTE_NOT_FOUND",message:"That verified checkout quote is no longer available."}});
    if (new Date(quote.expires_at).getTime() <= Date.now()) return send(response,409,{error:{code:"CHECKOUT_QUOTE_EXPIRED",message:"Your verified quote expired. Refresh checkout before paying."}});
    const snapshot = typeof quote.snapshot === "string" ? JSON.parse(quote.snapshot) : quote.snapshot;
    if (!snapshot?.fulfilment || snapshot.fulfilment.status !== "bound") return send(response,409,{error:{code:"FULFILMENT_NOT_FINALIZED",message:"Finalize pickup or delivery before starting payment."}});
    const amountMinor = Number(quote.total_minor || 0);
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return send(response,409,{error:{code:"INVALID_PAYMENT_AMOUNT",message:"This order does not have a valid payable total."}});

    const capability = methodCapability(paymentMethod);
    if (!capability.enabled) return send(response,409,{error:{code:"PAYMENT_METHOD_UNAVAILABLE",message:"That payment method is not enabled for this merchant environment."}});

    const attempt = await preparePaymentAttempt({ customerId, quoteId, method:paymentMethod, provider:capability.provider, currency:String(quote.currency || "JMD"), amountMinor });
    return send(response,201,{
      attempt:{ id:attempt.id, quoteId:attempt.quote_id, paymentMethod:attempt.payment_method, provider:attempt.provider, currency:attempt.currency, amountMinor:Number(attempt.amount_minor), status:attempt.status },
      launch:{ ready:false, reason:"The provider launch adapter is not connected yet. No charge was attempted." },
      policy:{ browserRedirectIsProofOfPayment:false, paidRequiresVerifiedProviderEvidence:true, confirmationSources:["verified_webhook","server_side_provider_query","verified_pos_confirmation"] }
    });
  } catch (error:any) {
    if (error instanceof SyntaxError) return send(response,400,{error:{code:"INVALID_JSON",message:"The request body is invalid."}});
    if (error?.message === "RATE_LIMITED") { const retryAfter=Math.max(1,Number(error?.retryAfterSeconds||60)); response.setHeader("Retry-After",String(retryAfter)); return send(response,429,{error:{code:"RATE_LIMITED",message:"Too many payment attempts. Please wait and try again.",retryAfterSeconds:retryAfter}}); }
    if (Number(error?.status) === 413) return send(response,413,{error:{code:"REQUEST_TOO_LARGE",message:"The request is too large."}});
    console.error("payment_attempt_api_error",{code:error instanceof Error ? error.message : "unknown"});
    return send(response,503,{error:{code:"PAYMENT_ATTEMPT_UNAVAILABLE",message:"Payment preparation is temporarily unavailable.",retryable:true}});
  }
}
