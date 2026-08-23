import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";
import { createConfiguredTotalToolsPlatformService } from "../src/integrations/totalToolsPlatformRuntime.js";
import { enforceDurableRateLimit, recordSecurityEvent, requestIp } from "../src/server/securityInfrastructure.js";
import { recordCommercialLedgerEntry } from "../src/server/commercialAccountingLedger.js";
import {
  acquireCommercialCreditReservation,
  commitCommercialCreditReservation,
  releaseCommercialCreditReservation,
} from "../src/server/commercialCreditReservations.js";

const COOKIE_NAME = "sc_session";
const MAX_BODY_BYTES = 16_000;
const CUSTOMER_LIMIT = 8;
const IP_LIMIT = 24;
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
    if (chunk == null) continue;
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    total += buffer.length;
    if (total > MAX_BODY_BYTES) throw Object.assign(new Error("BODY_TOO_LARGE"), { status: 413 });
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as T;
}

async function currentSession(request: any) {
  const token = parseCookie(firstHeader(request.headers?.cookie))[COOKIE_NAME];
  if (!token) return undefined;
  const rows = await sql()`
    SELECT id, customer_id, auth_level, step_up_expires_at
    FROM customer_sessions
    WHERE token_hash = ${hashToken(token)}
      AND revoked_at IS NULL
      AND expires_at > NOW()
    LIMIT 1
  ` as Array<{ id: string; customer_id: string; auth_level: string; step_up_expires_at: string | Date | null }>;
  return rows[0];
}

function hasStrongStepUp(session: { auth_level: string; step_up_expires_at: string | Date | null }) {
  return ["mfa", "passkey"].includes(session.auth_level) && !!session.step_up_expires_at && new Date(session.step_up_expires_at).getTime() > Date.now();
}

function send(response: any, status: number, payload: unknown) {
  response.statusCode = status;
  response.end(JSON.stringify(payload));
}

