import { neon } from "@neondatabase/serverless";
import { createHardenedServerFetch, validateServerIntegrationBaseUrl } from "../src/server/hardenedOutboundFetch.js";
import { parseCookie, readStaffSession, canStaff, STAFF_COOKIE_NAME } from "../src/server/staffSession.js";

let sqlClient: ReturnType<typeof neon> | undefined;
let schemaReady = false;
function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("CATALOG_CLEANUP_DATABASE_NOT_CONFIGURED");
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
function bodyObject(request: any) {
  if (request.body && typeof request.body === "object") return request.body as Record<string, unknown>;
  if (typeof request.body === "string") { try { const parsed=JSON.parse(request.body); return parsed&&typeof parsed==="object"?parsed:{}; } catch { return {}; } }
  return {};
}
function text(value: unknown, max=500) { return typeof value === "string" ? value.trim().slice(0,max) : ""; }
async function ensureSchema() {
  if (schemaReady) return;
  await sql()`CREATE TABLE IF NOT EXISTS catalog_cleanup_plans (
    id UUID PRIMARY KEY,
    issue_key TEXT NOT NULL UNIQUE,
    action_type TEXT NOT NULL,
    source_product_ids JSONB NOT NULL,
    target_product_id TEXT,
    dependency_snapshot JSONB NOT NULL,
    status TEXT NOT NULL,
    prepared_by_employee_id TEXT NOT NULL,
    prepared_by_username TEXT NOT NULL,
    prepared_note TEXT NOT NULL,
    prepared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_by_employee_id TEXT,
    approved_by_username TEXT,
    approval_note TEXT,
    approved_at TIMESTAMPTZ,
    execution_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql()`CREATE TABLE IF NOT EXISTS catalog_cleanup_plan_events (
    id BIGSERIAL PRIMARY KEY,
    plan_id UUID NOT NULL,
    event_type TEXT NOT NULL,
    actor_employee_id TEXT NOT NULL,
    actor_username TEXT NOT NULL,
    detail JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql()`CREATE INDEX IF NOT EXISTS idx_catalog_cleanup_plans_status ON catalog_cleanup_plans(status, updated_at DESC)`;
  await sql()`CREATE INDEX IF NOT EXISTS idx_catalog_cleanup_plan_events_plan ON catalog_cleanup_plan_events(plan_id, created_at DESC)`;
  schemaReady = true;
}
async function inspectDependencies(productIds: string[]) {
  const rawBase = process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_URL?.trim() || "";
  const apiKey = process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_API_KEY?.trim() || "";
  if (!rawBase || !apiKey) throw new Error("POS_DEPENDENCY_INSPECTOR_NOT_CONFIGURED");
  const base = validateServerIntegrationBaseUrl(rawBase).toString().replace(/\/$/, "");
  const safeFetch = createHardenedServerFetch({ timeoutMs: 7000, maxResponseBytes: 1_000_000 });
  const snapshots=[];
  for (const productId of productIds) {
    const response = await safeFetch(`${base}/api/commerce-sync/catalog-cleanup-dependencies/${encodeURIComponent(productId)}`, {
      method:"GET", headers:{ Accept:"application/json", "X-API-Key":apiKey },
    });
    const payload = await response.json().catch(()=>null);
    if (!response.ok || !payload) throw new Error(`POS_DEPENDENCY_INSPECTION_${response.status}`);
    snapshots.push(payload);
  }
  return snapshots;
}

export default async function handler(request:any,response:any) {
  const method=String(request.method||"GET").toUpperCase();
  if (!["GET","POST"].includes(method)) { response.setHeader("Allow","GET, POST"); return send(response,405,{error:{code:"METHOD_NOT_ALLOWED",message:"GET or POST is required."}}); }
  const cookies=parseCookie(firstHeader(request.headers?.cookie));
  const session=readStaffSession(cookies[STAFF_COOKIE_NAME]);
  if (!session) return send(response,401,{error:{code:"STAFF_AUTH_REQUIRED",message:"Staff sign-in is required."}});
  if (!canStaff(session,"inventory_delete")) return send(response,403,{error:{code:"CATALOG_CLEANUP_PERMISSION_REQUIRED",message:"Inventory deletion authority is required to prepare cleanup plans."}});
  try {
    await ensureSchema();
    if (method==="GET") {
      const rows=await sql()`SELECT * FROM catalog_cleanup_plans ORDER BY updated_at DESC LIMIT 250`;
      return send(response,200,{plans:rows});
    }
    const body=bodyObject(request); const action=text(body.action,40);
    if (action==="prepare") {
      const issueKey=text(body.issueKey,80).toLowerCase(); const actionType=text(body.actionType,40); const note=text(body.note,1200);
      if (!/^[a-f0-9]{64}$/.test(issueKey)) return send(response,400,{error:{code:"INVALID_ISSUE_KEY",message:"A valid catalog finding key is required."}});
      if (!["archive","merge"].includes(actionType)) return send(response,400,{error:{code:"INVALID_CLEANUP_ACTION",message:"Cleanup plans may propose archive or merge only."}});
      if (!note) return send(response,400,{error:{code:"PREPARATION_NOTE_REQUIRED",message:"Explain why this cleanup plan is being prepared."}});
      const reviews=await sql()`SELECT r.issue_key,r.classification,r.review_state,r.product_ids,f.last_seen_at
        FROM catalog_integrity_reviews r JOIN catalog_integrity_findings f ON f.issue_key=r.issue_key
        WHERE r.issue_key=${issueKey} LIMIT 1` as unknown as Array<{issue_key:string;classification:string;review_state:string;product_ids:string[];last_seen_at:string}>;
      const review=reviews[0];
      if (!review || review.classification!=="cleanup_candidate" || review.review_state!=="approved_for_cleanup") return send(response,409,{error:{code:"CLEANUP_CANDIDATE_REQUIRED",message:"The finding must first be classified as an approved cleanup candidate."}});
      if (!review.last_seen_at || Date.now()-Date.parse(review.last_seen_at)>24*60*60*1000) return send(response,409,{error:{code:"FRESH_SCAN_REQUIRED",message:"Run a fresh catalog integrity scan before preparing cleanup."}});
      const productIds=(Array.isArray(review.product_ids)?review.product_ids:[]).map(String).filter(Boolean);
      if (!productIds.length) return send(response,409,{error:{code:"CLEANUP_PRODUCTS_MISSING",message:"No registered products are attached to this finding."}});
      const targetProductId=actionType==="merge"?text(body.targetProductId,120):"";
      if (actionType==="merge" && (!targetProductId || !productIds.includes(targetProductId))) return send(response,400,{error:{code:"MERGE_TARGET_REQUIRED",message:"Choose one affected product as the surviving merge target."}});
      const dependencies=await inspectDependencies(productIds);
      const planId=crypto.randomUUID(); const productIdsJson=JSON.stringify(productIds); const depsJson=JSON.stringify(dependencies);
      const result=await sql()`WITH plan_write AS (
        INSERT INTO catalog_cleanup_plans(id,issue_key,action_type,source_product_ids,target_product_id,dependency_snapshot,status,prepared_by_employee_id,prepared_by_username,prepared_note)
        VALUES(${planId},${issueKey},${actionType},${productIdsJson}::jsonb,${targetProductId||null},${depsJson}::jsonb,'awaiting_second_approval',${session.employeeId},${session.username},${note})
        ON CONFLICT(issue_key) DO UPDATE SET action_type=EXCLUDED.action_type,source_product_ids=EXCLUDED.source_product_ids,target_product_id=EXCLUDED.target_product_id,dependency_snapshot=EXCLUDED.dependency_snapshot,status='awaiting_second_approval',prepared_by_employee_id=EXCLUDED.prepared_by_employee_id,prepared_by_username=EXCLUDED.prepared_by_username,prepared_note=EXCLUDED.prepared_note,prepared_at=NOW(),approved_by_employee_id=NULL,approved_by_username=NULL,approval_note=NULL,approved_at=NULL,execution_enabled=FALSE,updated_at=NOW()
        RETURNING *
      ), event_write AS (
        INSERT INTO catalog_cleanup_plan_events(plan_id,event_type,actor_employee_id,actor_username,detail)
        SELECT id,'prepared',${session.employeeId},${session.username},jsonb_build_object('action_type',action_type,'dependency_snapshot',dependency_snapshot) FROM plan_write RETURNING id
      ) SELECT plan_write.*,(SELECT id FROM event_write LIMIT 1) event_id FROM plan_write`;
      return send(response,200,{plan:result[0]});
    }
    if (action==="approve") {
      if (!canStaff(session,"security_manage")) return send(response,403,{error:{code:"SECOND_APPROVER_PERMISSION_REQUIRED",message:"Security management authority is required for second approval."}});
      const planId=text(body.planId,80); const note=text(body.note,1200);
      if (!planId || !note) return send(response,400,{error:{code:"APPROVAL_DETAILS_REQUIRED",message:"Plan id and approval note are required."}});
      const rows=await sql()`SELECT * FROM catalog_cleanup_plans WHERE id=${planId} LIMIT 1` as unknown as Array<Record<string,any>>; const plan=rows[0];
      if (!plan || plan.status!=="awaiting_second_approval") return send(response,409,{error:{code:"PLAN_NOT_APPROVABLE",message:"This cleanup plan is not awaiting approval."}});
      if (String(plan.prepared_by_employee_id)===String(session.employeeId)) return send(response,409,{error:{code:"INDEPENDENT_APPROVER_REQUIRED",message:"The preparer cannot provide the second approval."}});
      const updated=await sql()`WITH plan_update AS (
        UPDATE catalog_cleanup_plans SET status='approved_not_executable',approved_by_employee_id=${session.employeeId},approved_by_username=${session.username},approval_note=${note},approved_at=NOW(),execution_enabled=FALSE,updated_at=NOW() WHERE id=${planId} AND status='awaiting_second_approval' RETURNING *
      ), event_write AS (
        INSERT INTO catalog_cleanup_plan_events(plan_id,event_type,actor_employee_id,actor_username,detail)
        SELECT id,'second_approved',${session.employeeId},${session.username},jsonb_build_object('note',${note},'execution_enabled',FALSE) FROM plan_update RETURNING id
      ) SELECT plan_update.*,(SELECT id FROM event_write LIMIT 1) event_id FROM plan_update`;
      if (!updated[0]) return send(response,409,{error:{code:"PLAN_STATE_CHANGED",message:"The cleanup plan changed before approval completed."}});
      return send(response,200,{plan:updated[0]});
    }
    return send(response,400,{error:{code:"INVALID_ACTION",message:"Use prepare or approve."}});
  } catch(error) {
    console.error("catalog_cleanup_plan_error",{code:error instanceof Error?error.message:"unknown"});
    return send(response,503,{error:{code:"CATALOG_CLEANUP_UNAVAILABLE",message:"Catalog cleanup planning is temporarily unavailable."}});
  }
}
