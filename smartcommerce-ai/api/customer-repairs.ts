import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";
import { createHardenedServerFetch, validateServerIntegrationBaseUrl } from "../src/server/hardenedOutboundFetch.js";
import { firstHeader, recordSecurityEvent } from "../src/server/securityInfrastructure.js";

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
  const out: Record<string,string> = {};
  for (const part of (header || "").split(";")) {
    const index = part.indexOf("="); if (index <= 0) continue;
    try { out[part.slice(0,index).trim()] = decodeURIComponent(part.slice(index+1).trim()); }
    catch { out[part.slice(0,index).trim()] = part.slice(index+1).trim(); }
  }
  return out;
}
function send(res:any,status:number,payload:unknown){res.statusCode=status;res.setHeader("Content-Type","application/json");res.setHeader("Cache-Control","no-store");res.setHeader("X-Content-Type-Options","nosniff");res.end(JSON.stringify(payload));}
function sameOrigin(req:any){const origin=firstHeader(req.headers?.origin);if(!origin)return true;const host=firstHeader(req.headers?.host);if(!host)return false;try{return new URL(origin).host===host;}catch{return false;}}
async function body(req:AsyncIterable<unknown>){const chunks:Buffer[]=[];let total=0;for await(const chunk of req){if(chunk==null)continue;const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(String(chunk));total+=b.length;if(total>16_000)throw new Error("REQUEST_TOO_LARGE");chunks.push(b);}return JSON.parse(Buffer.concat(chunks).toString("utf8")||"{}");}

async function sessionCustomer(req:any): Promise<Customer | null> {
  const token = parseCookie(firstHeader(req.headers?.cookie))[COOKIE_NAME];
  if (!token) return null;
  const rows = await sql()`SELECT c.id,c.email,c.full_name,c.phone,c.email_verified FROM customer_sessions s JOIN customer_accounts c ON c.id=s.customer_id WHERE s.token_hash=${hashToken(token)} AND s.revoked_at IS NULL AND s.expires_at>NOW() LIMIT 1` as Row[];
  return (rows[0] as Customer) || null;
}

async function ensureSchema(){
  if(schemaReady)return;
  await sql()`CREATE TABLE IF NOT EXISTS customer_pos_links(
    customer_account_id TEXT PRIMARY KEY,
    pos_customer_id TEXT NOT NULL,
    matched_by TEXT NOT NULL,
    matched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_sync_at TIMESTAMPTZ
  )`;
  await sql()`CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_pos_links_pos_customer ON customer_pos_links(pos_customer_id)`;
  await sql()`CREATE TABLE IF NOT EXISTS customer_repair_imports(
    id TEXT PRIMARY KEY,
    customer_account_id TEXT NOT NULL,
    pos_customer_id TEXT NOT NULL,
    work_order_id TEXT NOT NULL,
    wo_number TEXT,
    status TEXT NOT NULL,
    item_label TEXT,
    description TEXT,
    branch_name TEXT,
    employee_name TEXT,
    assessment_fee NUMERIC(14,2) NOT NULL DEFAULT 0,
    estimate_labor NUMERIC(14,2) NOT NULL DEFAULT 0,
    estimate_consumables NUMERIC(14,2) NOT NULL DEFAULT 0,
    deposit_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    parts_total NUMERIC(14,2) NOT NULL DEFAULT 0,
    pickup_due_date DATE,
    source_created_at TIMESTAMPTZ,
    source_completed_at TIMESTAMPTZ,
    payload_json JSONB NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(customer_account_id,work_order_id)
  )`;
  await sql()`CREATE INDEX IF NOT EXISTS idx_customer_repairs_account ON customer_repair_imports(customer_account_id,source_created_at DESC)`;
  schemaReady=true;
}

function configuredPos(){const raw=process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_URL?.trim();if(!raw)throw new Error("POS_NOT_CONFIGURED");return validateServerIntegrationBaseUrl(raw).toString().replace(/\/$/,"");}
function normalizeEmail(value:unknown){return String(value||"").trim().toLowerCase();}
function normalizePhone(value:unknown){return String(value||"").replace(/\D/g,"");}

async function posGet(path:string){
  const base=configuredPos(); const url=new URL(`${base}/api/${path.replace(/^\/+/,"")}`);
  const headers:Record<string,string>={Accept:"application/json"};
  const key=process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_API_KEY?.trim(); if(key)headers["X-API-Key"]=key;
  const fetcher=createHardenedServerFetch({timeoutMs:9000,maxResponseBytes:2_000_000});
  const response=await fetcher(url,{headers});
  if(!response.ok)throw new Error(`POS_IMPORT_${response.status}`);
  return response.json();
}

