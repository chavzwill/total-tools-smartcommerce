import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";

const COOKIE_NAME = "sc_session";
const MAX_BODY_BYTES = 24_000;
let sqlClient: ReturnType<typeof neon> | undefined;

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("COMMERCIAL_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
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

async function membership(customerId: string, accountId: string) {
  const rows = await sql()`
    SELECT role, status
    FROM commercial_account_members
    WHERE customer_id = ${customerId}
      AND commercial_account_id = ${accountId}
      AND status = 'active'
    LIMIT 1
  ` as Array<{ role: string; status: string }>;
  return rows[0];
}

async function listAccounts(customerId: string) {
  return await sql()`
    SELECT a.id, a.display_name, a.legal_name, a.account_type, a.tax_identifier, a.status,
           m.role, m.status AS membership_status, a.created_at, a.updated_at,
           pm.provider_id, pm.provider_customer_id, pm.provider_account_id,
           pm.provider_price_list_id, pm.payment_terms_code, pm.mapping_status
    FROM commercial_account_members m
    JOIN commercial_accounts a ON a.id = m.commercial_account_id
    LEFT JOIN commercial_provider_mappings pm ON pm.commercial_account_id = a.id
    WHERE m.customer_id = ${customerId}
      AND m.status = 'active'
    ORDER BY a.updated_at DESC
  ` as Array<Record<string, unknown>>;
}

async function accountDetails(customerId: string, accountId: string) {
  const member = await membership(customerId, accountId);
  if (!member) return undefined;
  const [accounts, sites, projects, rules, members] = await Promise.all([
    sql()`SELECT id, display_name, legal_name, account_type, tax_identifier, status, created_at, updated_at FROM commercial_accounts WHERE id = ${accountId} LIMIT 1`,
    sql()`SELECT id, name, line1, line2, city, region, postal_code, country_code, contact_name, contact_phone, active FROM commercial_sites WHERE commercial_account_id = ${accountId} AND active = true ORDER BY name`,
    sql()`SELECT id, site_id, name, reference_code, description, status, start_date, target_end_date, created_at, updated_at FROM commercial_projects WHERE commercial_account_id = ${accountId} ORDER BY updated_at DESC`,
    sql()`SELECT id, rule_type, currency, threshold_minor, threshold_days, approver_role, active FROM commercial_approval_rules WHERE commercial_account_id = ${accountId} AND active = true ORDER BY created_at`,
    sql()`SELECT m.id, m.customer_id, m.role, m.status, c.full_name, c.email FROM commercial_account_members m JOIN customer_accounts c ON c.id = m.customer_id WHERE m.commercial_account_id = ${accountId} AND m.status <> 'removed' ORDER BY m.created_at`,
  ]);
  return { account: (accounts as any[])[0], role: member.role, sites, projects, approvalRules: rules, members };
}

function send(response: any, status: number, payload: unknown) {
  response.statusCode = status;
  response.end(JSON.stringify(payload));
}

export default async function handler(request: any, response: any) {
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");
  const method = String(request.method || "GET").toUpperCase();

  try {
    const customerId = await currentCustomerId(request);
    if (!customerId) return send(response, 401, { error: { code: "AUTH_REQUIRED", message: "Sign in to manage commercial accounts." } });

    if (method === "GET") {
      const accountId = String(request.query?.accountId || "").trim();
      if (accountId) {
        const details = await accountDetails(customerId, accountId);
        if (!details) return send(response, 404, { error: { code: "COMMERCIAL_ACCOUNT_NOT_FOUND", message: "That commercial account is not available to you." } });
        return send(response, 200, { details });
      }
      return send(response, 200, { accounts: await listAccounts(customerId) });
    }

    if (method !== "POST") {
      response.setHeader("Allow", "GET, POST");
      return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "GET or POST is required." } });
    }
    if (!sameOrigin(request)) return send(response, 403, { error: { code: "ORIGIN_REJECTED", message: "This request was rejected." } });

    const input = await readJsonBody<any>(request);
    const action = String(input.action || "");

    if (action === "create_account") {
      const displayName = String(input.displayName || "").trim();
      const legalName = String(input.legalName || "").trim();
      const taxIdentifier = String(input.taxIdentifier || "").trim();
      const accountType = ["business", "contractor", "government", "organisation"].includes(input.accountType) ? input.accountType : "business";
      if (displayName.length < 2 || displayName.length > 160 || legalName.length > 200 || taxIdentifier.length > 80) {
        return send(response, 400, { error: { code: "INVALID_COMMERCIAL_ACCOUNT", message: "Enter valid commercial account details." } });
      }
      const accountId = `com_${randomBytes(16).toString("hex")}`;
      const memberId = `cmm_${randomBytes(16).toString("hex")}`;
      await sql().transaction([
        sql()`INSERT INTO commercial_accounts (id, display_name, legal_name, account_type, tax_identifier, status, created_by_customer_id) VALUES (${accountId}, ${displayName}, ${legalName || null}, ${accountType}, ${taxIdentifier || null}, 'pending', ${customerId})`,
        sql()`INSERT INTO commercial_account_members (id, commercial_account_id, customer_id, role, status, invited_by_customer_id) VALUES (${memberId}, ${accountId}, ${customerId}, 'owner', 'active', ${customerId})`,
      ]);
      return send(response, 201, { details: await accountDetails(customerId, accountId) });
    }

    if (action === "create_site") {
      const accountId = String(input.accountId || "");
      const member = await membership(customerId, accountId);
      if (!member || !["owner", "admin"].includes(member.role)) return send(response, 403, { error: { code: "COMMERCIAL_PERMISSION_DENIED", message: "You do not have permission to add job sites." } });
      const name = String(input.name || "").trim();
      if (name.length < 2 || name.length > 160) return send(response, 400, { error: { code: "INVALID_SITE", message: "Enter a valid site name." } });
      const id = `site_${randomBytes(16).toString("hex")}`;
      await sql()`INSERT INTO commercial_sites (id, commercial_account_id, name, line1, line2, city, region, postal_code, country_code, contact_name, contact_phone) VALUES (${id}, ${accountId}, ${name}, ${String(input.line1 || "").trim() || null}, ${String(input.line2 || "").trim() || null}, ${String(input.city || "").trim() || null}, ${String(input.region || "").trim() || null}, ${String(input.postalCode || "").trim() || null}, ${String(input.countryCode || "JM").trim().slice(0, 2).toUpperCase()}, ${String(input.contactName || "").trim() || null}, ${String(input.contactPhone || "").trim() || null})`;
      return send(response, 201, { details: await accountDetails(customerId, accountId) });
    }

    if (action === "create_project") {
      const accountId = String(input.accountId || "");
      const member = await membership(customerId, accountId);
      if (!member || !["owner", "admin", "buyer", "approver"].includes(member.role)) return send(response, 403, { error: { code: "COMMERCIAL_PERMISSION_DENIED", message: "You do not have permission to create projects." } });
      const name = String(input.name || "").trim();
      if (name.length < 2 || name.length > 180) return send(response, 400, { error: { code: "INVALID_PROJECT", message: "Enter a valid project name." } });
      const siteId = String(input.siteId || "").trim() || null;
      if (siteId) {
        const sites = await sql()`SELECT id FROM commercial_sites WHERE id = ${siteId} AND commercial_account_id = ${accountId} AND active = true LIMIT 1` as any[];
        if (!sites[0]) return send(response, 400, { error: { code: "INVALID_SITE", message: "Choose a valid site for this commercial account." } });
      }
      const id = `prj_${randomBytes(16).toString("hex")}`;
      await sql()`INSERT INTO commercial_projects (id, commercial_account_id, site_id, name, reference_code, description, status, start_date, target_end_date, created_by_customer_id) VALUES (${id}, ${accountId}, ${siteId}, ${name}, ${String(input.referenceCode || "").trim() || null}, ${String(input.description || "").trim() || null}, 'active', ${String(input.startDate || "").trim() || null}, ${String(input.targetEndDate || "").trim() || null}, ${customerId})`;
      return send(response, 201, { details: await accountDetails(customerId, accountId) });
    }

    return send(response, 400, { error: { code: "INVALID_ACTION", message: "That commercial action is not supported." } });
  } catch (error) {
    if (error instanceof SyntaxError) return send(response, 400, { error: { code: "INVALID_JSON", message: "The request body is invalid." } });
    const status = Number((error as any)?.status || 500);
    if (status === 413) return send(response, 413, { error: { code: "REQUEST_TOO_LARGE", message: "The request is too large." } });
    console.error("commercial_account_error", { code: error instanceof Error && error.message === "COMMERCIAL_DATABASE_NOT_CONFIGURED" ? "database_not_configured" : "commercial_request_failed" });
    return send(response, 503, { error: { code: "COMMERCIAL_SERVICE_UNAVAILABLE", message: "Commercial accounts are temporarily unavailable.", retryable: true } });
  }
}
