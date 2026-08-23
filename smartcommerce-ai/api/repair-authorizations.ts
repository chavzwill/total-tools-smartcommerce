import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";
import { firstHeader, recordSecurityEvent } from "../src/server/securityInfrastructure.js";
import { canStaff, parseCookie, readStaffSession, STAFF_COOKIE_NAME } from "../src/server/staffSession.js";

let sqlClient: ReturnType<typeof neon> | undefined;
let schemaReady = false;
type Row = Record<string, any>;
function sql(){if(!sqlClient){const url=process.env.SMARTCOMMERCE_DATABASE_URL||process.env.DATABASE_URL;if(!url)throw new Error("REPAIR_AUTHORIZATION_DATABASE_NOT_CONFIGURED");sqlClient=neon(url);}return sqlClient;}
const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");
function send(res:any,status:number,payload:unknown){res.statusCode=status;res.setHeader("Content-Type","application/json");res.setHeader("Cache-Control","no-store");res.setHeader("X-Content-Type-Options","nosniff");res.end(JSON.stringify(payload));}
function staff(req:any){const token=parseCookie(firstHeader(req.headers?.cookie))[STAFF_COOKIE_NAME];return readStaffSession(token);}
function sameOrigin(req:any){const origin=firstHeader(req.headers?.origin);if(!origin)return true;const host=firstHeader(req.headers?.host);if(!host)return false;try{return new URL(origin).host===host;}catch{return false;}}
async function readBody(req:AsyncIterable<unknown>){const chunks:Buffer[]=[];let total=0;for await(const chunk of req){if(chunk==null)continue;const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(String(chunk));total+=buffer.length;if(total>64_000)throw new Error("REQUEST_TOO_LARGE");chunks.push(buffer);}return JSON.parse(Buffer.concat(chunks).toString("utf8")||"{}");}
async function ensureSchema(){
  if(schemaReady)return;
  await sql()`CREATE TABLE IF NOT EXISTS repair_authorizations (
    id TEXT PRIMARY KEY, work_order_id TEXT NOT NULL,
    authorization_type TEXT NOT NULL CHECK (authorization_type IN ('initial_estimate','change_order')),
    version INTEGER NOT NULL, status TEXT NOT NULL CHECK (status IN ('pending','approved','declined','superseded','cancelled')),
    currency TEXT NOT NULL DEFAULT 'JMD', labor_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    consumables_amount NUMERIC(14,2) NOT NULL DEFAULT 0, parts_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(14,2) NOT NULL DEFAULT 0, deposit_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    scope_text TEXT, reason TEXT, requested_by TEXT NOT NULL, requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_by TEXT, decision_channel TEXT, decision_note TEXT, decided_at TIMESTAMPTZ, supersedes_id TEXT,
    customer_token_hash TEXT, customer_token_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(work_order_id, version)
  )`;
  await sql()`ALTER TABLE repair_authorizations ADD COLUMN IF NOT EXISTS customer_token_hash TEXT`;
  await sql()`ALTER TABLE repair_authorizations ADD COLUMN IF NOT EXISTS customer_token_expires_at TIMESTAMPTZ`;
  await sql()`CREATE INDEX IF NOT EXISTS idx_repair_authorizations_work_order ON repair_authorizations(work_order_id,version DESC)`;
  await sql()`CREATE INDEX IF NOT EXISTS idx_repair_authorizations_customer_token ON repair_authorizations(customer_token_hash)`;
  await sql()`CREATE TABLE IF NOT EXISTS repair_authorization_events (
    id TEXT PRIMARY KEY, authorization_id TEXT NOT NULL, work_order_id TEXT NOT NULL, actor_id TEXT,
    event_type TEXT NOT NULL, event_json JSONB, occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  schemaReady=true;
}
async function audit(authorizationId:string,workOrderId:string,actorId:string|null,eventType:string,event:unknown){await sql()`INSERT INTO repair_authorization_events(id,authorization_id,work_order_id,actor_id,event_type,event_json) VALUES(${`rae_${randomBytes(16).toString("hex")}`},${authorizationId},${workOrderId},${actorId},${eventType},${JSON.stringify(event??{})}::jsonb)`;}
function issueToken(){const customerToken=randomBytes(32).toString("base64url");const expiresAt=new Date(Date.now()+7*24*60*60*1000).toISOString();return{customerToken,expiresAt};}

export default async function handler(req:any,res:any){
  try{
    const session=staff(req);if(!session)return send(res,401,{error:{code:"STAFF_AUTH_REQUIRED",message:"Staff sign in is required."}});
    if(!canStaff(session,"work_orders"))return send(res,403,{error:{code:"WORK_ORDER_ACCESS_REQUIRED",message:"Work-order access is required."}});
    await ensureSchema();const method=String(req.method||"GET").toUpperCase();const workOrderId=String(req.query?.workOrderId||"").trim();
    if(!workOrderId)return send(res,400,{error:{code:"WORK_ORDER_REQUIRED",message:"A work order is required."}});
    if(method==="GET"){
      const authorizations=await sql()`SELECT id,work_order_id,authorization_type,version,status,currency,labor_amount,consumables_amount,parts_amount,total_amount,deposit_amount,scope_text,reason,requested_by,requested_at,decided_by,decision_channel,decision_note,decided_at,supersedes_id,customer_token_expires_at,created_at FROM repair_authorizations WHERE work_order_id=${workOrderId} ORDER BY version DESC` as Row[];
      const events=await sql()`SELECT * FROM repair_authorization_events WHERE work_order_id=${workOrderId} ORDER BY occurred_at DESC LIMIT 200` as Row[];
      return send(res,200,{authorizations,events});
    }
    if(method!=="POST"){res.setHeader("Allow","GET, POST");return send(res,405,{error:{code:"METHOD_NOT_ALLOWED",message:"GET or POST is required."}});}
    if(!sameOrigin(req))return send(res,403,{error:{code:"ORIGIN_REJECTED",message:"This request was rejected."}});
    if(!canStaff(session,"wo_assess"))return send(res,403,{error:{code:"ASSESSMENT_PERMISSION_REQUIRED",message:"Assessment permission is required."}});
    const input=await readBody(req);const action=String(input.action||"");

    if(action==="request_authorization"){
      const latestRows=await sql()`SELECT * FROM repair_authorizations WHERE work_order_id=${workOrderId} ORDER BY version DESC LIMIT 1` as Row[];const latest=latestRows[0]||null;
      const version=Number(latest?.version||0)+1;const labor=Math.max(0,Number(input.laborAmount||0));const consumables=Math.max(0,Number(input.consumablesAmount||0));const parts=Math.max(0,Number(input.partsAmount||0));const deposit=Math.max(0,Number(input.depositAmount||0));const total=Number((labor+consumables+parts).toFixed(2));
      const scope=String(input.scopeText||"").trim();const reason=String(input.reason||"").trim()||null;const type=latest?"change_order":"initial_estimate";
      if(!scope)return send(res,400,{error:{code:"AUTHORIZATION_SCOPE_REQUIRED",message:"Describe the repair scope being presented to the customer."}});
      if(latest&&latest.status==="pending"){await sql()`UPDATE repair_authorizations SET status='superseded',customer_token_hash=NULL WHERE id=${String(latest.id)}`;await audit(String(latest.id),workOrderId,session.employeeId,"superseded",{byVersion:version});}
      const id=`ra_${randomBytes(16).toString("hex")}`;const {customerToken,expiresAt}=issueToken();
      const rows=await sql()`INSERT INTO repair_authorizations(id,work_order_id,authorization_type,version,status,currency,labor_amount,consumables_amount,parts_amount,total_amount,deposit_amount,scope_text,reason,requested_by,supersedes_id,customer_token_hash,customer_token_expires_at)
        VALUES(${id},${workOrderId},${type},${version},'pending','JMD',${labor},${consumables},${parts},${total},${deposit},${scope},${reason},${session.employeeId},${latest?.id||null},${tokenHash(customerToken)},${expiresAt}::timestamptz) RETURNING id,work_order_id,authorization_type,version,status,currency,labor_amount,consumables_amount,parts_amount,total_amount,deposit_amount,scope_text,reason,requested_by,requested_at,supersedes_id,customer_token_expires_at,created_at` as Row[];
      await audit(id,workOrderId,session.employeeId,"authorization_requested",rows[0]);await recordSecurityEvent({request:req,eventType:"repair_authorization_requested",eventStatus:"success",riskLevel:"medium",subject:workOrderId,metadata:{authorizationId:id,version,total}}).catch(()=>undefined);
      return send(res,201,{authorization:rows[0],customerToken,expiresAt});
    }

    if(action==="reissue_customer_link"){
      const authorizationId=String(input.authorizationId||"").trim();
      const currentRows=await sql()`SELECT * FROM repair_authorizations WHERE id=${authorizationId} AND work_order_id=${workOrderId} LIMIT 1` as Row[];const current=currentRows[0];
      if(!current)return send(res,404,{error:{code:"AUTHORIZATION_NOT_FOUND",message:"Authorization not found."}});
      if(current.status!=="pending")return send(res,409,{error:{code:"AUTHORIZATION_NOT_PENDING",message:"Only a pending authorization can receive a new customer link."}});
      const {customerToken,expiresAt}=issueToken();
      await sql()`UPDATE repair_authorizations SET customer_token_hash=${tokenHash(customerToken)},customer_token_expires_at=${expiresAt}::timestamptz WHERE id=${authorizationId}`;
      await audit(authorizationId,workOrderId,session.employeeId,"customer_link_reissued",{expiresAt});
      await recordSecurityEvent({request:req,eventType:"repair_authorization_link_reissued",eventStatus:"success",riskLevel:"medium",subject:workOrderId,metadata:{authorizationId}}).catch(()=>undefined);
      return send(res,200,{authorizationId,customerToken,expiresAt});
    }

    if(action==="record_decision"){
      const authorizationId=String(input.authorizationId||"").trim();const decision=String(input.decision||"").toLowerCase();const channel=String(input.channel||"staff_recorded").trim();const note=String(input.note||"").trim()||null;
      if(!authorizationId||!["approved","declined"].includes(decision))return send(res,400,{error:{code:"INVALID_AUTHORIZATION_DECISION",message:"Choose an authorization and record approved or declined."}});
      const currentRows=await sql()`SELECT * FROM repair_authorizations WHERE id=${authorizationId} AND work_order_id=${workOrderId} LIMIT 1` as Row[];const current=currentRows[0];
      if(!current)return send(res,404,{error:{code:"AUTHORIZATION_NOT_FOUND",message:"Authorization not found."}});if(current.status!=="pending")return send(res,409,{error:{code:"AUTHORIZATION_ALREADY_DECIDED",message:"This authorization is no longer pending."}});
      const rows=await sql()`UPDATE repair_authorizations SET status=${decision},decided_by=${session.employeeId},decision_channel=${channel},decision_note=${note},decided_at=NOW(),customer_token_hash=NULL WHERE id=${authorizationId} RETURNING *` as Row[];await audit(authorizationId,workOrderId,session.employeeId,`authorization_${decision}`,{channel,note});return send(res,200,{authorization:rows[0]});
    }
    return send(res,400,{error:{code:"UNKNOWN_ACTION",message:"Unknown repair authorization action."}});
  }catch(error){const code=error instanceof Error?error.message:"REPAIR_AUTHORIZATION_ERROR";console.error("repair_authorization_error",{code});return send(res,code==="REQUEST_TOO_LARGE"?413:500,{error:{code,message:"Repair authorization could not be completed."}});}
}
