import { neon } from "@neondatabase/serverless";
import { randomBytes } from "node:crypto";
import { firstHeader, recordSecurityEvent } from "../src/server/securityInfrastructure.js";
import { parseCookie, readStaffSession, STAFF_COOKIE_NAME } from "../src/server/staffSession.js";
import { calculateTechnicianCompensation, resolveTechnicianPayPeriod, type CompensationPlan, type TechnicianPeriodInput } from "../src/lib/technicianCompensation.js";

const MAX_BODY_BYTES = 48_000;
let sqlClient: ReturnType<typeof neon> | undefined;
let schemaReady = false;
type Row = Record<string, any>;

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("TECHNICIAN_COMPENSATION_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

function send(res: any, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.end(JSON.stringify(payload));
}

function sameOrigin(req: any) {
  const origin = firstHeader(req.headers?.origin);
  if (!origin) return true;
  const host = firstHeader(req.headers?.host);
  if (!host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

async function body(req: AsyncIterable<unknown>) {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    if (chunk == null) continue;
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    total += buffer.length;
    if (total > MAX_BODY_BYTES) {
      const error = new Error("REQUEST_TOO_LARGE") as Error & { status?: number };
      error.status = 413;
      throw error;
    }
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function staff(req: any) {
  const token = parseCookie(firstHeader(req.headers?.cookie))[STAFF_COOKIE_NAME];
  return readStaffSession(token);
}

function isAdmin(session: any) {
  const role = String(session?.role || "").toLowerCase();
  const group = String(session?.securityGroupName || "").toLowerCase();
  return role === "admin" || role === "owner" || group.includes("admin") || session?.permissions?.technician_compensation_admin === true;
}

function canReview(session: any) {
  return isAdmin(session) || session?.permissions?.technician_compensation_review === true || session?.permissions?.wo_supervisor === true;
}

async function ensureSchema() {
  if (schemaReady) return;
  await sql()`CREATE TABLE IF NOT EXISTS technician_compensation_plans (
    id TEXT NOT NULL,
    version INTEGER NOT NULL,
    name TEXT NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE,
    currency TEXT NOT NULL DEFAULT 'JMD',
    overtime_multiplier NUMERIC(8,3) NOT NULL DEFAULT 1.5,
    max_incentive_percent NUMERIC(8,3) NOT NULL DEFAULT 15,
    plan_json JSONB NOT NULL,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, version)
  )`;
  await sql()`CREATE TABLE IF NOT EXISTS technician_rate_versions (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    hourly_rate NUMERIC(14,2) NOT NULL CHECK (hourly_rate >= 0),
    overtime_multiplier NUMERIC(8,3) NOT NULL DEFAULT 1.5 CHECK (overtime_multiplier >= 1),
    grade TEXT,
    effective_from DATE NOT NULL,
    effective_to DATE,
    changed_by TEXT NOT NULL,
    change_reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql()`CREATE INDEX IF NOT EXISTS idx_technician_rate_employee_effective ON technician_rate_versions(employee_id,effective_from DESC)`;
  await sql()`CREATE TABLE IF NOT EXISTS technician_performance_periods (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft','review','approved','finalized','adjusted')),
    plan_id TEXT NOT NULL,
    plan_version INTEGER NOT NULL,
    rate_version_id TEXT NOT NULL,
    snapshot_json JSONB NOT NULL,
    result_json JSONB NOT NULL,
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    finalized_by TEXT,
    finalized_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(employee_id,period_start,period_end)
  )`;
  await sql()`CREATE TABLE IF NOT EXISTS technician_compensation_adjustments (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    source_period_id TEXT NOT NULL,
    applied_period_id TEXT NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    reason TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql()`CREATE TABLE IF NOT EXISTS technician_compensation_events (
    id TEXT PRIMARY KEY,
    employee_id TEXT,
    event_type TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    entity_id TEXT,
    reason TEXT,
    before_json JSONB,
    after_json JSONB,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  schemaReady = true;
}

async function audit(actorId: string, eventType: string, employeeId: string | null, entityId: string | null, reason: string | null, before: unknown, after: unknown) {
  await sql()`INSERT INTO technician_compensation_events(id,employee_id,event_type,actor_id,entity_id,reason,before_json,after_json)
    VALUES(${`tce_${randomBytes(16).toString("hex")}`},${employeeId},${eventType},${actorId},${entityId},${reason},${before == null ? null : JSON.stringify(before)}::jsonb,${after == null ? null : JSON.stringify(after)}::jsonb)`;
}

async function activePlan(at: string): Promise<Row | null> {
  const rows = await sql()`SELECT * FROM technician_compensation_plans WHERE effective_from<=${at}::date AND (effective_to IS NULL OR effective_to>${at}::date) ORDER BY effective_from DESC,version DESC LIMIT 1` as Row[];
  return rows[0] || null;
}

async function activeRate(employeeId: string, at: string): Promise<Row | null> {
  const rows = await sql()`SELECT * FROM technician_rate_versions WHERE employee_id=${employeeId} AND effective_from<=${at}::date AND (effective_to IS NULL OR effective_to>${at}::date) ORDER BY effective_from DESC,created_at DESC LIMIT 1` as Row[];
  return rows[0] || null;
}

function periodCsv(rows: Row[]) {
  const headers = ["employee_id","period_start","period_end","status","plan_id","plan_version","rate_version_id","performance_score","incentive_percent","incentive_amount","total_pay","finalized_at"];
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((row) => {
    const result = row.result_json || {};
    return [row.employee_id,row.period_start,row.period_end,row.status,row.plan_id,row.plan_version,row.rate_version_id,result.performanceScore,result.incentivePercent,result.incentiveAmount,result.totalPay,row.finalized_at].map(escape).join(",");
  })].join("\n");
}

export default async function handler(req: any, res: any) {
  try {
    const session = staff(req);
    if (!session) return send(res, 401, { error: { code: "STAFF_AUTH_REQUIRED", message: "Staff sign in is required." } });
    await ensureSchema();
    const method = String(req.method || "GET").toUpperCase();

    if (method === "GET") {
      const employeeId = String(req.query?.employeeId || "").trim();
      const exportFormat = String(req.query?.export || "").toLowerCase();
      const periodRef = String(req.query?.periodRef || "").trim();
      if (exportFormat === "csv") {
        if (!isAdmin(session)) return send(res, 403, { error: { code: "TECHNICIAN_COMPENSATION_ADMIN_REQUIRED", message: "Administrator permission is required." } });
        const bounds = resolveTechnicianPayPeriod(periodRef || new Date().toISOString().slice(0,10));
        const rows = await sql()`SELECT * FROM technician_performance_periods WHERE period_start=${bounds.start}::date AND period_end=${bounds.end}::date ORDER BY employee_id` as Row[];
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="technician-payroll-${bounds.start}-to-${bounds.end}.csv"`);
        res.setHeader("Cache-Control", "no-store");
        return res.end(periodCsv(rows));
      }
      const plans = await sql()`SELECT id,version,name,effective_from,effective_to,currency,overtime_multiplier,max_incentive_percent,plan_json,created_by,created_at FROM technician_compensation_plans ORDER BY effective_from DESC,version DESC` as Row[];
      const rates: Row[] = employeeId
        ? await sql()`SELECT * FROM technician_rate_versions WHERE employee_id=${employeeId} ORDER BY effective_from DESC,created_at DESC` as Row[]
        : isAdmin(session) ? await sql()`SELECT * FROM technician_rate_versions ORDER BY employee_id,effective_from DESC` as Row[] : [];
      const periods: Row[] = employeeId
        ? await sql()`SELECT * FROM technician_performance_periods WHERE employee_id=${employeeId} ORDER BY period_end DESC LIMIT 24` as Row[]
        : canReview(session) ? await sql()`SELECT * FROM technician_performance_periods ORDER BY period_end DESC,employee_id LIMIT 200` as Row[] : [];
      return send(res, 200, { plans, rates, periods, canAdminister: isAdmin(session), canReview: canReview(session), currentPeriod: resolveTechnicianPayPeriod(new Date().toISOString().slice(0,10)) });
    }

    if (method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return send(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "GET or POST is required." } });
    }
    if (!sameOrigin(req)) return send(res, 403, { error: { code: "ORIGIN_REJECTED", message: "This request was rejected." } });

    const input: any = await body(req);
    const action = String(input.action || "");

    if (action === "set_rate") {
      if (!isAdmin(session)) return send(res, 403, { error: { code: "TECHNICIAN_COMPENSATION_ADMIN_REQUIRED", message: "Administrator permission is required." } });
      const employeeId = String(input.employeeId || "").trim();
      const rate = Number(input.hourlyRate);
      const overtime = Number(input.overtimeMultiplier ?? 1.5);
      const effectiveFrom = String(input.effectiveFrom || "").slice(0, 10);
      const reason = String(input.reason || "").trim();
      const grade = String(input.grade || "").trim() || null;
      if (!employeeId || !Number.isFinite(rate) || rate < 0 || !Number.isFinite(overtime) || overtime < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom) || reason.length < 5) {
        return send(res, 400, { error: { code: "INVALID_RATE_CHANGE", message: "Employee, valid rate, effective date and change reason are required." } });
      }
      const previous = await sql()`SELECT * FROM technician_rate_versions WHERE employee_id=${employeeId} AND effective_from<=${effectiveFrom}::date ORDER BY effective_from DESC,created_at DESC LIMIT 1` as Row[];
      await sql()`UPDATE technician_rate_versions SET effective_to=${effectiveFrom}::date WHERE employee_id=${employeeId} AND effective_to IS NULL AND effective_from<${effectiveFrom}::date`;
      const id = `trv_${randomBytes(16).toString("hex")}`;
      const rows = await sql()`INSERT INTO technician_rate_versions(id,employee_id,hourly_rate,overtime_multiplier,grade,effective_from,changed_by,change_reason)
        VALUES(${id},${employeeId},${rate},${overtime},${grade},${effectiveFrom}::date,${session.employeeId},${reason}) RETURNING *` as Row[];
      await audit(session.employeeId, "rate_changed", employeeId, id, reason, previous[0] || null, rows[0]);
      await recordSecurityEvent({ request: req, eventType: "technician_rate_changed", eventStatus: "success", riskLevel: "high", subject: employeeId, metadata: { rateVersionId: id, effectiveFrom } }).catch(() => undefined);
      return send(res, 201, { rate: rows[0] });
    }

    if (action === "save_plan") {
      if (!isAdmin(session)) return send(res, 403, { error: { code: "TECHNICIAN_COMPENSATION_ADMIN_REQUIRED", message: "Administrator permission is required." } });
      const plan = input.plan;
      const reason = String(input.reason || "").trim();
      if (!plan || typeof plan !== "object" || !plan.id || !plan.name || !Array.isArray(plan.metrics) || !Array.isArray(plan.incentiveBands) || reason.length < 5) {
        return send(res, 400, { error: { code: "INVALID_COMPENSATION_PLAN", message: "A complete compensation plan and change reason are required." } });
      }
      const prior = await sql()`SELECT * FROM technician_compensation_plans WHERE id=${String(plan.id)} ORDER BY version DESC LIMIT 1` as Row[];
      const version = Number(prior[0]?.version || 0) + 1;
      const effectiveFrom = String(plan.effectiveFrom || new Date().toISOString().slice(0,10));
      if (prior[0]) await sql()`UPDATE technician_compensation_plans SET effective_to=${effectiveFrom}::date WHERE id=${String(plan.id)} AND version=${Number(prior[0].version)} AND effective_to IS NULL`;
      const rows = await sql()`INSERT INTO technician_compensation_plans(id,version,name,effective_from,currency,overtime_multiplier,max_incentive_percent,plan_json,created_by)
        VALUES(${String(plan.id)},${version},${String(plan.name)},${effectiveFrom}::date,${String(plan.currency || "JMD")},${Number(plan.overtimeMultiplier || 1.5)},${Number(plan.maxIncentivePercent || 15)},${JSON.stringify({ ...plan, version })}::jsonb,${session.employeeId}) RETURNING *` as Row[];
      await audit(session.employeeId, "plan_changed", null, `${plan.id}:${version}`, reason, prior[0] || null, rows[0]);
      return send(res, 201, { plan: rows[0] });
    }

    if (action === "create_period") {
      if (!canReview(session)) return send(res, 403, { error: { code: "TECHNICIAN_COMPENSATION_REVIEW_REQUIRED", message: "Supervisor or administrator permission is required." } });
      const employeeId = String(input.employeeId || "").trim();
      const periodRef = String(input.periodRef || "").slice(0,10);
      const snapshot = input.snapshot as TechnicianPeriodInput | undefined;
      if (!employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(periodRef) || !snapshot || String(snapshot.employeeId || "") !== employeeId) {
        return send(res, 400, { error: { code: "INVALID_PERIOD_SNAPSHOT", message: "Employee, pay-period date, and a matching verified metric snapshot are required." } });
      }
      const bounds = resolveTechnicianPayPeriod(periodRef);
      const planRow = await activePlan(bounds.start);
      if (!planRow) return send(res, 409, { error: { code: "COMPENSATION_PLAN_REQUIRED", message: "No active technician compensation plan covers this pay period." } });
      const rateRow = await activeRate(employeeId, bounds.start);
      if (!rateRow) return send(res, 409, { error: { code: "TECHNICIAN_RATE_REQUIRED", message: "No active technician rate covers this pay period." } });
      const plan = planRow.plan_json as CompensationPlan;
      const normalizedSnapshot: TechnicianPeriodInput = { ...snapshot, employeeId, baseHourlyRate: Number(rateRow.hourly_rate) };
      const result = calculateTechnicianCompensation(plan, normalizedSnapshot);
      const id = `tpp_${randomBytes(16).toString("hex")}`;
      const rows = await sql()`INSERT INTO technician_performance_periods(id,employee_id,period_start,period_end,status,plan_id,plan_version,rate_version_id,snapshot_json,result_json)
        VALUES(${id},${employeeId},${bounds.start}::date,${bounds.end}::date,'review',${String(planRow.id)},${Number(planRow.version)},${String(rateRow.id)},${JSON.stringify(normalizedSnapshot)}::jsonb,${JSON.stringify(result)}::jsonb)
        ON CONFLICT(employee_id,period_start,period_end) DO UPDATE SET snapshot_json=EXCLUDED.snapshot_json,result_json=EXCLUDED.result_json,status=CASE WHEN technician_performance_periods.status IN ('finalized','adjusted') THEN technician_performance_periods.status ELSE 'review' END
        RETURNING *` as Row[];
      await audit(session.employeeId, "period_submitted", employeeId, rows[0]?.id || id, "Period snapshot created or recalculated", null, rows[0]);
      return send(res, 201, { period: rows[0] });
    }

    if (action === "approve_period") {
      if (!canReview(session)) return send(res, 403, { error: { code: "TECHNICIAN_COMPENSATION_REVIEW_REQUIRED", message: "Supervisor or administrator permission is required." } });
      const periodId = String(input.periodId || "").trim();
      const reason = String(input.reason || "").trim();
      const existing = await sql()`SELECT * FROM technician_performance_periods WHERE id=${periodId} LIMIT 1` as Row[];
      const period = existing[0];
      if (!period) return send(res, 404, { error: { code: "PERIOD_NOT_FOUND", message: "That technician pay period was not found." } });
      if (period.status === "finalized" || period.status === "adjusted") return send(res, 409, { error: { code: "PERIOD_IMMUTABLE", message: "Finalized technician periods cannot be changed." } });
      const rows = await sql()`UPDATE technician_performance_periods SET status='approved',reviewed_by=${session.employeeId},reviewed_at=NOW() WHERE id=${periodId} RETURNING *` as Row[];
      await audit(session.employeeId, "period_approved", period.employee_id, periodId, reason || "Supervisor approval", period, rows[0]);
      return send(res, 200, { period: rows[0] });
    }

    if (action === "finalize_period") {
      if (!isAdmin(session)) return send(res, 403, { error: { code: "TECHNICIAN_COMPENSATION_ADMIN_REQUIRED", message: "Administrator permission is required." } });
      const periodId = String(input.periodId || "").trim();
      const existing = await sql()`SELECT * FROM technician_performance_periods WHERE id=${periodId} LIMIT 1` as Row[];
      const period = existing[0];
      if (!period) return send(res, 404, { error: { code: "PERIOD_NOT_FOUND", message: "That technician pay period was not found." } });
      if (period.status !== "approved") return send(res, 409, { error: { code: "PERIOD_APPROVAL_REQUIRED", message: "The period must be supervisor-approved before finalization." } });
      const rows = await sql()`UPDATE technician_performance_periods SET status='finalized',finalized_by=${session.employeeId},finalized_at=NOW() WHERE id=${periodId} RETURNING *` as Row[];
      await audit(session.employeeId, "period_finalized", period.employee_id, periodId, "Payroll period finalized", period, rows[0]);
      await recordSecurityEvent({ request: req, eventType: "technician_pay_period_finalized", eventStatus: "success", riskLevel: "high", subject: period.employee_id, metadata: { periodId } }).catch(() => undefined);
      return send(res, 200, { period: rows[0] });
    }

    return send(res, 400, { error: { code: "INVALID_ACTION", message: "That compensation action is not supported." } });
  } catch (error) {
    if (error instanceof SyntaxError) return send(res, 400, { error: { code: "INVALID_JSON", message: "The request body is invalid." } });
    if (Number((error as any)?.status) === 413) return send(res, 413, { error: { code: "REQUEST_TOO_LARGE", message: "The request is too large." } });
    console.error("technician_compensation_error", { code: error instanceof Error ? error.message : "unknown" });
    return send(res, 503, { error: { code: "TECHNICIAN_COMPENSATION_UNAVAILABLE", message: "Technician compensation controls are temporarily unavailable.", retryable: true } });
  }
}