type QuoteRow = {
  id: string;
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

type TrustRow = {
  display_name: string;
  role: string;
  authority_status: string;
  verification_status: string;
  privilege_status: string;
  mapping_status: string | null;
  provider_id: string | null;
  provider_account_id: string | null;
  mapping_terms_code: string | null;
};

type FinancialControlRow = {
  id: string;
  control_status: string;
  credit_enabled: boolean;
  credit_limit_minor: number | string | null;
  credit_currency: string | null;
  payment_terms_code: string | null;
  purchase_order_enabled: boolean;
};

export default async function handler(request: any, response: any) {
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");

  if (String(request.method || "").toUpperCase() !== "POST") {
    response.setHeader("Allow", "POST");
    return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "POST is required." } });
  }
  if (!sameOrigin(request)) return send(response, 403, { error: { code: "ORIGIN_REJECTED", message: "This request was rejected." } });

  try {
    const session = await currentSession(request);
    if (!session) return send(response, 401, { error: { code: "AUTH_REQUIRED", message: "Sign in to use commercial account credit." } });

    await enforceDurableRateLimit({ request, action: "commercial_credit_checkout_customer", subject: session.customer_id, limit: CUSTOMER_LIMIT, windowSeconds: 600 });
    await enforceDurableRateLimit({ request, action: "commercial_credit_checkout_ip", subject: requestIp(request), limit: IP_LIMIT, windowSeconds: 600 });

    const input = await readJsonBody<{ quoteId?: string; commercialAccountId?: string; purchaseOrderReference?: string }>(request);
    const quoteId = String(input.quoteId || "").trim();
    const commercialAccountId = String(input.commercialAccountId || "").trim();
    const purchaseOrderReference = String(input.purchaseOrderReference || "").trim();

    if (!quoteId || quoteId.length > 80 || !commercialAccountId || commercialAccountId.length > 80 || purchaseOrderReference.length > 120) {
      return send(response, 400, { error: { code: "INVALID_CREDIT_CHECKOUT", message: "Choose a valid commercial account and verified checkout quote." } });
    }

    if (!hasStrongStepUp(session)) {
      return send(response, 403, { error: { code: "STRONG_STEP_UP_REQUIRED", message: "Confirm with a passkey or authenticator before placing an order on commercial credit." } });
    }

    const quoteRows = await sql()`
      SELECT id, cart_id, currency, subtotal_minor, tax_minor, delivery_minor,
             service_minor, total_minor, snapshot, expires_at
      FROM checkout_quotes
      WHERE id = ${quoteId}
        AND customer_id = ${session.customer_id}
      LIMIT 1
    ` as QuoteRow[];
    const quote = quoteRows[0];
    if (!quote) return send(response, 404, { error: { code: "CHECKOUT_QUOTE_NOT_FOUND", message: "That verified checkout quote is no longer available. Refresh checkout and try again." } });
    if (new Date(quote.expires_at).getTime() <= Date.now()) return send(response, 409, { error: { code: "CHECKOUT_QUOTE_EXPIRED", message: "Your verified quote expired. Refresh checkout to revalidate current pricing." } });

    const snapshot = typeof quote.snapshot === "string" ? JSON.parse(quote.snapshot) : quote.snapshot;
    const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
    const fulfilment = snapshot?.fulfilment;
    if (!items.length) return send(response, 409, { error: { code: "CHECKOUT_QUOTE_INVALID", message: "The verified quote does not contain orderable items. Refresh checkout and try again." } });
    if (!fulfilment || fulfilment.status !== "bound" || !["pickup", "delivery"].includes(String(fulfilment.mode || ""))) {
      await recordSecurityEvent({ request, eventType: "commercial_credit_checkout_blocked", eventStatus: "fulfilment_not_bound", riskLevel: "medium", customerId: session.customer_id, commercialAccountId, sessionId: session.id, metadata: { quoteId } });
      return send(response, 409, { error: { code: "FULFILMENT_NOT_FINALIZED", message: "Finalize pickup or delivery before placing this order on commercial credit." } });
    }

    const trustRows = await sql()`
      SELECT a.display_name, m.role, m.authority_status,
             a.verification_status, a.privilege_status,
             pm.mapping_status, pm.provider_id, pm.provider_account_id,
             pm.payment_terms_code AS mapping_terms_code
      FROM commercial_account_members m
      JOIN commercial_accounts a ON a.id = m.commercial_account_id
      LEFT JOIN commercial_provider_mappings pm ON pm.commercial_account_id = a.id
      WHERE m.customer_id = ${session.customer_id}
        AND m.commercial_account_id = ${commercialAccountId}
        AND m.status = 'active'
      LIMIT 1
    ` as TrustRow[];
    const trust = trustRows[0];
    if (!trust || !PURCHASING_ROLES.has(trust.role) || trust.authority_status !== "verified" || trust.verification_status !== "verified" || trust.privilege_status !== "enabled" || trust.mapping_status !== "verified" || !trust.provider_id || !trust.provider_account_id) {
      await recordSecurityEvent({ request, eventType: "commercial_credit_checkout_blocked", eventStatus: "commercial_not_verified", riskLevel: "high", customerId: session.customer_id, commercialAccountId, sessionId: session.id });
      return send(response, 403, { error: { code: "COMMERCIAL_CREDIT_NOT_APPROVED", message: "This organisation is not currently approved for account-credit checkout." } });
    }

    const controlRows = await sql()`
      SELECT id, control_status, credit_enabled, credit_limit_minor, credit_currency,
             payment_terms_code, purchase_order_enabled
      FROM commercial_financial_controls
      WHERE commercial_account_id = ${commercialAccountId}
        AND (provider_id = ${trust.provider_id} OR provider_id IS NULL)
      ORDER BY provider_id IS NOT NULL DESC, updated_at DESC
      LIMIT 1
    ` as FinancialControlRow[];
    const control = controlRows[0];
    const totalMinor = Number(quote.total_minor || 0);
    const quoteCurrency = String(quote.currency || "JMD").toUpperCase();
    const termsCode = control?.payment_terms_code || trust.mapping_terms_code || null;
    const creditLimitMinor = Number(control?.credit_limit_minor || 0);
    const currencyMatches = !control?.credit_currency || String(control.credit_currency).toUpperCase() === quoteCurrency;

    if (!control || control.control_status !== "approved" || !control.credit_enabled || !termsCode || !Number.isFinite(creditLimitMinor) || creditLimitMinor <= 0 || !currencyMatches) {
      await recordSecurityEvent({ request, eventType: "commercial_credit_checkout_blocked", eventStatus: "financial_control_blocked", riskLevel: "high", customerId: session.customer_id, commercialAccountId, sessionId: session.id, metadata: { quoteId, totalMinor, quoteCurrency, controlId: control?.id || null } });
      return send(response, 403, { error: { code: "COMMERCIAL_CREDIT_LIMIT_OR_TERMS", message: "This order is not within the organisation's currently approved credit controls. Contact the commercial team or request a financial override." } });
    }

    if (purchaseOrderReference && !control.purchase_order_enabled) {
      return send(response, 403, { error: { code: "PURCHASE_ORDER_NOT_ENABLED", message: "Purchase-order references are not enabled for this commercial account." } });
    }

    const businessAccountId = process.env.SMARTCOMMERCE_BUSINESS_ACCOUNT_ID?.trim();
    const providerId = process.env.SMARTCOMMERCE_PROVIDER_ID?.trim();
    if (!businessAccountId || !providerId) return send(response, 503, { error: { code: "COMMERCIAL_CREDIT_UNAVAILABLE", message: "Commercial credit checkout is temporarily unavailable because the provider connection is not configured." } });

    const reservation = await acquireCommercialCreditReservation({
      commercialAccountId,
      customerId: session.customer_id,
      quoteId,
      currency: quoteCurrency,
      amountMinor: totalMinor,
      creditLimitMinor,
    });
    if (!reservation.acquired) {
      if (reservation.reason === "already_committed") {
        return send(response, 409, { error: { code: "COMMERCIAL_CREDIT_ALREADY_SUBMITTED", message: "This verified quote has already been submitted on commercial credit." }, orderId: reservation.orderId || null });
      }
      if (reservation.reason === "already_in_progress") {
        return send(response, 409, { error: { code: "COMMERCIAL_CREDIT_IN_PROGRESS", message: "This commercial-credit order is already being processed. Please wait before trying again." } });
      }
      await recordSecurityEvent({ request, eventType: "commercial_credit_checkout_blocked", eventStatus: "insufficient_available_credit", riskLevel: "high", customerId: session.customer_id, commercialAccountId, sessionId: session.id, metadata: { quoteId, totalMinor, quoteCurrency, creditLimitMinor, availableMinor: "availableMinor" in reservation ? reservation.availableMinor : null } });
      return send(response, 409, {
        error: { code: "COMMERCIAL_CREDIT_INSUFFICIENT_AVAILABLE", message: "This order is above the organisation's currently available credit. Existing outstanding invoices and in-progress credit orders are included in the calculation." },
        credit: "availableMinor" in reservation ? {
          limitMinor: reservation.creditLimitMinor,
          outstandingMinor: reservation.outstandingMinor,
          reservedMinor: reservation.reservedMinor,
          availableMinor: reservation.availableMinor,
          currency: reservation.currency,
        } : undefined,
      });
    }

    const headers = new Headers({ Accept: "application/json" });
    headers.set("x-business-account-id", businessAccountId);
    headers.set("x-provider-id", providerId);
    const platformRequest = new Request("https://smartcommerce.internal/api/platform/orders", { method: "POST", headers });
    const orderId = `ord_cc_${stableHash({ customerId: session.customer_id, quoteId, commercialAccountId, purchaseOrderReference }).slice(0, 28)}`;

    let orderResult: Awaited<ReturnType<typeof platformService.createOrder>>;
    try {
      orderResult = await platformService.createOrder(platformRequest, {
        id: orderId,
        businessAccountId,
        customerAccountId: session.customer_id,
        status: "submitted",
        currency: quoteCurrency,
        lines: items.map((item: any, index: number) => ({
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
          commercialAccountName: trust.display_name,
          providerCommercialAccountId: trust.provider_account_id,
          paymentTermsCode: termsCode,
          purchaseOrderReference: purchaseOrderReference || null,
          checkoutQuoteId: quoteId,
          approvedCreditLimitMinor: String(control.credit_limit_minor || ""),
          availableCreditBeforeMinor: String(reservation.availableBeforeMinor),
          reservedCreditMinor: String(totalMinor),
          creditCurrency: control.credit_currency || quoteCurrency,
          fulfilmentMode: String(fulfilment.mode),
          deliveryMinor: String(quote.delivery_minor || 0),
          deliveryProvider: fulfilment.provider || null,
          deliveryServiceId: fulfilment.serviceId || null,
          deliveryServiceLabel: fulfilment.serviceLabel || null,
          deliveryAddress: fulfilment.address ? JSON.stringify(fulfilment.address) : null,
        },
      });
    } catch (providerError) {
      await releaseCommercialCreditReservation(reservation.reservationId).catch(() => undefined);
      throw providerError;
    }

    if (!orderResult.success) {
      await releaseCommercialCreditReservation(reservation.reservationId).catch(() => undefined);
      await recordSecurityEvent({ request, eventType: "commercial_credit_provider_rejected", eventStatus: "provider_rejected", riskLevel: "high", customerId: session.customer_id, commercialAccountId, sessionId: session.id, metadata: { quoteId, providerCode: orderResult.error.code } });
      return send(response, 409, { error: { code: "COMMERCIAL_CREDIT_PROVIDER_REJECTED", message: "The connected provider did not accept this account-credit order. Your cart remains unchanged." } });
    }

    await commitCommercialCreditReservation(reservation.reservationId, orderResult.data.id);
    await sql()`UPDATE customer_carts SET status = 'submitted', updated_at = NOW() WHERE id = ${quote.cart_id} AND customer_id = ${session.customer_id}`;
    try {
      await recordCommercialLedgerEntry({
        commercialAccountId,
        customerId: session.customer_id,
        entryType: "order_charge",
        reference: orderResult.data.id,
        externalReference: orderResult.data.id,
        orderId: orderResult.data.id,
        purchaseOrderReference: purchaseOrderReference || null,
        description: `Commercial account order ${orderResult.data.id}`,
        currency: quoteCurrency,
        debitMinor: totalMinor,
        status: orderResult.data.status || "submitted",
        source: "smartcommerce",
        sourceCoverage: "smartcommerce_only",
        metadata: {
          checkoutQuoteId: quoteId,
          paymentTermsCode: termsCode,
          providerCommercialAccountId: trust.provider_account_id,
          fulfilmentMode: String(fulfilment.mode),
          deliveryMinor: String(quote.delivery_minor || 0),
          deliveryProvider: fulfilment.provider || null,
          deliveryServiceId: fulfilment.serviceId || null,
          creditReservationId: reservation.reservationId,
          availableCreditBeforeMinor: String(reservation.availableBeforeMinor),
        },
      });
    } catch (ledgerError) {
      console.error("commercial_credit_ledger_record_failed", { orderId: orderResult.data.id, commercialAccountId, code: ledgerError instanceof Error ? ledgerError.message : "record_failed" });
      await recordSecurityEvent({ request, eventType: "commercial_credit_ledger_record_failed", eventStatus: "reconciliation_required", riskLevel: "high", customerId: session.customer_id, commercialAccountId, sessionId: session.id, metadata: { quoteId, orderId: orderResult.data.id } });
    }
    await recordSecurityEvent({ request, eventType: "commercial_credit_order_created", eventStatus: "provider_accepted", riskLevel: "medium", customerId: session.customer_id, commercialAccountId, sessionId: session.id, metadata: { quoteId, orderId: orderResult.data.id, paymentTermsCode: termsCode, fulfilmentMode: fulfilment.mode, deliveryMinor: Number(quote.delivery_minor || 0), creditReservationId: reservation.reservationId } });

    return send(response, 201, {
      order: {
        id: orderResult.data.id,
        status: orderResult.data.status,
        commercialAccountId,
        commercialAccountName: trust.display_name,
        paymentTermsCode: termsCode,
        purchaseOrderReference: purchaseOrderReference || null,
      },
      credit: {
        limitMinor: creditLimitMinor,
        availableBeforeMinor: reservation.availableBeforeMinor,
        reservedMinor: totalMinor,
        availableAfterMinor: Math.max(0, reservation.availableBeforeMinor - totalMinor),
        currency: quoteCurrency,
      },
    });
  } catch (error) {
    if (error instanceof SyntaxError) return send(response, 400, { error: { code: "INVALID_JSON", message: "The request body is invalid." } });
    if ((error as any)?.status === 413) return send(response, 413, { error: { code: "REQUEST_TOO_LARGE", message: "The request is too large." } });
    if (error instanceof Error && error.message === "RATE_LIMITED") {
      const retryAfter = Math.max(1, Number((error as any)?.retryAfterSeconds || 60));
      response.setHeader("Retry-After", String(retryAfter));
      return send(response, 429, { error: { code: "RATE_LIMITED", message: "Too many commercial-credit attempts. Please wait and try again.", retryAfterSeconds: retryAfter } });
    }
    console.error("commercial_credit_checkout_error", { code: "request_failed" });
    return send(response, 503, { error: { code: "COMMERCIAL_CREDIT_UNAVAILABLE", message: "Commercial credit checkout is temporarily unavailable.", retryable: true } });
  }
}
