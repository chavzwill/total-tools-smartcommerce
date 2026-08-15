import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";
import {
  enforceDurableRateLimit,
  recordSecurityEvent,
  requestIp,
} from "../src/server/securityInfrastructure";

const COOKIE_NAME = "sc_session";
const MAX_BODY_BYTES = 24_000;
const ADMIN_ROLES = new Set(["owner", "admin"]);
const APPROVAL_RULE_ROLES = new Set(["owner", "admin", "approver", "buyer"]);
const APPLICATION_CUSTOMER_DAILY_LIMIT = 3;
const APPLICATION_IP_DAILY_LIMIT = 10;
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

function normalizeName(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function normalizeIdentifier(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
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
    SELECT role, status, authority_status
    FROM commercial_account_members
    WHERE customer_id = ${customerId}
      AND commercial_account_id = ${accountId}
      AND status = 'active'
    LIMIT 1
  ` as Array<{ role: string; status: string; authority_status: string }>;
  return rows[0];
}

async function accountTrust(accountId: string) {
  const rows = await sql()`
    SELECT verification_status, privilege_status, account_type
    FROM commercial_accounts
    WHERE id = ${accountId}
    LIMIT 1
  ` as Array<{ verification_status: string; privilege_status: string; account_type: string }>;
  return rows[0];
}

async function providerVerified(accountId: string) {
  const rows = await sql()`
    SELECT 1
    FROM commercial_provider_mappings
    WHERE commercial_account_id = ${accountId}
      AND mapping_status = 'verified'
    LIMIT 1
  ` as Array<{ '?column?': number }>;
  return Boolean(rows[0]);
}

async function privilegedCommercialAccess(customerId: string, accountId: string) {
  const [member, trust, providerOk] = await Promise.all([
    membership(customerId, accountId),
    accountTrust(accountId),
    providerVerified(accountId),
  ]);
  return Boolean(
    member &&
    member.authority_status === 'verified' &&
    trust?.verification_status === 'verified' &&
    trust?.privilege_status === 'enabled' &&
    providerOk,
  );
}

async function audit(accountId: string | null, customerId: string | null, eventType: string, eventStatus: 'recorded' | 'blocked' | 'review_required', metadata: Record<string, unknown> = {}) {
  const id = `cae_${randomBytes(16).toString("hex")}`;
  await sql()`
    INSERT INTO commercial_audit_events (id, commercial_account_id, actor_customer_id, event_type, event_status, metadata)
    VALUES (${id}, ${accountId}, ${customerId}, ${eventType}, ${eventStatus}, ${JSON.stringify(metadata)}::jsonb)
  `;
}

async function listAccounts(customerId: string) {
  return await sql()`
    SELECT a.id, a.display_name, a.legal_name, a.account_type,
           CASE WHEN m.role IN ('owner','admin') THEN a.tax_identifier ELSE NULL END AS tax_identifier,
           a.status, a.verification_status, a.privilege_status,
           m.role, m.status AS membership_status, m.authority_status,
           a.created_at, a.updated_at,
           pm.provider_id,
           CASE WHEN m.role IN ('owner','admin') THEN pm.provider_customer_id ELSE NULL END AS provider_customer_id,
           CASE WHEN m.role IN ('owner','admin') THEN pm.provider_account_id ELSE NULL END AS provider_account_id,
           CASE WHEN m.role IN ('owner','admin','approver','buyer') THEN pm.provider_price_list_id ELSE NULL END AS provider_price_list_id,
           CASE WHEN m.role IN ('owner','admin','approver','buyer') THEN pm.payment_terms_code ELSE NULL END AS payment_terms_code,
           pm.mapping_status
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

  const isAdmin = ADMIN_ROLES.has(member.role);
  const canViewApprovalRules = APPROVAL_RULE_ROLES.has(member.role);

  const [accounts, sites, projects, rules, members, applications] = await Promise.all([
    isAdmin
      ? sql()`SELECT id, display_name, legal_name, account_type, tax_identifier, status, verification_status, privilege_status, verified_at, verification_reference, created_at, updated_at FROM commercial_accounts WHERE id = ${accountId} LIMIT 1`
      : sql()`SELECT id, display_name, legal_name, account_type, status, verification_status, privilege_status, verified_at, created_at, updated_at FROM commercial_accounts WHERE id = ${accountId} LIMIT 1`,
    sql()`SELECT id, name, line1, line2, city, region, postal_code, country_code, contact_name, contact_phone, active FROM commercial_sites WHERE commercial_account_id = ${accountId} AND active = true ORDER BY name`,
    sql()`SELECT id, site_id, name, reference_code, description, status, start_date, target_end_date, created_at, updated_at FROM commercial_projects WHERE commercial_account_id = ${accountId} ORDER BY updated_at DESC`,
    canViewApprovalRules
      ? sql()`SELECT id, rule_type, currency, threshold_minor, threshold_days, approver_role, active FROM commercial_approval_rules WHERE commercial_account_id = ${accountId} AND active = true ORDER BY created_at`
      : Promise.resolve([]),
    isAdmin
      ? sql()`SELECT m.id, m.customer_id, m.role, m.status, m.authority_status, c.full_name, c.email FROM commercial_account_members m JOIN customer_accounts c ON c.id = m.customer_id WHERE m.commercial_account_id = ${accountId} AND m.status <> 'removed' ORDER BY m.created_at`
      : sql()`SELECT m.id, m.customer_id, m.role, m.status, m.authority_status, c.full_name FROM commercial_account_members m JOIN customer_accounts c ON c.id = m.customer_id WHERE m.commercial_account_id = ${accountId} AND m.status = 'active' ORDER BY m.created_at`,
    isAdmin
      ? sql()`SELECT id, claimed_account_type, legal_name, registration_identifier, tax_identifier, work_email, official_domain, application_status, risk_flags, submitted_at, reviewed_at, review_reference FROM commercial_verification_applications WHERE commercial_account_id = ${accountId} ORDER BY created_at DESC`
      : Promise.resolve([]),
  ]);
  const providerOk = await providerVerified(accountId);
  return {
    account: (accounts as any[])[0],
    role: member.role,
    authorityStatus: member.authority_status,
    providerVerified: providerOk,
    privilegedAccess: await privilegedCommercialAccess(customerId, accountId),
    sites,
    projects,
    approvalRules: rules,
    members,
    verificationApplications: applications,
    visibility: {
      sensitiveOrganisationIdentifiers: isAdmin,
      memberEmails: isAdmin,
      verificationApplications: isAdmin,
      approvalRules: canViewApprovalRules,
    },
  };
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
  let customerIdForAudit: string | undefined;

  try {
    const customerId = await currentCustomerId(request);
    customerIdForAudit = customerId;
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
      await enforceDurableRateLimit({ request, action: "commercial_application_customer", subject: customerId, limit: APPLICATION_CUSTOMER_DAILY_LIMIT, windowSeconds: 86_400 });
      await enforceDurableRateLimit({ request, action: "commercial_application_ip", subject: requestIp(request), limit: APPLICATION_IP_DAILY_LIMIT, windowSeconds: 86_400 });

      const displayName = String(input.displayName || "").trim();
      const legalName = String(input.legalName || displayName).trim();
      const taxIdentifier = String(input.taxIdentifier || "").trim();
      const registrationIdentifier = String(input.registrationIdentifier || "").trim();
      const workEmail = String(input.workEmail || "").trim().toLowerCase();
      const accountType = ["business", "contractor", "government", "organisation"].includes(input.accountType) ? input.accountType : "business";
      if (displayName.length < 2 || displayName.length > 160 || legalName.length < 2 || legalName.length > 200 || taxIdentifier.length > 80 || registrationIdentifier.length > 80 || workEmail.length > 200) {
        return send(response, 400, { error: { code: "INVALID_COMMERCIAL_ACCOUNT", message: "Enter valid commercial account application details." } });
      }

      const normalized = normalizeName(legalName);
      const normalizedTax = taxIdentifier ? normalizeIdentifier(taxIdentifier) : null;
      const [exactMatches, recentApplicantRows] = await Promise.all([
        sql()`
          SELECT id, display_name, verification_status
          FROM commercial_accounts
          WHERE normalized_name = ${normalized}
             OR (${normalizedTax} IS NOT NULL AND normalized_tax_identifier = ${normalizedTax})
          ORDER BY verification_status = 'verified' DESC, created_at ASC
          LIMIT 5
        ` as unknown as Promise<Array<{ id: string; display_name: string; verification_status: string }>>,
        sql()`
          SELECT COUNT(*)::int AS application_count
          FROM commercial_verification_applications
          WHERE applicant_customer_id = ${customerId}
            AND created_at > NOW() - INTERVAL '30 days'
        ` as unknown as Promise<Array<{ application_count: number }>>,
      ]);
      if (exactMatches.some((row) => row.verification_status === 'verified')) {
        await audit(null, customerId, 'commercial_duplicate_verified_organisation_claim', 'blocked', { normalizedName: normalized, accountType });
        return send(response, 409, { error: { code: "COMMERCIAL_ORGANISATION_EXISTS", message: "A verified organisation with matching details already exists. Request access to the existing organisation instead." } });
      }

      const priorApplicationCount = Number(recentApplicantRows[0]?.application_count || 0);
      const accountId = `com_${randomBytes(16).toString("hex")}`;
      const memberId = `cmm_${randomBytes(16).toString("hex")}`;
      const applicationId = `cva_${randomBytes(16).toString("hex")}`;
      const governmentClaim = accountType === 'government';
      const repeatedApplicant = priorApplicationCount >= 2;
      const riskFlags = [
        ...(governmentClaim ? ['government_manual_review_required'] : []),
        ...(exactMatches.length ? ['possible_duplicate_organisation'] : []),
        ...(repeatedApplicant ? ['repeated_commercial_applications'] : []),
      ];
      const requiresReview = governmentClaim || exactMatches.length > 0 || repeatedApplicant;
      const applicationStatus = requiresReview ? 'under_review' : 'submitted';

      await sql()`
        WITH created_account AS (
          INSERT INTO commercial_accounts (
            id, display_name, legal_name, account_type, tax_identifier, status, created_by_customer_id,
            normalized_name, normalized_tax_identifier, verification_status, privilege_status
          ) VALUES (
            ${accountId}, ${displayName}, ${legalName}, ${accountType}, ${taxIdentifier || null}, 'pending', ${customerId},
            ${normalized}, ${normalizedTax}, ${requiresReview ? 'pending_review' : 'unverified'}, 'locked'
          )
          RETURNING id
        ), created_member AS (
          INSERT INTO commercial_account_members (id, commercial_account_id, customer_id, role, status, authority_status, invited_by_customer_id)
          SELECT ${memberId}, id, ${customerId}, 'owner', 'active', 'pending', ${customerId}
          FROM created_account
          RETURNING commercial_account_id
        )
        INSERT INTO commercial_verification_applications (
          id, commercial_account_id, applicant_customer_id, claimed_account_type, legal_name,
          registration_identifier, tax_identifier, work_email, application_status, risk_flags, submitted_at
        )
        SELECT ${applicationId}, commercial_account_id, ${customerId}, ${accountType}, ${legalName},
               ${registrationIdentifier || null}, ${taxIdentifier || null}, ${workEmail || null}, ${applicationStatus}, ${JSON.stringify(riskFlags)}::jsonb, NOW()
        FROM created_member
      `;
      await audit(accountId, customerId, governmentClaim ? 'government_account_application_created' : 'commercial_account_application_created', requiresReview ? 'review_required' : 'recorded', { applicationId, riskFlags, priorApplicationCount });
      await recordSecurityEvent({ request, eventType: "commercial_application_submitted", eventStatus: requiresReview ? "manual_review" : "submitted", riskLevel: requiresReview ? "medium" : "info", customerId, commercialAccountId: accountId, metadata: { applicationId, accountType, riskFlagCount: riskFlags.length, priorApplicationCount } });
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
      await audit(accountId, customerId, 'commercial_site_created', 'recorded', { siteId: id });
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
      await audit(accountId, customerId, 'commercial_project_created', 'recorded', { projectId: id });
      return send(response, 201, { details: await accountDetails(customerId, accountId) });
    }

    if (action === "check_privileged_access") {
      const accountId = String(input.accountId || "");
      const allowed = await privilegedCommercialAccess(customerId, accountId);
      if (!allowed) {
        await audit(accountId || null, customerId, 'commercial_privileged_access_check', 'blocked');
        return send(response, 403, { error: { code: "COMMERCIAL_VERIFICATION_REQUIRED", message: "Commercial pricing, account terms, purchase-order privileges and charge-to-account access remain locked until the organisation, your authority, and the provider mapping are verified." } });
      }
      await audit(accountId, customerId, 'commercial_privileged_access_check', 'recorded');
      return send(response, 200, { allowed: true });
    }

    return send(response, 400, { error: { code: "INVALID_ACTION", message: "That commercial action is not supported." } });
  } catch (error) {
    if (error instanceof SyntaxError) return send(response, 400, { error: { code: "INVALID_JSON", message: "The request body is invalid." } });
    const status = Number((error as any)?.status || 500);
    const code = error instanceof Error ? error.message : "COMMERCIAL_REQUEST_FAILED";
    if (code === "RATE_LIMITED") {
      const retryAfter = Math.max(1, Number((error as any)?.retryAfterSeconds || 60));
      response.setHeader("Retry-After", String(retryAfter));
      try {
        await audit(null, customerIdForAudit || null, 'commercial_application_velocity_blocked', 'blocked', { retryAfterSeconds: retryAfter });
        await recordSecurityEvent({ request, eventType: "commercial_application_velocity_blocked", eventStatus: "rate_limited", riskLevel: "high", customerId: customerIdForAudit || null, metadata: { retryAfterSeconds: retryAfter } });
      } catch {}
      return send(response, 429, { error: { code: "RATE_LIMITED", message: "Too many commercial account applications. Please wait before trying again.", retryAfterSeconds: retryAfter } });
    }
    if (status === 413) return send(response, 413, { error: { code: "REQUEST_TOO_LARGE", message: "The request is too large." } });
    console.error("commercial_account_error", { code: error instanceof Error && error.message === "COMMERCIAL_DATABASE_NOT_CONFIGURED" ? "database_not_configured" : "commercial_request_failed" });
    return send(response, 503, { error: { code: "COMMERCIAL_SERVICE_UNAVAILABLE", message: "Commercial accounts are temporarily unavailable.", retryable: true } });
  }
}
