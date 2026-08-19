import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";
import { getCommercialLedgerStatement } from "../src/server/commercialAccountingLedger.js";

const COOKIE_NAME = "sc_session";
const FINANCIAL_VIEW_ROLES = new Set(["owner", "admin", "approver", "buyer"]);
let sqlClient: ReturnType<typeof neon> | undefined;

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("COMMERCIAL_ACCOUNTING_DATABASE_NOT_CONFIGURED");
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

function send(response: any, status: number, payload: unknown) {
  response.statusCode = status;
  response.end(JSON.stringify(payload));
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function safePeriod(value: unknown, fallback: Date) {
  const parsed = new Date(String(value || ""));
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export default async function handler(request: any, response: any) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");

  if (String(request.method || "GET").toUpperCase() !== "GET") {
    response.setHeader("Allow", "GET");
    response.setHeader("Content-Type", "application/json");
    return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "GET is required." } });
  }

  try {
    const customerId = await currentCustomerId(request);
    if (!customerId) {
      response.setHeader("Content-Type", "application/json");
      return send(response, 401, { error: { code: "AUTH_REQUIRED", message: "Sign in to view commercial account activity." } });
    }

    const accountId = String(request.query?.accountId || "").trim();
    if (!accountId || accountId.length > 80) {
      response.setHeader("Content-Type", "application/json");
      return send(response, 400, { error: { code: "COMMERCIAL_ACCOUNT_REQUIRED", message: "Choose a commercial account." } });
    }

    const membershipRows = await sql()`
      SELECT m.role, m.authority_status, a.display_name, a.verification_status, a.privilege_status
      FROM commercial_account_members m
      JOIN commercial_accounts a ON a.id = m.commercial_account_id
      WHERE m.customer_id = ${customerId}
        AND m.commercial_account_id = ${accountId}
        AND m.status = 'active'
      LIMIT 1
    ` as Array<{ role: string; authority_status: string; display_name: string; verification_status: string; privilege_status: string }>;
    const membership = membershipRows[0];
    if (!membership) {
      response.setHeader("Content-Type", "application/json");
      return send(response, 404, { error: { code: "COMMERCIAL_ACCOUNT_NOT_FOUND", message: "That commercial account is not available to you." } });
    }
    if (!FINANCIAL_VIEW_ROLES.has(membership.role)) {
      response.setHeader("Content-Type", "application/json");
      return send(response, 403, { error: { code: "COMMERCIAL_FINANCIAL_ROLE_REQUIRED", message: "Your commercial role is not authorised to view financial account activity." } });
    }

    const now = new Date();
    const startDefault = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const endDefault = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const startAt = safePeriod(request.query?.start, startDefault);
    const endAt = safePeriod(request.query?.end, endDefault);
    if (endAt.getTime() <= startAt.getTime() || endAt.getTime() - startAt.getTime() > 370 * 24 * 60 * 60 * 1000) {
      response.setHeader("Content-Type", "application/json");
      return send(response, 400, { error: { code: "INVALID_STATEMENT_PERIOD", message: "Choose a valid statement period of up to 12 months." } });
    }

    const [statement, controlsRows] = await Promise.all([
      getCommercialLedgerStatement({ commercialAccountId: accountId, startAt: startAt.toISOString(), endAt: endAt.toISOString() }),
      sql()`
        SELECT control_status, credit_enabled, credit_limit_minor, credit_currency,
               payment_terms_code, purchase_order_enabled, reviewed_at
        FROM commercial_financial_controls
        WHERE commercial_account_id = ${accountId}
        ORDER BY updated_at DESC
        LIMIT 1
      ` as unknown as Promise<Array<any>>,
    ]);
    const control = controlsRows[0] || null;

    const payload = {
      account: {
        id: accountId,
        displayName: membership.display_name,
        role: membership.role,
        authorityStatus: membership.authority_status,
        verificationStatus: membership.verification_status,
        privilegeStatus: membership.privilege_status,
      },
      period: { start: startAt.toISOString(), end: endAt.toISOString() },
      financialControls: control ? {
        status: control.control_status,
        creditEnabled: control.control_status === "approved" && Boolean(control.credit_enabled),
        creditLimitMinor: control.control_status === "approved" && control.credit_enabled ? String(control.credit_limit_minor || "0") : null,
        creditCurrency: control.credit_currency || null,
        paymentTermsCode: control.control_status === "approved" ? control.payment_terms_code || null : null,
        purchaseOrderEnabled: control.control_status === "approved" && Boolean(control.purchase_order_enabled),
        reviewedAt: control.reviewed_at || null,
      } : null,
      statement,
      disclosure: statement.summary.coverage === "provider_synced"
        ? "This statement period is provider-synced and can be used as the official SmartCommerce account view."
        : "This statement currently contains SmartCommerce-recorded activity only. Provider/accounting history is not yet fully synced, so no official outstanding balance is represented.",
    };

    if (String(request.query?.format || "").toLowerCase() === "csv") {
      const rows = [
        ["Date", "Type", "Reference", "Description", "PO / Job Reference", "Status", "Currency", "Debit", "Credit", "Source"],
        ...statement.entries.map((entry: any) => [
          new Date(entry.occurred_at).toISOString(),
          entry.entry_type,
          entry.reference,
          entry.description,
          entry.purchase_order_reference || "",
          entry.status,
          entry.currency,
          (Number(entry.debit_minor || 0) / 100).toFixed(2),
          (Number(entry.credit_minor || 0) / 100).toFixed(2),
          entry.source,
        ]),
      ];
      response.setHeader("Content-Type", "text/csv; charset=utf-8");
      response.setHeader("Content-Disposition", `attachment; filename="${accountId}-statement-${startAt.toISOString().slice(0, 10)}-${endAt.toISOString().slice(0, 10)}.csv"`);
      response.statusCode = 200;
      response.end(rows.map((row) => row.map(csvCell).join(",")).join("\n"));
      return;
    }

    response.setHeader("Content-Type", "application/json");
    return send(response, 200, payload);
  } catch (error) {
    console.error("commercial_accounting_error", { code: error instanceof Error ? error.message : "request_failed" });
    response.setHeader("Content-Type", "application/json");
    return send(response, 503, { error: { code: "COMMERCIAL_ACCOUNTING_UNAVAILABLE", message: "Commercial account activity is temporarily unavailable." } });
  }
}
