import { neon } from "@neondatabase/serverless";
import { randomBytes } from "node:crypto";
import { canStaff, parseCookie, readStaffSession, STAFF_COOKIE_NAME } from "../src/server/staffSession.js";
import { firstHeader, recordSecurityEvent } from "../src/server/securityInfrastructure.js";

const MAX_BODY_BYTES = 24_000;
let sqlClient: ReturnType<typeof neon> | undefined;

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("COMMERCIAL_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}
function sameOrigin(request: any) {
  const origin = firstHeader(request.headers?.origin);
  if (!origin) return true;
  const host = firstHeader(request.headers?.host);
  if (!host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}
function staffFromRequest(request: any) {
  const token = parseCookie(firstHeader(request.headers?.cookie))[STAFF_COOKIE_NAME];
  return readStaffSession(token);
}
function canReview(staff: ReturnType<typeof staffFromRequest>) {
  return canStaff(staff, "purchasing_approve") || canStaff(staff, "security_manage");
}
async function readJsonBody<T>(request: AsyncIterable<unknown>): Promise<T> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    if (chunk == null) continue;
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    total += buffer.length;
    if (total > MAX_BODY_BYTES) throw Object.assign(new Error("REQUEST_TOO_LARGE"), { status: 413 });
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as T;
}
function send(response: any, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");
  response.end(JSON.stringify(payload));
}
async function queue() {
  return await sql()`
    SELECT va.id AS application_id, va.commercial_account_id, va.applicant_customer_id,
           va.claimed_account_type, va.legal_name, va.registration_identifier, va.tax_identifier,
           va.work_email, va.official_domain, va.application_status, va.risk_flags,
           va.submitted_at, va.reviewed_at, va.review_reference,
           a.display_name, a.status AS account_status, a.verification_status, a.privilege_status,
           c.full_name AS applicant_name, c.email AS applicant_email,
           m.authority_status,
           pm.provider_id, pm.provider_account_id, pm.provider_customer_id,
           pm.provider_price_list_id, pm.payment_terms_code, pm.mapping_status,
           fc.control_status AS financial_control_status, fc.credit_enabled, fc.credit_limit_minor,
           fc.credit_currency, fc.purchase_order_enabled
    FROM commercial_verification_applications va
    JOIN commercial_accounts a ON a.id = va.commercial_account_id
    JOIN customer_accounts c ON c.id = va.applicant_customer_id
    LEFT JOIN commercial_account_members m
      ON m.commercial_account_id = va.commercial_account_id
     AND m.customer_id = va.applicant_customer_id
     AND m.status = 'active'
    LEFT JOIN commercial_provider_mappings pm ON pm.commercial_account_id = va.commercial_account_id
    LEFT JOIN LATERAL (
      SELECT control_status, credit_enabled, credit_limit_minor, credit_currency, purchase_order_enabled
      FROM commercial_financial_controls
      WHERE commercial_account_id = va.commercial_account_id
      ORDER BY updated_at DESC
      LIMIT 1
    ) fc ON TRUE
    ORDER BY
      CASE WHEN va.application_status IN ('submitted','under_review') THEN 0 ELSE 1 END,
      va.submitted_at DESC
    LIMIT 250
  ` as Array<Record<string, unknown>>;
}
async function reviewApplication(input: any, staffId: string) {
  const applicationId = String(input.applicationId || "").trim();
  const action = String(input.reviewAction || "").trim();
  const reference = String(input.reviewReference || "").trim();
  if (!applicationId || !["approve", "reject"].includes(action)) throw new Error("INVALID_APPLICATION_REVIEW");
  if (reference.length < 4 || reference.length > 160) throw new Error("REVIEW_REFERENCE_REQUIRED");
  const rows = await sql()`
    SELECT id, commercial_account_id, applicant_customer_id, application_status
    FROM commercial_verification_applications
    WHERE id = ${applicationId}
    LIMIT 1
  ` as Array<{ id: string; commercial_account_id: string; applicant_customer_id: string; application_status: string }>;
  const row = rows[0];
  if (!row) throw new Error("APPLICATION_NOT_FOUND");
  if (!["submitted", "under_review"].includes(row.application_status)) throw new Error("APPLICATION_ALREADY_REVIEWED");

  if (action === "approve") {
    await sql()`
      WITH reviewed AS (
        UPDATE commercial_verification_applications
        SET application_status = 'approved', reviewed_at = NOW(), review_reference = ${reference}
        WHERE id = ${applicationId} AND application_status IN ('submitted','under_review')
        RETURNING commercial_account_id, applicant_customer_id
      ), account_update AS (
        UPDATE commercial_accounts a
        SET status = 'active', verification_status = 'verified', verified_at = NOW(),
            verification_reference = ${reference}, updated_at = NOW()
        FROM reviewed r
        WHERE a.id = r.commercial_account_id
        RETURNING a.id
      )
      UPDATE commercial_account_members m
      SET authority_status = 'verified', updated_at = NOW()
      FROM reviewed r
      WHERE m.commercial_account_id = r.commercial_account_id
        AND m.customer_id = r.applicant_customer_id
        AND m.status = 'active'
    `;
    await sql()`
      INSERT INTO commercial_audit_events(id, commercial_account_id, actor_customer_id, event_type, event_status, metadata)
      VALUES(${`cae_${randomBytes(16).toString("hex")}`}, ${row.commercial_account_id}, NULL,
             'commercial_application_approved', 'recorded',
             ${JSON.stringify({ applicationId, staffId, reviewReference: reference })}::jsonb)
    `;
  } else {
    await sql()`
      WITH reviewed AS (
        UPDATE commercial_verification_applications
        SET application_status = 'rejected', reviewed_at = NOW(), review_reference = ${reference}
        WHERE id = ${applicationId} AND application_status IN ('submitted','under_review')
        RETURNING commercial_account_id
      )
      UPDATE commercial_accounts a
      SET status = 'rejected', verification_status = 'rejected', privilege_status = 'locked', updated_at = NOW()
      FROM reviewed r
      WHERE a.id = r.commercial_account_id
    `;
    await sql()`
      INSERT INTO commercial_audit_events(id, commercial_account_id, actor_customer_id, event_type, event_status, metadata)
      VALUES(${`cae_${randomBytes(16).toString("hex")}`}, ${row.commercial_account_id}, NULL,
             'commercial_application_rejected', 'recorded',
             ${JSON.stringify({ applicationId, staffId, reviewReference: reference })}::jsonb)
    `;
  }
  return row.commercial_account_id;
}
async function verifyProvider(input: any, staffId: string) {
  const accountId = String(input.accountId || "").trim();
  const providerId = String(input.providerId || "").trim();
  const providerAccountId = String(input.providerAccountId || "").trim();
  const providerCustomerId = String(input.providerCustomerId || "").trim();
  const providerPriceListId = String(input.providerPriceListId || "").trim();
  const paymentTermsCode = String(input.paymentTermsCode || "").trim();
  const reference = String(input.verificationReference || "").trim();
  if (!accountId || !providerId || !providerAccountId || reference.length < 4) throw new Error("PROVIDER_VERIFICATION_REQUIRED");
  const trust = await sql()`SELECT verification_status FROM commercial_accounts WHERE id=${accountId} LIMIT 1` as Array<{ verification_status: string }>;
  if (!trust[0]) throw new Error("ACCOUNT_NOT_FOUND");
  if (trust[0].verification_status !== "verified") throw new Error("ORGANISATION_NOT_VERIFIED");

  await sql()`
    WITH updated AS (
      UPDATE commercial_provider_mappings
      SET provider_id=${providerId}, provider_customer_id=${providerCustomerId || null},
          provider_account_id=${providerAccountId}, provider_price_list_id=${providerPriceListId || null},
          payment_terms_code=${paymentTermsCode || null}, mapping_status='verified', verified_at=NOW(), updated_at=NOW()
      WHERE commercial_account_id=${accountId}
      RETURNING commercial_account_id
    )
    INSERT INTO commercial_provider_mappings(
      id, commercial_account_id, provider_id, provider_customer_id, provider_account_id,
      provider_price_list_id, payment_terms_code, mapping_status, verified_at, created_at, updated_at
    )
    SELECT ${`cpm_${randomBytes(16).toString("hex")}`}, ${accountId}, ${providerId}, ${providerCustomerId || null},
           ${providerAccountId}, ${providerPriceListId || null}, ${paymentTermsCode || null}, 'verified', NOW(), NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM updated)
  `;
  await sql()`UPDATE commercial_accounts SET privilege_status='enabled', updated_at=NOW() WHERE id=${accountId} AND verification_status='verified'`;
  await sql()`
    INSERT INTO commercial_audit_events(id, commercial_account_id, actor_customer_id, event_type, event_status, metadata)
    VALUES(${`cae_${randomBytes(16).toString("hex")}`}, ${accountId}, NULL,
           'commercial_provider_mapping_verified', 'recorded',
           ${JSON.stringify({ staffId, providerId, providerAccountId, verificationReference: reference })}::jsonb)
  `;
}
async function setFinancialControls(input: any, staffId: string) {
  const accountId = String(input.accountId || "").trim();
  const providerId = String(input.providerId || "").trim() || null;
  const reviewReference = String(input.reviewReference || "").trim();
  const creditEnabled = Boolean(input.creditEnabled);
  const purchaseOrderEnabled = Boolean(input.purchaseOrderEnabled);
  const creditLimitMinor = creditEnabled ? Number(input.creditLimitMinor) : 0;
  const creditCurrency = String(input.creditCurrency || "JMD").trim().toUpperCase();
  const paymentTermsCode = String(input.paymentTermsCode || "").trim() || null;
  if (!accountId || reviewReference.length < 4) throw new Error("FINANCIAL_REVIEW_REFERENCE_REQUIRED");
  if (creditEnabled && (!Number.isSafeInteger(creditLimitMinor) || creditLimitMinor <= 0 || !/^[A-Z]{3}$/.test(creditCurrency))) throw new Error("INVALID_CREDIT_CONTROL");
  const trust = await sql()`
    SELECT a.verification_status, a.privilege_status, pm.mapping_status
    FROM commercial_accounts a
    LEFT JOIN commercial_provider_mappings pm ON pm.commercial_account_id=a.id
    WHERE a.id=${accountId}
    LIMIT 1
  ` as Array<{ verification_status: string; privilege_status: string; mapping_status: string | null }>;
  if (!trust[0]) throw new Error("ACCOUNT_NOT_FOUND");
  if (trust[0].verification_status !== "verified" || trust[0].privilege_status !== "enabled" || trust[0].mapping_status !== "verified") throw new Error("COMMERCIAL_ACTIVATION_INCOMPLETE");
  const id = `cfc_${randomBytes(16).toString("hex")}`;
  await sql()`
    WITH updated AS (
      UPDATE commercial_financial_controls
      SET provider_id=${providerId}, control_status='approved', credit_enabled=${creditEnabled},
          credit_limit_minor=${creditLimitMinor}, credit_currency=${creditCurrency},
          payment_terms_code=${paymentTermsCode}, purchase_order_enabled=${purchaseOrderEnabled},
          review_reference=${reviewReference}, reviewed_at=NOW(), updated_at=NOW()
      WHERE commercial_account_id=${accountId}
        AND (${providerId}::text IS NULL OR provider_id=${providerId} OR provider_id IS NULL)
      RETURNING id
    )
    INSERT INTO commercial_financial_controls(
      id, commercial_account_id, provider_id, control_status, credit_enabled, credit_limit_minor,
      credit_currency, payment_terms_code, purchase_order_enabled, review_reference, reviewed_at, created_at, updated_at
    )
    SELECT ${id}, ${accountId}, ${providerId}, 'approved', ${creditEnabled}, ${creditLimitMinor}, ${creditCurrency},
           ${paymentTermsCode}, ${purchaseOrderEnabled}, ${reviewReference}, NOW(), NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM updated)
  `;
  await sql()`
    INSERT INTO commercial_financial_decision_events(id, commercial_account_id, control_id, decision_type, decision_reference, metadata, created_at)
    VALUES(${`cfd_${randomBytes(16).toString("hex")}`}, ${accountId}, ${id}, 'manual_control_approval', ${reviewReference},
           ${JSON.stringify({ staffId, creditEnabled, creditLimitMinor, creditCurrency, purchaseOrderEnabled, paymentTermsCode })}::jsonb, NOW())
  `;
}

export default async function handler(request: any, response: any) {
  const method = String(request.method || "GET").toUpperCase();
  if (!sameOrigin(request)) return send(response, 403, { error: { code: "ORIGIN_REJECTED", message: "This request was rejected." } });
  try {
    const staff = staffFromRequest(request);
    if (!staff) return send(response, 401, { error: { code: "STAFF_AUTH_REQUIRED", message: "Staff sign-in is required." } });
    if (!canReview(staff)) {
      await recordSecurityEvent({ request, eventType: "commercial_account_review_access_denied", eventStatus: "blocked", riskLevel: "high", subject: staff.employeeId }).catch(() => undefined);
      return send(response, 403, { error: { code: "COMMERCIAL_REVIEW_FORBIDDEN", message: "Your staff role is not authorised to review commercial accounts." } });
    }
    if (method === "GET") return send(response, 200, { applications: await queue(), staff: { employeeId: staff.employeeId, username: staff.username, role: staff.role } });
    if (method !== "POST") { response.setHeader("Allow", "GET, POST"); return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "GET or POST is required." } }); }
    const input = await readJsonBody<any>(request);
    const action = String(input.action || "");
    if (action === "review_application") {
      const accountId = await reviewApplication(input, staff.employeeId);
      await recordSecurityEvent({ request, eventType: "commercial_application_reviewed", eventStatus: String(input.reviewAction || "reviewed"), riskLevel: "high", subject: staff.employeeId, commercialAccountId: accountId }).catch(() => undefined);
    } else if (action === "verify_provider") {
      await verifyProvider(input, staff.employeeId);
      await recordSecurityEvent({ request, eventType: "commercial_provider_mapping_verified", eventStatus: "verified", riskLevel: "high", subject: staff.employeeId, commercialAccountId: String(input.accountId || "") }).catch(() => undefined);
    } else if (action === "set_financial_controls") {
      await setFinancialControls(input, staff.employeeId);
      await recordSecurityEvent({ request, eventType: "commercial_financial_controls_approved", eventStatus: "approved", riskLevel: "high", subject: staff.employeeId, commercialAccountId: String(input.accountId || "") }).catch(() => undefined);
    } else return send(response, 400, { error: { code: "INVALID_ACTION", message: "That commercial-review action is not supported." } });
    return send(response, 200, { applications: await queue() });
  } catch (error: any) {
    const code = String(error?.message || "");
    const known: Record<string, [number, string]> = {
      INVALID_APPLICATION_REVIEW: [400, "Choose a valid application review action."],
      REVIEW_REFERENCE_REQUIRED: [400, "Enter a review reference before completing verification."],
      APPLICATION_NOT_FOUND: [404, "That commercial application was not found."],
      APPLICATION_ALREADY_REVIEWED: [409, "That commercial application has already been reviewed."],
      PROVIDER_VERIFICATION_REQUIRED: [400, "Provider ID, provider account ID and verification reference are required."],
      ACCOUNT_NOT_FOUND: [404, "That commercial account was not found."],
      ORGANISATION_NOT_VERIFIED: [409, "Verify the organisation before recording a provider mapping."],
      FINANCIAL_REVIEW_REFERENCE_REQUIRED: [400, "A financial review reference is required."],
      INVALID_CREDIT_CONTROL: [400, "Enter a valid credit limit and currency."],
      COMMERCIAL_ACTIVATION_INCOMPLETE: [409, "Organisation verification and provider mapping must be complete before financial controls are approved."],
      REQUEST_TOO_LARGE: [413, "The request is too large."],
    };
    if (error instanceof SyntaxError) return send(response, 400, { error: { code: "INVALID_JSON", message: "The request body is invalid." } });
    if (known[code]) return send(response, known[code][0], { error: { code, message: known[code][1] } });
    console.error("commercial_account_reviews_error", { code: code || "unknown" });
    return send(response, 503, { error: { code: "COMMERCIAL_REVIEWS_UNAVAILABLE", message: "Commercial account reviews are temporarily unavailable.", retryable: true } });
  }
}
