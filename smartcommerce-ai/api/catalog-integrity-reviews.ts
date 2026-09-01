import { neon } from "@neondatabase/serverless";
import { parseCookie, readStaffSession, canStaff, STAFF_COOKIE_NAME } from "../src/server/staffSession.js";

const CLASSIFICATIONS = new Set([
  "confirmed_duplicate",
  "obsolete_item",
  "false_positive",
  "provider_correction_required",
  "cleanup_candidate",
  "needs_investigation",
]);
let sqlClient: ReturnType<typeof neon> | undefined;
let schemaReady = false;

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("CATALOG_REVIEW_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}
function firstHeader(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function send(response: any, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(payload));
}
function stringValue(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function bodyObject(request: any) {
  if (request.body && typeof request.body === "object") return request.body as Record<string, unknown>;
  if (typeof request.body === "string") {
    try { const parsed = JSON.parse(request.body); return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {}; }
    catch { return {}; }
  }
  return {};
}
function reviewState(classification: string) {
  if (classification === "false_positive") return "dismissed";
  if (classification === "provider_correction_required") return "awaiting_provider";
  if (classification === "cleanup_candidate") return "approved_for_cleanup";
  if (classification === "confirmed_duplicate" || classification === "obsolete_item") return "confirmed";
  return "open";
}
async function ensureSchema() {
  if (schemaReady) return;
  await sql()`CREATE TABLE IF NOT EXISTS catalog_integrity_findings (
    issue_key TEXT PRIMARY KEY,
    issue_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    product_ids JSONB NOT NULL,
    evidence JSONB,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql()`CREATE TABLE IF NOT EXISTS catalog_integrity_reviews (
    issue_key TEXT PRIMARY KEY,
    issue_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    product_ids JSONB NOT NULL,
    classification TEXT NOT NULL,
    review_state TEXT NOT NULL,
    note TEXT,
    evidence_reference TEXT,
    reviewer_employee_id TEXT NOT NULL,
    reviewer_username TEXT NOT NULL,
    first_reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql()`CREATE TABLE IF NOT EXISTS catalog_integrity_review_events (
    id BIGSERIAL PRIMARY KEY,
    issue_key TEXT NOT NULL,
    issue_type TEXT NOT NULL,
    classification TEXT NOT NULL,
    review_state TEXT NOT NULL,
    note TEXT,
    evidence_reference TEXT,
    reviewer_employee_id TEXT NOT NULL,
    reviewer_username TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql()`CREATE INDEX IF NOT EXISTS idx_catalog_integrity_findings_seen ON catalog_integrity_findings(last_seen_at DESC)`;
  await sql()`CREATE INDEX IF NOT EXISTS idx_catalog_integrity_reviews_state ON catalog_integrity_reviews(review_state, updated_at DESC)`;
  await sql()`CREATE INDEX IF NOT EXISTS idx_catalog_integrity_review_events_issue ON catalog_integrity_review_events(issue_key, created_at DESC)`;
  schemaReady = true;
}

export default async function handler(request: any, response: any) {
  const method = String(request.method || "GET").toUpperCase();
  if (!["GET", "POST"].includes(method)) {
    response.setHeader("Allow", "GET, POST");
    return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "GET or POST is required." } });
  }

  const cookies = parseCookie(firstHeader(request.headers?.cookie));
  const session = readStaffSession(cookies[STAFF_COOKIE_NAME]);
  if (!session) return send(response, 401, { error: { code: "STAFF_AUTH_REQUIRED", message: "Staff sign-in is required." } });
  if (!canStaff(session, "inventory")) return send(response, 403, { error: { code: "INVENTORY_PERMISSION_REQUIRED", message: "Inventory permission is required." } });

  try {
    await ensureSchema();
    if (method === "GET") {
      const rows = await sql()`SELECT issue_key, issue_type, severity, product_ids, classification, review_state,
        note, evidence_reference, reviewer_employee_id, reviewer_username, first_reviewed_at, updated_at
        FROM catalog_integrity_reviews ORDER BY updated_at DESC LIMIT 500`;
      return send(response, 200, { reviews: rows });
    }

    const body = bodyObject(request);
    const issueKey = stringValue(body.issueKey, 80).toLowerCase();
    const classification = stringValue(body.classification, 80);
    const note = stringValue(body.note, 1000) || null;
    const evidenceReference = stringValue(body.evidenceReference, 300) || null;
    if (!/^[a-f0-9]{64}$/.test(issueKey)) return send(response, 400, { error: { code: "INVALID_ISSUE_KEY", message: "A valid catalog finding key is required." } });
    if (!CLASSIFICATIONS.has(classification)) return send(response, 400, { error: { code: "INVALID_CLASSIFICATION", message: "Choose a supported remediation classification." } });
    if (classification !== "false_positive" && !note) return send(response, 400, { error: { code: "REVIEW_NOTE_REQUIRED", message: "Add a review note explaining this decision." } });

    const observed = await sql()`SELECT issue_key, issue_type, severity, product_ids
      FROM catalog_integrity_findings WHERE issue_key=${issueKey} LIMIT 1` as unknown as Array<{
        issue_key: string; issue_type: string; severity: string; product_ids: string[];
      }>;
    const finding = observed[0];
    if (!finding) return send(response, 409, { error: { code: "FINDING_NOT_REGISTERED", message: "Run a fresh catalog integrity scan before reviewing this finding." } });

    const state = reviewState(classification);
    const productIdsJson = JSON.stringify(finding.product_ids || []);
    const result = await sql()`WITH current_review AS (
      INSERT INTO catalog_integrity_reviews (
        issue_key, issue_type, severity, product_ids, classification, review_state, note, evidence_reference,
        reviewer_employee_id, reviewer_username
      ) VALUES (
        ${finding.issue_key}, ${finding.issue_type}, ${finding.severity}, ${productIdsJson}::jsonb, ${classification}, ${state}, ${note}, ${evidenceReference},
        ${session.employeeId}, ${session.username}
      )
      ON CONFLICT (issue_key) DO UPDATE SET
        issue_type=EXCLUDED.issue_type,
        severity=EXCLUDED.severity,
        product_ids=EXCLUDED.product_ids,
        classification=EXCLUDED.classification,
        review_state=EXCLUDED.review_state,
        note=EXCLUDED.note,
        evidence_reference=EXCLUDED.evidence_reference,
        reviewer_employee_id=EXCLUDED.reviewer_employee_id,
        reviewer_username=EXCLUDED.reviewer_username,
        updated_at=NOW()
      RETURNING *
    ), event_write AS (
      INSERT INTO catalog_integrity_review_events (
        issue_key, issue_type, classification, review_state, note, evidence_reference,
        reviewer_employee_id, reviewer_username
      ) SELECT issue_key, issue_type, classification, review_state, note, evidence_reference,
        reviewer_employee_id, reviewer_username FROM current_review
      RETURNING id
    )
    SELECT current_review.*, (SELECT id FROM event_write LIMIT 1) AS event_id FROM current_review`;
    return send(response, 200, { review: result[0] });
  } catch (error) {
    console.error("catalog_integrity_review_error", { code: error instanceof Error ? error.message : "unknown" });
    return send(response, 503, { error: { code: "CATALOG_REVIEW_UNAVAILABLE", message: "Catalog remediation review is temporarily unavailable." } });
  }
}