async function resolveLink(customer:Customer){
  const existing=await sql()`SELECT * FROM customer_pos_links WHERE customer_account_id=${customer.id} LIMIT 1` as Row[];
  if(existing[0])return existing[0];
  const queries=[customer.email,customer.phone].filter(Boolean).map((value)=>String(value));
  const candidates=new Map<string,Row>();
  for(const query of queries){
    const rows=await posGet(`customers?search=${encodeURIComponent(query)}&active=1`);
    for(const row of Array.isArray(rows)?rows:[]){
      const emailMatch=normalizeEmail(row.email)&&normalizeEmail(row.email)===normalizeEmail(customer.email);
      const phoneMatch=normalizePhone(row.phone)&&normalizePhone(row.phone)===normalizePhone(customer.phone);
      if(emailMatch||phoneMatch)candidates.set(String(row.id),{...row,matched_by:emailMatch&&phoneMatch?"email+phone":emailMatch?"email":"phone"});
    }
  }
  if(candidates.size!==1)return { ambiguous:candidates.size>1, missing:candidates.size===0 };
  const candidate=[...candidates.values()][0];
  const rows=await sql()`INSERT INTO customer_pos_links(customer_account_id,pos_customer_id,matched_by) VALUES(${customer.id},${String(candidate.id)},${String(candidate.matched_by)}) ON CONFLICT(customer_account_id) DO UPDATE SET pos_customer_id=EXCLUDED.pos_customer_id,matched_by=EXCLUDED.matched_by RETURNING *` as Row[];
  return rows[0];
}

async function importRepairs(accountId:string,posCustomerId:string){
  const repairs=await posGet(`work-orders?customer_id=${encodeURIComponent(posCustomerId)}&limit=200`);
  let imported=0;
  for(const row of Array.isArray(repairs)?repairs:[]){
    const workOrderId=String(row.id);
    await sql()`INSERT INTO customer_repair_imports(id,customer_account_id,pos_customer_id,work_order_id,wo_number,status,item_label,description,branch_name,employee_name,assessment_fee,estimate_labor,estimate_consumables,deposit_amount,parts_total,pickup_due_date,source_created_at,source_completed_at,payload_json,synced_at)
      VALUES(${`cri_${randomBytes(16).toString("hex")}`},${accountId},${posCustomerId},${workOrderId},${row.wo_number||null},${String(row.status||"unknown")},${row.item_label||null},${row.description||null},${row.branch_name||null},${row.employee_name||null},${Number(row.assessment_fee||0)},${Number(row.estimate_labor||0)},${Number(row.estimate_consumables||0)},${Number(row.deposit_amount||0)},${Number(row.parts_total||0)},${row.pickup_due_date||null},${row.created_at||null},${row.completed_at||null},${JSON.stringify(row)}::jsonb,NOW())
      ON CONFLICT(customer_account_id,work_order_id) DO UPDATE SET wo_number=EXCLUDED.wo_number,status=EXCLUDED.status,item_label=EXCLUDED.item_label,description=EXCLUDED.description,branch_name=EXCLUDED.branch_name,employee_name=EXCLUDED.employee_name,assessment_fee=EXCLUDED.assessment_fee,estimate_labor=EXCLUDED.estimate_labor,estimate_consumables=EXCLUDED.estimate_consumables,deposit_amount=EXCLUDED.deposit_amount,parts_total=EXCLUDED.parts_total,pickup_due_date=EXCLUDED.pickup_due_date,source_created_at=EXCLUDED.source_created_at,source_completed_at=EXCLUDED.source_completed_at,payload_json=EXCLUDED.payload_json,synced_at=NOW()`;
    imported++;
  }
  await sql()`UPDATE customer_pos_links SET last_sync_at=NOW() WHERE customer_account_id=${accountId}`;
  return imported;
}

async function accountRepairs(accountId:string){
  return await sql()`SELECT r.*, a.id AS authorization_id,a.version AS authorization_version,a.status AS authorization_status,a.total_amount AS authorization_total,a.deposit_amount AS authorization_deposit,a.scope_text AS authorization_scope,a.requested_at AS authorization_requested_at,a.decided_at AS authorization_decided_at
    FROM customer_repair_imports r
    LEFT JOIN LATERAL (SELECT * FROM repair_authorizations ra WHERE ra.work_order_id=r.work_order_id ORDER BY ra.version DESC LIMIT 1) a ON TRUE
    WHERE r.customer_account_id=${accountId}
    ORDER BY COALESCE(r.source_created_at,r.synced_at) DESC` as Row[];
}

