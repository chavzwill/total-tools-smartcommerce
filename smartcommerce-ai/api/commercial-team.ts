import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";
import { enforceDurableRateLimit, recordSecurityEvent, requestIp } from "../src/server/securityInfrastructure";

const COOKIE_NAME = "sc_session";
const MAX_BODY_BYTES = 32_000;
const INVITE_TTL_HOURS = 72;
const TEAM_ROLES = new Set(["owner", "admin", "approver", "buyer"]);
const TEAM_MANAGERS = new Set(["owner", "admin"]);
const PERMISSIONS = [
  "view_pricing", "place_orders", "create_requisitions", "submit_purchase_orders",
  "use_company_credit", "approve_purchases", "manage_job_sites", "view_invoices",
  "make_account_payments", "view_order_history", "manage_users", "receive_deliveries",
  "rental_authority", "repair_service_authority",
] as const;
type Permission = typeof PERMISSIONS[number];
type Session = { id: string; customer_id: string; email: string; email_verified: boolean; auth_level: string; step_up_expires_at: Date | string | null };
let sqlClient: ReturnType<typeof neon> | undefined;

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("COMMERCIAL_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}
function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function normalizeEmail(value: unknown) { return String(value || "").trim().toLowerCase(); }
function parseCookie(header?: string) {
  const out: Record<string, string> = {};
  for (const part of (header || "").split(";")) {
    const i = part.indexOf("="); if (i <= 0) continue;
    try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch {}
  }
  return out;
}
function sameOrigin(req: any) {
  const origin = first(req.headers?.origin); if (!origin) return true;
  const host = first(req.headers?.host); if (!host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}
async function body(req: AsyncIterable<unknown>) {
  const chunks: Buffer[] = []; let size = 0;
  for await (const value of req) {
    if (value == null) continue; const chunk = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
    size += chunk.length; if (size > MAX_BODY_BYTES) throw Object.assign(new Error("BODY_TOO_LARGE"), { status: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
function send(res: any, status: number, payload: unknown) { res.statusCode = status; res.end(JSON.stringify(payload)); }
async function session(req: any): Promise<Session | undefined> {
  const token = parseCookie(first(req.headers?.cookie))[COOKIE_NAME]; if (!token) return undefined;
  const rows = await sql()`
    SELECT s.id, s.customer_id, c.email, c.email_verified, s.auth_level, s.step_up_expires_at
    FROM customer_sessions s JOIN customer_accounts c ON c.id = s.customer_id
    WHERE s.token_hash = ${hash(token)} AND s.revoked_at IS NULL AND s.expires_at > NOW() LIMIT 1
  ` as Session[];
  return rows[0];
}
function hasStrongStepUp(value: Session) {
  return ["mfa", "passkey"].includes(value.auth_level)
    && !!value.step_up_expires_at && new Date(value.step_up_expires_at).getTime() > Date.now();
}
async function actorMembership(customerId: string, accountId: string) {
  const rows = await sql()`
    SELECT id, role, status FROM commercial_account_members
    WHERE customer_id = ${customerId} AND commercial_account_id = ${accountId} AND status = 'active' LIMIT 1
  ` as Array<{ id: string; role: string; status: string }>;
  return rows[0];
}
async function audit(accountId: string, customerId: string, type: string, status: "recorded" | "blocked", metadata: Record<string, unknown> = {}) {
  await sql()`
    INSERT INTO commercial_audit_events(id, commercial_account_id, actor_customer_id, event_type, event_status, metadata)
    VALUES(${"cae_" + randomBytes(16).toString("hex")}, ${accountId}, ${customerId}, ${type}, ${status}, ${JSON.stringify(metadata)}::jsonb)
  `;
}
function defaults(role: string): Record<Permission, boolean> {
  const all = Object.fromEntries(PERMISSIONS.map((permission) => [permission, false])) as Record<Permission, boolean>;
  if (role === "owner") return Object.fromEntries(PERMISSIONS.map((permission) => [permission, true])) as Record<Permission, boolean>;
  if (role === "admin") return { ...all, view_pricing:true, place_orders:true, create_requisitions:true, submit_purchase_orders:true, use_company_credit:true, approve_purchases:true, manage_job_sites:true, view_invoices:true, make_account_payments:true, view_order_history:true, manage_users:true, receive_deliveries:true, rental_authority:true, repair_service_authority:true };
  if (role === "approver") return { ...all, view_pricing:true, place_orders:true, create_requisitions:true, submit_purchase_orders:true, use_company_credit:true, approve_purchases:true, manage_job_sites:true, view_invoices:true, view_order_history:true, receive_deliveries:true, rental_authority:true, repair_service_authority:true };
  return { ...all, view_pricing:true, place_orders:true, create_requisitions:true, submit_purchase_orders:true, manage_job_sites:true, view_order_history:true, receive_deliveries:true, rental_authority:true, repair_service_authority:true };
}
function cleanOverrides(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key, enabled]) => PERMISSIONS.includes(key as Permission) && typeof enabled === "boolean"));
}
function minor(value: unknown) {
  if (value === "" || value == null) return null;
  const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 9_000_000_000_000) throw Object.assign(new Error("INVALID_LIMIT"), { status: 400 });
  return parsed;
}
async function authorizeManager(req: any, res: any, user: Session, accountId: string) {
  const actor = await actorMembership(user.customer_id, accountId);
  if (!actor || !TEAM_MANAGERS.has(actor.role)) {
    await audit(accountId, user.customer_id, "commercial_team_permission_denied", "blocked");
    send(res, 403, { error: { code: "COMMERCIAL_PERMISSION_DENIED", message: "Owner or administrator access is required." } }); return undefined;
  }
  if (!hasStrongStepUp(user)) {
    send(res, 403, { error: { code: "STEP_UP_REQUIRED", message: "Confirm your identity with MFA or a passkey before managing company users." } }); return undefined;
  }
  return actor;
}
async function listTeam(customerId: string, accountId: string) {
  const actor = await actorMembership(customerId, accountId); if (!actor) return undefined;
  const canManage = TEAM_MANAGERS.has(actor.role);
  const members = await sql()`
    SELECT m.id, m.customer_id, m.role, m.status, m.authority_status, c.full_name,
      CASE WHEN ${canManage} THEN c.email ELSE NULL END AS email,
      p.permission_overrides, p.spend_limit_order_minor, p.spend_limit_day_minor,
      p.spend_limit_month_minor, p.approval_limit_minor, p.currency
    FROM commercial_account_members m JOIN customer_accounts c ON c.id=m.customer_id
    LEFT JOIN commercial_member_policies p ON p.member_id=m.id AND p.commercial_account_id=m.commercial_account_id
    WHERE m.commercial_account_id=${accountId} AND m.status <> 'removed' ORDER BY m.created_at
  ` as any[];
  const invitations = canManage ? await sql()`
    SELECT id, invited_email, role, permission_overrides, spend_limit_order_minor, spend_limit_day_minor,
      spend_limit_month_minor, approval_limit_minor, currency, status, expires_at, created_at
    FROM commercial_member_invitations WHERE commercial_account_id=${accountId} AND status='pending' ORDER BY created_at DESC
  ` as any[] : [];
  return { canManage, members: members.map((m) => ({ ...m, permissions: { ...defaults(m.role), ...(m.permission_overrides || {}) } })), invitations };
}
async function activeOwnerCount(accountId: string) {
  const rows = await sql()`SELECT COUNT(*)::int AS count FROM commercial_account_members WHERE commercial_account_id=${accountId} AND role='owner' AND status='active'` as Array<{count:number}>;
  return Number(rows[0]?.count || 0);
}

export default async function handler(req: any, res: any) {
  res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store");
  const method = String(req.method || "GET").toUpperCase();
  try {
    const user = await session(req);
    if (!user) return send(res, 401, { error: { code: "AUTH_REQUIRED", message: "Sign in with your individual SmartCommerce account." } });
    if (method === "GET") {
      const accountId = String(req.query?.accountId || "");
      const token = String(req.query?.token || "");
      if (token) {
        const rows = await sql()`
          SELECT i.id, i.commercial_account_id, i.invited_email_normalized, i.role, i.permission_overrides,
            i.spend_limit_order_minor, i.spend_limit_day_minor, i.spend_limit_month_minor, i.approval_limit_minor,
            i.currency, i.status, i.expires_at, a.display_name
          FROM commercial_member_invitations i JOIN commercial_accounts a ON a.id=i.commercial_account_id
          WHERE i.token_hash=${hash(token)} LIMIT 1
        ` as any[];
        const invitation = rows[0];
        if (!invitation || invitation.status !== "pending" || new Date(invitation.expires_at).getTime() <= Date.now()) return send(res, 404, { error: { code: "INVITATION_NOT_AVAILABLE", message: "This invitation is invalid, expired, or already used." } });
        return send(res, 200, { invitation: { accountId: invitation.commercial_account_id, displayName: invitation.display_name, role: invitation.role, permissions: { ...defaults(invitation.role), ...(invitation.permission_overrides || {}) }, emailMatches: normalizeEmail(user.email) === invitation.invited_email_normalized, expiresAt: invitation.expires_at } });
      }
      const team = await listTeam(user.customer_id, accountId);
      if (!team) return send(res, 404, { error: { code: "COMMERCIAL_ACCOUNT_NOT_FOUND", message: "That commercial account is not available to you." } });
      return send(res, 200, team);
    }
    if (method !== "POST") { res.setHeader("Allow", "GET, POST"); return send(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "GET or POST is required." } }); }
    if (!sameOrigin(req)) return send(res, 403, { error: { code: "ORIGIN_REJECTED", message: "This request was rejected." } });
    const input = await body(req) as any; const action = String(input.action || "");
    if (action === "accept_invitation") {
      await enforceDurableRateLimit({ request:req, action:"commercial_invitation_accept", subject:user.customer_id, limit:12, windowSeconds:3600 });
      const token = String(input.token || ""); if (token.length < 32) return send(res, 400, { error:{ code:"INVALID_INVITATION", message:"Enter a valid invitation link." } });
      const rows = await sql()`
        SELECT * FROM commercial_member_invitations WHERE token_hash=${hash(token)} FOR UPDATE
      ` as any[]; const invitation = rows[0];
      if (!invitation || invitation.status !== "pending" || new Date(invitation.expires_at).getTime() <= Date.now()) return send(res, 404, { error:{ code:"INVITATION_NOT_AVAILABLE", message:"This invitation is invalid, expired, or already used." } });
      if (!user.email_verified || normalizeEmail(user.email) !== invitation.invited_email_normalized) {
        await audit(invitation.commercial_account_id, user.customer_id, "commercial_invitation_email_mismatch", "blocked");
        return send(res, 403, { error:{ code:"INVITATION_EMAIL_MISMATCH", message:"Sign in with the verified email address that received this invitation." } });
      }
      const memberId = "cmm_" + randomBytes(16).toString("hex");
      await sql()`
        WITH member AS (
          INSERT INTO commercial_account_members(id,commercial_account_id,customer_id,role,status,authority_status,invited_by_customer_id)
          VALUES(${memberId},${invitation.commercial_account_id},${user.customer_id},${invitation.role},'active','verified',${invitation.invited_by_customer_id})
          ON CONFLICT (commercial_account_id,customer_id) DO UPDATE SET role=EXCLUDED.role,status='active',authority_status='verified'
          RETURNING id
        ), policy AS (
          INSERT INTO commercial_member_policies(commercial_account_id,member_id,permission_overrides,spend_limit_order_minor,spend_limit_day_minor,spend_limit_month_minor,approval_limit_minor,currency,updated_by_customer_id)
          SELECT ${invitation.commercial_account_id},id,${JSON.stringify(invitation.permission_overrides || {})}::jsonb,${invitation.spend_limit_order_minor},${invitation.spend_limit_day_minor},${invitation.spend_limit_month_minor},${invitation.approval_limit_minor},${invitation.currency},${invitation.invited_by_customer_id} FROM member
          ON CONFLICT (commercial_account_id,member_id) DO UPDATE SET permission_overrides=EXCLUDED.permission_overrides,updated_at=NOW()
        )
        UPDATE commercial_member_invitations SET status='accepted',accepted_by_customer_id=${user.customer_id},accepted_at=NOW(),updated_at=NOW() WHERE id=${invitation.id} AND status='pending'
      `;
      await audit(invitation.commercial_account_id,user.customer_id,"commercial_invitation_accepted","recorded",{invitationId:invitation.id});
      return send(res,200,{accepted:true,accountId:invitation.commercial_account_id});
    }
    const accountId = String(input.accountId || ""); const actor = await authorizeManager(req,res,user,accountId); if (!actor) return;
    await enforceDurableRateLimit({ request:req, action:"commercial_team_management", subject:user.customer_id, limit:40, windowSeconds:3600 });
    if (action === "invite_member") {
      const email=normalizeEmail(input.email); const role=String(input.role||"buyer");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254 || !TEAM_ROLES.has(role) || (role==="owner" && actor.role!=="owner")) return send(res,400,{error:{code:"INVALID_INVITATION",message:"Enter a valid email and permitted role."}});
      const rawToken=randomBytes(32).toString("base64url"), id="cmi_"+randomBytes(16).toString("hex"), overrides=cleanOverrides(input.permissionOverrides);
      const order=minor(input.spendLimitOrderMinor),day=minor(input.spendLimitDayMinor),month=minor(input.spendLimitMonthMinor),approval=minor(input.approvalLimitMinor);
      await sql()`
        INSERT INTO commercial_member_invitations(id,commercial_account_id,invited_email,invited_email_normalized,token_hash,role,permission_overrides,spend_limit_order_minor,spend_limit_day_minor,spend_limit_month_minor,approval_limit_minor,currency,status,invited_by_customer_id,expires_at)
        VALUES(${id},${accountId},${email},${email},${hash(rawToken)},${role},${JSON.stringify(overrides)}::jsonb,${order},${day},${month},${approval},${String(input.currency||"JMD").slice(0,3).toUpperCase()},'pending',${user.customer_id},NOW()+INTERVAL '72 hours')
        ON CONFLICT (commercial_account_id,invited_email_normalized) WHERE status='pending'
        DO UPDATE SET token_hash=EXCLUDED.token_hash,role=EXCLUDED.role,permission_overrides=EXCLUDED.permission_overrides,expires_at=EXCLUDED.expires_at,updated_at=NOW()
      `;
      await audit(accountId,user.customer_id,"commercial_member_invited","recorded",{invitationId:id,role});
      const origin=first(req.headers?.origin)||("https://"+first(req.headers?.host));
      return send(res,201,{invitation:{id,email,role,expiresInHours:INVITE_TTL_HOURS,acceptUrl:`${origin}/#/commercial?invitation=${encodeURIComponent(rawToken)}`}});
    }
    const memberId=String(input.memberId||"");
    const targets=await sql()`SELECT id,customer_id,role,status FROM commercial_account_members WHERE id=${memberId} AND commercial_account_id=${accountId} LIMIT 1` as any[];
    const target=targets[0]; if (!target) return send(res,404,{error:{code:"MEMBER_NOT_FOUND",message:"That team member was not found."}});
    if (target.customer_id===user.customer_id) return send(res,409,{error:{code:"SELF_MANAGEMENT_BLOCKED",message:"Ask another owner to change your access."}});
    if (target.role==="owner" && actor.role!=="owner") return send(res,403,{error:{code:"OWNER_PROTECTED",message:"Administrators cannot alter an owner."}});
    if (action==="update_member") {
      const role=String(input.role||target.role); if(!TEAM_ROLES.has(role)||(role==="owner"&&actor.role!=="owner")) return send(res,400,{error:{code:"INVALID_ROLE",message:"Choose a permitted role."}});
      if(target.role==="owner"&&role!=="owner"&&await activeOwnerCount(accountId)<=1) return send(res,409,{error:{code:"LAST_OWNER_PROTECTED",message:"Assign another active owner before changing this owner."}});
      const overrides=cleanOverrides(input.permissionOverrides);
      await sql()`UPDATE commercial_account_members SET role=${role},updated_at=NOW() WHERE id=${memberId} AND commercial_account_id=${accountId}`;
      await sql()`
        INSERT INTO commercial_member_policies(commercial_account_id,member_id,permission_overrides,spend_limit_order_minor,spend_limit_day_minor,spend_limit_month_minor,approval_limit_minor,currency,updated_by_customer_id)
        VALUES(${accountId},${memberId},${JSON.stringify(overrides)}::jsonb,${minor(input.spendLimitOrderMinor)},${minor(input.spendLimitDayMinor)},${minor(input.spendLimitMonthMinor)},${minor(input.approvalLimitMinor)},${String(input.currency||"JMD").slice(0,3).toUpperCase()},${user.customer_id})
        ON CONFLICT(commercial_account_id,member_id) DO UPDATE SET permission_overrides=EXCLUDED.permission_overrides,spend_limit_order_minor=EXCLUDED.spend_limit_order_minor,spend_limit_day_minor=EXCLUDED.spend_limit_day_minor,spend_limit_month_minor=EXCLUDED.spend_limit_month_minor,approval_limit_minor=EXCLUDED.approval_limit_minor,currency=EXCLUDED.currency,updated_by_customer_id=EXCLUDED.updated_by_customer_id,updated_at=NOW()
      `;
      await audit(accountId,user.customer_id,"commercial_member_authority_updated","recorded",{memberId,role}); return send(res,200,{team:await listTeam(user.customer_id,accountId)});
    }
    if(["suspend_member","revoke_member"].includes(action)) {
      if(target.role==="owner"&&await activeOwnerCount(accountId)<=1) return send(res,409,{error:{code:"LAST_OWNER_PROTECTED",message:"The final active owner cannot be suspended or revoked."}});
      const status=action==="suspend_member"?"suspended":"removed";
      await sql()`UPDATE commercial_account_members SET status=${status},updated_at=NOW() WHERE id=${memberId} AND commercial_account_id=${accountId}`;
      await audit(accountId,user.customer_id,action==="suspend_member"?"commercial_member_suspended":"commercial_member_revoked","recorded",{memberId});
      await recordSecurityEvent({request:req,eventType:"commercial_membership_changed",eventStatus:status,riskLevel:"medium",customerId:user.customer_id,commercialAccountId:accountId,metadata:{memberId}});
      return send(res,200,{team:await listTeam(user.customer_id,accountId)});
    }
    if(action==="reactivate_member") {
      await sql()`UPDATE commercial_account_members SET status='active',updated_at=NOW() WHERE id=${memberId} AND commercial_account_id=${accountId} AND status='suspended'`;
      await audit(accountId,user.customer_id,"commercial_member_reactivated","recorded",{memberId}); return send(res,200,{team:await listTeam(user.customer_id,accountId)});
    }
    return send(res,400,{error:{code:"INVALID_ACTION",message:"That team-management action is not supported."}});
  } catch (error) {
    const status=Number((error as any)?.status||500);
    if(status===413)return send(res,413,{error:{code:"REQUEST_TOO_LARGE",message:"The request is too large."}});
    if(error instanceof SyntaxError)return send(res,400,{error:{code:"INVALID_JSON",message:"The request body is invalid."}});
    if(error instanceof Error&&error.message==="RATE_LIMITED")return send(res,429,{error:{code:"RATE_LIMITED",message:"Too many team-management requests. Try again later."}});
    if(error instanceof Error&&error.message==="INVALID_LIMIT")return send(res,400,{error:{code:"INVALID_LIMIT",message:"Spend and approval limits must be non-negative whole minor-unit values."}});
    console.error("commercial_team_error",{code:"commercial_team_request_failed"});
    return send(res,status>=400&&status<500?status:503,{error:{code:"COMMERCIAL_TEAM_UNAVAILABLE",message:"Commercial team management is temporarily unavailable.",retryable:true}});
  }
}
