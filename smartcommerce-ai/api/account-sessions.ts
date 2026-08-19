import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";
import { enforceDurableRateLimit, firstHeader, recordSecurityEvent, requestIp, requestUserAgent } from "../src/server/securityInfrastructure.js";

const COOKIE_NAME = "sc_session";
const MAX_BODY_BYTES = 8_000;
let sqlClient: ReturnType<typeof neon> | undefined;

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("CUSTOMER_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}
function hashToken(value: string) { return createHash("sha256").update(value).digest("hex"); }
function parseCookie(header?: string) {
  const result: Record<string,string> = {};
  for (const part of (header || "").split(";")) {
    const i = part.indexOf("="); if (i <= 0) continue;
    const k = part.slice(0,i).trim(); const v = part.slice(i+1).trim();
    try { result[k] = decodeURIComponent(v); } catch { result[k] = v; }
  }
  return result;
}
function sameOrigin(request:any) {
  const origin = firstHeader(request.headers?.origin); if (!origin) return true;
  const host = firstHeader(request.headers?.host); if (!host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}
async function readJsonBody(request: AsyncIterable<unknown>) {
  const chunks: Buffer[] = []; let total = 0;
  for await (const chunk of request) {
    if (chunk === undefined || chunk === null) continue;
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    total += buffer.length;
    if (total > MAX_BODY_BYTES) { const error = new Error("BODY_TOO_LARGE") as Error & { status?: number }; error.status = 413; throw error; }
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
function send(response:any,status:number,payload:unknown){ response.statusCode=status; response.end(JSON.stringify(payload)); }
function deviceInfo(ua:string) {
  const u = ua.toLowerCase();
  const device = /iphone/.test(u) ? "iPhone" : /ipad/.test(u) ? "iPad" : /android/.test(u) ? "Android device" : /macintosh|mac os/.test(u) ? "Mac" : /windows/.test(u) ? "Windows device" : /linux/.test(u) ? "Linux device" : "Device";
  const browser = /edg\//.test(u) ? "Edge" : /crios|chrome\//.test(u) ? "Chrome" : /firefox\//.test(u) ? "Firefox" : /safari\//.test(u) ? "Safari" : "Browser";
  return { device, browser, label: `${device} · ${browser}` };
}

export default async function handler(request:any,response:any) {
  response.setHeader("Content-Type","application/json");
  response.setHeader("Cache-Control","no-store");
  response.setHeader("X-Content-Type-Options","nosniff");
  response.setHeader("Referrer-Policy","same-origin");
  try {
    const token = parseCookie(firstHeader(request.headers?.cookie))[COOKIE_NAME];
    if (!token) return send(response,401,{error:{code:"AUTH_REQUIRED",message:"Sign in to manage active sessions."}});
    const tokenHash = hashToken(token);
    const currentRows = await sql()`SELECT id, customer_id FROM customer_sessions WHERE token_hash=${tokenHash} AND revoked_at IS NULL AND expires_at>NOW() LIMIT 1` as Array<{id:string;customer_id:string}>;
    const current = currentRows[0];
    if (!current) return send(response,401,{error:{code:"AUTH_REQUIRED",message:"Sign in to manage active sessions."}});
    const method = String(request.method || "GET").toUpperCase();
    if (method === "GET") {
      const ua = requestUserAgent(request); const info = deviceInfo(ua);
      await sql()`UPDATE customer_sessions SET device_label=COALESCE(device_label,${info.label}), device_family=COALESCE(device_family,${info.device}), browser_family=COALESCE(browser_family,${info.browser}), last_activity_at=NOW() WHERE id=${current.id}`;
      const rows = await sql()`SELECT id, device_label, device_family, browser_family, auth_level, created_at, last_activity_at, expires_at FROM customer_sessions WHERE customer_id=${current.customer_id} AND revoked_at IS NULL AND expires_at>NOW() ORDER BY COALESCE(last_activity_at,created_at) DESC` as Array<any>;
      return send(response,200,{sessions:rows.map(r=>({id:r.id,label:r.device_label||"Existing session",deviceFamily:r.device_family||null,browserFamily:r.browser_family||null,authLevel:r.auth_level,current:r.id===current.id,createdAt:new Date(r.created_at).toISOString(),lastActivityAt:r.last_activity_at?new Date(r.last_activity_at).toISOString():null,expiresAt:new Date(r.expires_at).toISOString()}))});
    }
    if (method !== "POST") { response.setHeader("Allow","GET, POST"); return send(response,405,{error:{code:"METHOD_NOT_ALLOWED",message:"GET or POST is required."}}); }
    if (!sameOrigin(request)) return send(response,403,{error:{code:"ORIGIN_REJECTED",message:"This request was rejected."}});

    await enforceDurableRateLimit({ request, action: "session_management_ip", subject: requestIp(request), limit: 30, windowSeconds: 900 });
    await enforceDurableRateLimit({ request, action: "session_management_account", subject: current.customer_id, limit: 20, windowSeconds: 900 });

    const body = await readJsonBody(request) as { action?: string; sessionId?: string };
    const action=String(body.action||"");
    if (action === "revoke") {
      const sessionId=String(body.sessionId||"");
      if (!sessionId || sessionId===current.id) return send(response,400,{error:{code:"INVALID_SESSION",message:"Use normal sign out for this device."}});
      const rows=await sql()`UPDATE customer_sessions SET revoked_at=NOW() WHERE id=${sessionId} AND customer_id=${current.customer_id} AND revoked_at IS NULL RETURNING id` as Array<{id:string}>;
      if (!rows.length) return send(response,404,{error:{code:"SESSION_NOT_FOUND",message:"That active session was not found."}});
      await recordSecurityEvent({request,eventType:"session_revoked",eventStatus:"success",riskLevel:"medium",customerId:current.customer_id,sessionId:current.id,metadata:{revokedSessionId:sessionId}});
      return send(response,200,{ok:true});
    }
    if (action === "revoke_others") {
      const rows=await sql()`UPDATE customer_sessions SET revoked_at=NOW() WHERE customer_id=${current.customer_id} AND id<>${current.id} AND revoked_at IS NULL AND expires_at>NOW() RETURNING id` as Array<{id:string}>;
      await recordSecurityEvent({request,eventType:"other_sessions_revoked",eventStatus:"success",riskLevel:"medium",customerId:current.customer_id,sessionId:current.id,metadata:{count:rows.length}});
      return send(response,200,{ok:true,revoked:rows.length});
    }
    return send(response,400,{error:{code:"INVALID_ACTION",message:"That session action is not supported."}});
  } catch (error) {
    if (error instanceof SyntaxError) return send(response,400,{error:{code:"INVALID_JSON",message:"The request body is invalid."}});
    const status = Number((error as any)?.status || 500);
    if (status === 429) {
      const retryAfter = Math.max(1, Number((error as any)?.retryAfterSeconds || 900));
      response.setHeader("Retry-After", String(retryAfter));
      await recordSecurityEvent({request,eventType:"session_management_rate_limited",eventStatus:"blocked",riskLevel:"medium"}).catch(()=>undefined);
      return send(response,429,{error:{code:"RATE_LIMITED",message:"Too many session-management attempts. Try again later."}});
    }
    if (status === 413) return send(response,413,{error:{code:"REQUEST_TOO_LARGE",message:"The request is too large."}});
    console.error("account_sessions_error",{code:"session_management_failed"});
    return send(response,503,{error:{code:"SESSION_MANAGEMENT_UNAVAILABLE",message:"Session management is temporarily unavailable.",retryable:true}});
  }
}