export default async function handler(req:any,res:any){
  try{
    await ensureSchema();
    const customer=await sessionCustomer(req); if(!customer)return send(res,401,{error:{code:"CUSTOMER_AUTH_REQUIRED",message:"Sign in to view your repairs."}});
    if(!customer.email_verified)return send(res,403,{error:{code:"VERIFIED_ACCOUNT_REQUIRED",message:"Verify your email before viewing repair records."}});
    const method=String(req.method||"GET").toUpperCase();
    if(method==="GET"){
      const link:any=await resolveLink(customer);
      if(link?.ambiguous)return send(res,409,{linked:false,error:{code:"AMBIGUOUS_POS_CUSTOMER_MATCH",message:"We found more than one matching service customer. Total Tools needs to confirm the account link before repair history can be shown."}});
      if(link?.missing)return send(res,200,{linked:false,repairs:[],message:"No matching Total Tools service customer was found yet."});
      let syncError:string|undefined;
      try{await importRepairs(customer.id,String(link.pos_customer_id));}catch(error){syncError=error instanceof Error?error.message:"POS_IMPORT_FAILED";}
      const repairs=await accountRepairs(customer.id);
      return send(res,200,{linked:true,providerCustomerId:String(link.pos_customer_id),matchedBy:link.matched_by,lastSyncAt:link.last_sync_at||null,repairs,syncWarning:syncError?"Live POS refresh was unavailable; showing the latest imported SmartCommerce copy.":undefined});
    }
    if(method!=="POST"){res.setHeader("Allow","GET, POST");return send(res,405,{error:{code:"METHOD_NOT_ALLOWED",message:"GET or POST is required."}});}
    if(!sameOrigin(req))return send(res,403,{error:{code:"ORIGIN_REJECTED",message:"This request was rejected."}});
    const input=await body(req); const action=String(input.action||"");
    if(action==="decide_authorization"){
      const authorizationId=String(input.authorizationId||"").trim(); const decision=String(input.decision||"").toLowerCase(); const note=String(input.note||"").trim().slice(0,1000)||null;
      if(!authorizationId||!["approved","declined"].includes(decision))return send(res,400,{error:{code:"INVALID_AUTHORIZATION_DECISION",message:"Choose approve or decline."}});
      const rows=await sql()`SELECT a.*,r.customer_account_id FROM repair_authorizations a JOIN customer_repair_imports r ON r.work_order_id=a.work_order_id WHERE a.id=${authorizationId} AND r.customer_account_id=${customer.id} LIMIT 1` as Row[];
      const current=rows[0]; if(!current)return send(res,404,{error:{code:"AUTHORIZATION_NOT_FOUND",message:"That repair authorization is not linked to this account."}}); if(current.status!=="pending")return send(res,409,{error:{code:"AUTHORIZATION_ALREADY_DECIDED",message:"This authorization is no longer pending."}});
      const updated=await sql()`UPDATE repair_authorizations SET status=${decision},decided_by=${customer.id},decision_channel='smartcommerce_account',decision_note=${note},decided_at=NOW(),customer_token_hash=NULL WHERE id=${authorizationId} RETURNING *` as Row[];
      await sql()`INSERT INTO repair_authorization_events(id,authorization_id,work_order_id,actor_id,event_type,event_json) VALUES(${`rae_${randomBytes(16).toString("hex")}`},${authorizationId},${String(current.work_order_id)},${customer.id},${`authorization_${decision}`},${JSON.stringify({channel:"smartcommerce_account",note})}::jsonb)`;
      await recordSecurityEvent({request:req,eventType:"customer_repair_authorization_decision",eventStatus:"success",riskLevel:"medium",subject:customer.id,metadata:{authorizationId,decision}}).catch(()=>undefined);
      return send(res,200,{authorization:updated[0],repairs:await accountRepairs(customer.id)});
    }
    return send(res,400,{error:{code:"UNKNOWN_ACTION",message:"Unknown customer repair action."}});
  }catch(error){const code=error instanceof Error?error.message:"CUSTOMER_REPAIRS_ERROR";console.error("customer_repairs_error",{code});return send(res,code==="REQUEST_TOO_LARGE"?413:503,{error:{code,message:"Your repair information is temporarily unavailable.",retryable:true}});}
}
