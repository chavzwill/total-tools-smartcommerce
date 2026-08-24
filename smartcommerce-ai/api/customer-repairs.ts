import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";
import { createHardenedServerFetch, validateServerIntegrationBaseUrl } from "../src/server/hardenedOutboundFetch.js";
import { firstHeader } from "../src/server/securityInfrastructure.js";

const COOKIE_NAME = "sc_session";
let sqlClient: ReturnType<typeof neon> | undefined;
let schemaReady = false;
type Row = Record<string, any>;
type Customer = { id: string; email: string; full_name: string; phone: string | null; email_verified: boolean };

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("CUSTOMER_REPAIRS_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}
function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
function parseCookie(header?: string) {
  const out: Record<string, string> = {};
  for (const part of (header || "").split(";")) {
    const index = part.indexOf("="); if (index <= 0) continue;
    const key = part.slice(0, index).trim(), raw = part.slice(index + 1).trim();
    try { out[key] = decodeURIComponent(raw); } catch { out[key] = raw; }
  }
  return out;
}
function send(res: any, status: number, payload: unknown) {
  res.statusCode = status; res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store"); res.setHeader("X-Content-Type-Options", "nosniff"); res.end(JSON.stringify(payload));
}
async function sessionCustomer(req: any): Promise<Customer | null> {
  const token = parseCookie(firstHeader(req.headers?.cookie))[COOKIE_NAME]; if (!token) return null;
  const rows = await sql()`SELECT c.id,c.email,c.full_name,c.phone,c.email_verified FROM customer_sessions s JOIN customer_accounts c ON c.id=s.customer_id WHERE s.token_hash=${hashToken(token)} AND s.revoked_at IS NULL AND s.expires_at>NOW() LIMIT 1` as Row[];
  return (rows[0] as Customer) || null;
}
async function ensureSchema() {
  if (schemaReady) return;
  await sql()`CREATE TABLE IF NOT EXISTS customer_pos_links(customer_account_id TEXT PRIMARY KEY,pos_customer_id TEXT NOT NULL,matched_by TEXT NOT NULL,matched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),last_sync_at TIMESTAMPTZ)`;
  await sql()`CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_pos_links_pos_customer ON customer_pos_links(pos_customer_id)`;
  await sql()`CREATE TABLE IF NOT EXISTS customer_repair_imports(id TEXT PRIMARY KEY,customer_account_id TEXT NOT NULL,pos_customer_id TEXT NOT NULL,work_order_id TEXT NOT NULL,wo_number TEXT,status TEXT NOT NULL,item_label TEXT,description TEXT,branch_name TEXT,employee_name TEXT,assessment_fee NUMERIC(14,2) NOT NULL DEFAULT 0,estimate_labor NUMERIC(14,2) NOT NULL DEFAULT 0,estimate_consumables NUMERIC(14,2) NOT NULL DEFAULT 0,deposit_amount NUMERIC(14,2) NOT NULL DEFAULT 0,parts_total NUMERIC(14,2) NOT NULL DEFAULT 0,pickup_due_date DATE,source_created_at TIMESTAMPTZ,source_completed_at TIMESTAMPTZ,payload_json JSONB NOT NULL,synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(customer_account_id,work_order_id))`;
  await sql()`CREATE INDEX IF NOT EXISTS idx_customer_repairs_account ON customer_repair_imports(customer_account_id,source_created_at DESC)`;
  schemaReady = true;
}
function configuredPos() { const raw = process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_URL?.trim(); if (!raw) throw new Error("POS_NOT_CONFIGURED"); return validateServerIntegrationBaseUrl(raw).toString().replace(/\/$/, ""); }
function normalizeEmail(value: unknown) { return String(value || "").trim().toLowerCase(); }
function normalizePhone(value: unknown) { return String(value || "").replace(/\D/g, ""); }
async function posGet(path: string) {
  const url = new URL(`${configuredPos()}/api/${path.replace(/^\/+/, "")}`); const headers: Record<string, string> = { Accept: "application/json" };
  const key = process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_API_KEY?.trim(); if (key) headers["X-API-Key"] = key;
  const response = await createHardenedServerFetch({ timeoutMs: 9000, maxResponseBytes: 3_000_000 })(url, { headers });
  if (!response.ok) throw new Error(`POS_IMPORT_${response.status}`); return response.json();
}
async function resolveLink(customer: Customer) {
  const existing = await sql()`SELECT * FROM customer_pos_links WHERE customer_account_id=${customer.id} LIMIT 1` as Row[]; if (existing[0]) return existing[0];
  const candidates = new Map<string, Row>();
  for (const query of [customer.email, customer.phone].filter(Boolean).map(String)) {
    const rows = await posGet(`customers?search=${encodeURIComponent(query)}&active=1`);
    for (const row of Array.isArray(rows) ? rows : []) {
      const emailMatch = Boolean(normalizeEmail(row.email)) && normalizeEmail(row.email) === normalizeEmail(customer.email);
      const phoneMatch = Boolean(normalizePhone(row.phone)) && normalizePhone(row.phone) === normalizePhone(customer.phone);
      if (emailMatch || phoneMatch) candidates.set(String(row.id), { ...row, matched_by: emailMatch && phoneMatch ? "email+phone" : emailMatch ? "email" : "phone" });
    }
  }
  if (candidates.size !== 1) return { ambiguous: candidates.size > 1, missing: candidates.size === 0 };
  const candidate = [...candidates.values()][0];
  const rows = await sql()`INSERT INTO customer_pos_links(customer_account_id,pos_customer_id,matched_by) VALUES(${customer.id},${String(candidate.id)},${String(candidate.matched_by)}) ON CONFLICT(customer_account_id) DO UPDATE SET pos_customer_id=EXCLUDED.pos_customer_id,matched_by=EXCLUDED.matched_by RETURNING *` as Row[];
  return rows[0];
}
function repairLabel(row: Row) { const equipment = row.equipment || {}; return [equipment.brand, equipment.model].filter(Boolean).join(" ") || equipment.type || row.item_label || row.equipment_description || "Service repair"; }
async function importRepairs(accountId: string, posCustomerId: string) {
  const portal = await posGet(`customer-repair-portal/customers/${encodeURIComponent(posCustomerId)}`); const repairs = Array.isArray(portal?.repairs) ? portal.repairs : [];
  for (const row of repairs) {
    const workOrderId = String(row.work_order_id), equipment = row.equipment || null, description = equipment?.reported_issue || row.description || row.problem_description || row.customer_complaint || null;
    await sql()`INSERT INTO customer_repair_imports(id,customer_account_id,pos_customer_id,work_order_id,wo_number,status,item_label,description,branch_name,employee_name,assessment_fee,estimate_labor,estimate_consumables,deposit_amount,parts_total,pickup_due_date,source_created_at,source_completed_at,payload_json,synced_at) VALUES(${`cri_${randomBytes(16).toString("hex")}`},${accountId},${posCustomerId},${workOrderId},${row.wo_number || null},${String(row.status || "unknown")},${repairLabel(row)},${description},${row.branch_name || null},${row.employee_name || null},${Number(row.assessment_fee || 0)},${Number(row.estimate_labor || 0)},${Number(row.estimate_consumables || 0)},${Number(row.deposit_amount || 0)},${Number(row.parts_total || 0)},${row.pickup_due_date || null},${row.created_at || null},${row.completed_at || null},${JSON.stringify(row)}::jsonb,NOW()) ON CONFLICT(customer_account_id,work_order_id) DO UPDATE SET wo_number=EXCLUDED.wo_number,status=EXCLUDED.status,item_label=EXCLUDED.item_label,description=EXCLUDED.description,branch_name=EXCLUDED.branch_name,employee_name=EXCLUDED.employee_name,assessment_fee=EXCLUDED.assessment_fee,estimate_labor=EXCLUDED.estimate_labor,estimate_consumables=EXCLUDED.estimate_consumables,deposit_amount=EXCLUDED.deposit_amount,parts_total=EXCLUDED.parts_total,pickup_due_date=EXCLUDED.pickup_due_date,source_created_at=EXCLUDED.source_created_at,source_completed_at=EXCLUDED.source_completed_at,payload_json=EXCLUDED.payload_json,synced_at=NOW()`;
  }
  await sql()`UPDATE customer_pos_links SET last_sync_at=NOW() WHERE customer_account_id=${accountId}`;
}
async function accountRepairs(accountId: string) {
  const rows = await sql()`SELECT id,work_order_id,wo_number,status,item_label,description,branch_name,employee_name,assessment_fee,estimate_labor,estimate_consumables,deposit_amount,parts_total,pickup_due_date,source_created_at,source_completed_at,payload_json,synced_at FROM customer_repair_imports WHERE customer_account_id=${accountId} ORDER BY COALESCE(source_created_at,synced_at) DESC` as Row[];
  return rows.map((row) => ({ ...row, ...(row.payload_json || {}), payload_json: undefined, synced_at: row.synced_at }));
}
export default async function handler(req: any, res: any) {
  try {
    await ensureSchema(); const customer = await sessionCustomer(req);
    if (!customer) return send(res, 401, { error: { code: "CUSTOMER_AUTH_REQUIRED", message: "Sign in to view your repairs." } });
    if (!customer.email_verified) return send(res, 403, { error: { code: "VERIFIED_ACCOUNT_REQUIRED", message: "Verify your email before viewing repair records." } });
    if (String(req.method || "GET").toUpperCase() !== "GET") { res.setHeader("Allow", "GET"); return send(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "GET is required." } }); }
    const link: any = await resolveLink(customer);
    if (link?.ambiguous) return send(res, 409, { linked: false, error: { code: "AMBIGUOUS_POS_CUSTOMER_MATCH", message: "We found more than one matching service customer. Total Tools needs to confirm the account link before repair history can be shown." } });
    if (link?.missing) return send(res, 200, { linked: false, repairs: [], message: "No matching Total Tools service customer was found yet." });
    let syncWarning: string | undefined; try { await importRepairs(customer.id, String(link.pos_customer_id)); } catch { syncWarning = "Live POS refresh was unavailable; showing the latest imported SmartCommerce copy."; }
    return send(res, 200, { linked: true, providerCustomerId: String(link.pos_customer_id), matchedBy: link.matched_by, repairs: await accountRepairs(customer.id), syncWarning });
  } catch (error) {
    const code = error instanceof Error ? error.message : "CUSTOMER_REPAIRS_ERROR"; console.error("customer_repairs_error", { code }); return send(res, 503, { error: { code, message: "Your repair information is temporarily unavailable.", retryable: true } });
  }
}
