import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";
import { createConfiguredTotalToolsPlatformService } from "../src/integrations/totalToolsPlatformRuntime.js";
import { enforceDurableRateLimit, recordSecurityEvent, requestIp } from "../src/server/securityInfrastructure.js";

const COOKIE_NAME = "sc_session";
const MAX_BODY_BYTES = 16_000;
const CREDIT_CHECKOUT_CUSTOMER_LIMIT = 8;
const CREDIT_CHECKOUT_IP_LIMIT = 24;
const PURCHASING_ROLES = new Set(["owner", "admin", "buyer", "approver"]);
const platformService = createConfiguredTotalToolsPlatformService();
let sqlClient: ReturnType<typeof neon> | undefined;

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("COMMERCE_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
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

function sameOrigin(request: any) {
  const origin = firstHeader(request.headers?.origin);
  if (!origin) return true;
  const host = firstHeader(request.headers?.host);
  if (!host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

async function readJsonBody<T>(request: AsyncIterable<unknown>): Promise<T> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    if (chunk === undefined || chunk === null) continue;
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    total += buffer.length;
    if (total > MAX_BODY_BYTES) throw Object.assign(new Error("BODY_TOO_LARGE"), { status: 413 });
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as T;
}

async function currentCustomerId(request: any) {
  const token = parseCookie(firstHeader(request.headers?.cookie))[COOKIE_NAME];
  if (!token) return undefined;
  const rows = await sql()`
    SELECT customer_id
    FROM customer_sessions
    WHERE token_hash = ${hashToken(token)}
      AND revoked_at IS NULL
      AND expires_at > NOW()
    LIMIT 1
  ` as Array<{ customer_id: string }>;
  return rows[0]?.customer_id;
}

function trustedPlatformRequest() {
  const businessAccountId = process.env.SMARTCOMMERCE_BUSINESS_ACCOUNT_ID?.trim();
  const providerId = process.env.SMARTCOMMERCE_PROVIDER_ID?.trim();
  if (!businessAccountId || !providerId) throw new Error("PLATFORM_CONTEXT_REQUIRED");
  const headers = new Headers({ Accept: "application/json" });
  headers.set("x-business-account-id", businessAccountId);
  headers.set("x-provider-id", providerId);
  return {
    businessAccountId,
    request: new Request("https://smartcommerce.internal/api/platform/orders", { method: "POST", headers }),
  };
}

function send(response: any, status: number, payload: unknown) {
  response.statusCode = status;
  response.end(JSON.stringify(payload));
}

type QuoteRow = {
  id: string;
  customer_id: string;
  cart_id: string;
  currency: string;
  subtotal_minor: number | string;
  tax_minor: number | string;
  delivery_minor: number | string;
  service_minor: number | string;
  total_minor: number | string;
  snapshot: any;
  expires_at: string | Date;
};

type CreditAccountRow = {
  account_id: string;
  display_name: string;
  role: string;
  authority_status: string;
  verification_status: string;
  privilege_status: string;
  mapping_status: string | null;
  provider_account_id: string | null;
  payment_terms_code: string | null;
};

export default async function handler(request: any, response: any) {
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");

  const method = String(request.method || "POST").toUpperCase();
  if (method !== "POST") {
    response.setHeader("Allow", "POST");
    return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "POST is required." } });
  }
  if (!sameOrigin(request)) return send(response, 403, { error: { code: "ORIGIN_REJECTED", message: "This request was rejected." } });

  let customerIdForAudit: string | undefined;
  try {
    const customerId = await currentCustomerId(request);
    customerIdForAudit = customerId;
    if (!customerId) return send(response, 401, { error: { code: "AUTH_REQUIRED", message: "Sign in to use commercial account credit." } });

    await enforceDurableRateLimit({ request, action: "commercial_credit_checkout_customer", subject: customerId, limit: CREDIT_CHECKOUT_CUSTOMER_LIMIT, windowSeconds: 600 });
    await enforceDurableRateLimit({ request, action: "commercial_credit_checkout_ip", subject: requestIp(request), limit: CREDIT_CHECKOUT_IP_LIMIT, windowSeconds: 600 });

    const input = await readJsonBody<{ quoteId?: string; commercialAccountId?: string; purchaseOrderReference?: string }>(request);
    const quoteId = String(input.quoteId || "").trim();
    const commercialAccountId = String(input.commercialAccountId || "").trim();
    const purchaseOrderReference = String(input.purchaseOrderReference || "").trim();

    if (!quoteId || quoteId.length > 80 || !commercialAccountId || commercialAccountId.length > 80 || purchaseOrderReference.length > 120) {
      return send(response, 400, { error: { code: "INVALID_CREDIT_CHECKOUT", message: "Choose a valid commercial account and checkout quote." } });
    }

    const [quoteRows, accountRows] = await Promise.all([
      sql()`
        SELECT id, customer_id, cart_id, currency, subtotal_minor, tax_minor, delivery_minor,
               service_minor, total_minor, snapshot, expires_at
        FROM checkout_quotes
        WHERE id = ${quoteId}
          AND customer_id = ${customerId}
        LIMIT 1
      ` as unknown as Promise<QuoteRow[]>,
      sql()`
        SELECT a.id AS account_id, a.display_name, m.role, m.authority_status,
               a.verification_status, a.privilege_status,
               pm.mapping_status, pm.provider_account_id, pm.payment_terms_code
        FROM commercial_account_members m
        JOIN commercial_accounts a ON a.id = m.commercial_account_id
        LEFT JOIN commercial_provider_mappings pm ON pm.commercial_account_id = a.id
        WHERE m.customer_id = ${customerId}
          AND m.commercial_account_id = ${commercialAccountId}
          AND m.status = 'active'
        LIMIT 1
      ` as unknown as Promise<CreditAccountRow[]>,
    ]);

    const quote = quoteRows[0];
    if (!quote) return send(response, 404, { error: { code: "CHECKOUT_QUOTE_NOT_FOUND", message: "That verified checkout quote is no longer available. Refresh checkout and try again." } });
    if (new Date(quote.expires_at).getTime() <= Date.now()) return send(response, 409, { error: { code: "CHECKOUT_QUOTE_EXPIRED", message: "Your verified quote expired. Refresh checkout to revalidate current pricing." } });

    const creditAccount = accountRows[0];
    const creditAllowed = Boolean(
      creditAccount &&
      PURCHASING_ROLES.has(creditAccount.role) &&
      creditAccount.authority_status === "verified" &&
      creditAccount.verification_status === "verified" &&
      creditAccount.privilege_status === "enabled" &&
      creditAccount.mapping_status === "verified" &&
      creditAccount.provider_account_id &&
      creditAccount.payment_terms_code,
    );
    if (!creditAllowed) {
      await recordSecurityEvent({ request, eventType: "commercial_credit_checkout_blocked", eventStatus: "blocked", riskLevel: "medium", customerId, metadata: { commercialAccountId, quoteId } });
      return send(response, 403, { error: { code: "COMMERCIAL_CREDIT_NOT_APPROVED", message: "This organisation is not currently approved for account-credit checkout. Complete commercial verification or contact the commercial team." } });
    }

    const approvalRules = await sql()`
      SELECT rule_type, currency, threshold_minor, threshold_days, approver_role
      FROM commercial_approval_rules
      WHERE commercial_account_id = ${commercialAccountId}
        AND active = true
        AND threshold_minor IS NOT NULL
      ORDER BY threshold_minor ASC
    ` as Array<{ rule_type: string; currency?: string | null; threshold_minor?: number | string | null; threshold_days?: number | null; approver_role: string }>;

    const totalMinor = Number(quote.total_minor || 0);
    const blockingRule = approvalRules.find((rule) => {
      const threshold = Number(rule.threshold_minor || 0);
      const currencyMatches = !rule.currency || String(rule.currency).toUpperCase() === String(quote.currency).toUpperCase();
      return currencyMatches && threshold > 0 && totalMinor > threshold && creditAccount.role !== rule.approver_role && !["owner", "admin"].includes(creditAccount.role);
    });
    if (blockingRule) {
      return send(response, 409, {
        error: {
          code: "COMMERCIAL_APPROVAL_REQUIRED",
          message: `This order exceeds your organisation's direct-purchase threshold and requires ${blockingRule.approver_role} approval before it can be placed on account.`,
        },
      });
    }

    const rawSnapshot = typeof quote.snapshot === "string" ? JSON.parse(quote.snapshot) : quote.snapshot;
    const snapshotItems = Array.isArray(rawSnapshot?.items) ? rawSnapshot.items : [];
    if (!snapshotItems.length) return send(response, 409, { error: { code: "CHECKOUT_QUOTE_INVALID", message: "The verified quote does not contain orderable items. Refresh checkout and try again." } });

    const { businessAccountId, request: platformRequest } = trustedPlatformRequest();
    const orderId = `ord_cc_${stableHash({ customerId, quoteId, commercialAccountId, purchaseOrderReference }).slice(0, 28)}`;
    const orderResult = await platformService.createOrder(platformRequest, {
      id: orderId,
      businessAccountId,
      customerAccountId: customerId,
      status: "submitted",
      currency: String(quote.currency || "JMD").toUpperCase(),
      lines: snapshotItems.map((item: any, index: number) => ({
        id: `${orderId}_line_${index + 1}`,
        productId: String(item.productId || "") || undefined,
        description: String(item.name || item.sku || item.productId || `Item ${index + 1}`),
        quantity: Math.max(1, Number(item.quantity || 1)),
        unitPrice: Number(item.unitPrice || 0),
        totalAmount: Number(item.unitPrice || 0) * Math.max(1, Number(item.quantity || 1)),
      })),
      subtotalAmount: Number(quote.subtotal_minor || 0) / 100,
      taxAmount: Number(quote.tax_minor || 0) / 100,
      totalAmount: totalMinor / 100,
      metadata: {
        source: "smartcommerce_commercial_credit_checkout",
        settlementMethod: "commercial_account_credit",
        commercialAccountId,
        commercialAccountName: creditAccount.display_name,
        providerCommercialAccountId: creditAccount.provider_account_id,
        paymentTermsCode: creditAccount.payment_terms_code,
        purchaseOrderReference: purchaseOrderReference || undefined,
        checkoutQuoteId: quoteId,
        quoteExpiresAt: new Date(quote.expires_at).toISOString(),
      },
    });

    if (!orderResult.success) {
      await recordSecurityEvent({ request, eventType: "commercial_credit_provider_rejected", eventStatus: "blocked", riskLevel: "medium", customerId, metadata: { commercialAccountId, quoteId, providerCode: orderResult.error.code } });
      return send(response, 409, { error: { code: "COMMERCIAL_CREDIT_PROVIDER_REJECTED", message: "The connected provider did not accept this account-credit order. Your cart and verified quote remain unchanged so the commercial team can help." } });
    }

    await sql()`UPDATE customer_carts SET status = 'submitted', updated_at = NOW() WHERE id = ${quote.cart_id} AND customer_id = ${customerId}`;
    await recordSecurityEvent({ request, eventType: "commercial_credit_order_created", eventStatus: "accepted", riskLevel: "info", customerId, metadata: { commercialAccountId, quoteId, orderId: orderResult.data.id, paymentTermsCode: creditAccount.payment_terms_code } });

    return send(response, 201, {
      order: {
        id: orderResult.data.id,
        status: orderResult.data.status,
        commercialAccountId,
        commercialAccountName: creditAccount.display_name,
        paymentTermsCode: creditAccount.payment_terms_code,
        purchaseOrderReference: purchaseOrderReference || null,
      },
    });
  } catch (error) {
    if (error instanceof SyntaxError) return send(response, 400, { error: { code: "INVALID_JSON", message: "The request body is invalid." } });
    const code = error instanceof Error ? error.message : "COMMERCIAL_CREDIT_CHECKOUT_FAILED";
    const status = Number((error as any)?.status || 500);
    if (code === "RATE_LIMITED") {
      const retryAfter = Math.max(1, Number((error as any)?.retryAfterSeconds || 60));
      response.setHeader("Retry-After", String(retryAfter));
      return send(response, 429, { error: { code: "RATE_LIMITED", message: "Too many credit-checkout attempts. Please wait and try again.", retryAfterSeconds: retryAfter } });
    }
    if (code === "PLATFORM_CONTEXT_REQUIRED") return send(response, 503, { error: { code: "COMMERCIAL_CREDIT_UNAVAILABLE", message: "Commercial credit checkout is temporarily unavailable because the provider connection is not configured." } });
    if (status === 413) return send(response, 413, { error: { code: "REQUEST_TOO_LARGE", message: "The request is too large." } });
    console.error("commercial_credit_checkout_error", { code: code === "COMMERCE_DATABASE_NOT_CONFIGURED" ? "database_not_configured" : "request_failed", customerId: customerIdForAudit || null });
    return send(response, 503, { error: { code: "COMMERCIAL_CREDIT_UNAVAILABLE", message: "Commercial credit checkout is temporarily unavailable.", retryable: true } });
  }
}
