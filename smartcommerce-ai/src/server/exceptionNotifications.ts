import { neon } from "@neondatabase/serverless";
import { buildOmnichannelExceptions, type OmnichannelException } from "./omnichannelExceptions.js";

let sqlClient: ReturnType<typeof neon> | undefined;
let schemaReady = false;
type Row = Record<string, any>;

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("OMNICHANNEL_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

async function ensureSchema() {
  if (schemaReady) return;
  await sql()`CREATE TABLE IF NOT EXISTS omnichannel_exception_notifications (
    exception_id TEXT PRIMARY KEY,
    intake_id TEXT NOT NULL,
    category TEXT NOT NULL,
    severity TEXT NOT NULL,
    title TEXT NOT NULL,
    source_channel TEXT NOT NULL,
    item_type TEXT NOT NULL,
    resource TEXT,
    reference TEXT,
    owner_employee_id TEXT,
    state TEXT NOT NULL DEFAULT 'open',
    acknowledged_by_employee_id TEXT,
    acknowledged_at TIMESTAMPTZ,
    snoozed_until TIMESTAMPTZ,
    resolved_by_employee_id TEXT,
    resolved_at TIMESTAMPTZ,
    resolution_note TEXT,
    escalation_level INTEGER NOT NULL DEFAULT 0,
    first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_notified_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql()`CREATE INDEX IF NOT EXISTS omnichannel_exception_state_idx ON omnichannel_exception_notifications(state,severity,updated_at DESC)`;
  await sql()`CREATE INDEX IF NOT EXISTS omnichannel_exception_owner_idx ON omnichannel_exception_notifications(owner_employee_id,state,updated_at DESC)`;
  await sql()`CREATE INDEX IF NOT EXISTS omnichannel_exception_active_detected_idx ON omnichannel_exception_notifications(last_detected_at DESC) WHERE state <> 'resolved'`;
  await sql()`CREATE INDEX IF NOT EXISTS omnichannel_exception_resolved_idx ON omnichannel_exception_notifications(resolved_at DESC) WHERE state = 'resolved'`;
  await sql()`CREATE TABLE IF NOT EXISTS omnichannel_exception_notification_history (
    id BIGSERIAL PRIMARY KEY,
    exception_id TEXT NOT NULL,
    action TEXT NOT NULL,
    employee_id TEXT,
    note TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql()`CREATE INDEX IF NOT EXISTS omnichannel_exception_history_idx ON omnichannel_exception_notification_history(exception_id,created_at DESC)`;
  schemaReady = true;
}

function escalationFor(exception: OmnichannelException, current: Row | undefined) {
  const age = Number(exception.ageHours || 0);
  let level = 0;
  if (exception.severity === "critical") level = age >= 24 ? 3 : age >= 8 ? 2 : 1;
  else if (exception.severity === "high") level = age >= 72 ? 3 : age >= 24 ? 2 : 1;
  else if (exception.severity === "medium") level = age >= 168 ? 2 : age >= 72 ? 1 : 0;
  const acknowledged = Boolean(current?.acknowledged_at);
  if (acknowledged && level > 0) level -= 1;
  return Math.max(0, level);
}

async function history(exceptionId: string, action: string, employeeId?: string | null, note?: string | null, metadata: Row = {}) {
  await sql()`INSERT INTO omnichannel_exception_notification_history(exception_id,action,employee_id,note,metadata) VALUES(${exceptionId},${action},${employeeId || null},${note || null},${JSON.stringify(metadata)}::jsonb)`;
}

export async function synchronizeExceptionNotifications(input: { refresh?: boolean; limit?: number } = {}) {
  await ensureSchema();
  const report = await buildOmnichannelExceptions(input);
  // Only active notifications can participate in automatic clear/reopen/escalation.
  // Historical resolved records remain queryable through the final bounded result
  // set but are not loaded wholesale on every synchronization pass.
  const existing = await sql()`SELECT * FROM omnichannel_exception_notifications WHERE state <> 'resolved'` as Row[];
  const byId = new Map(existing.map((row) => [String(row.exception_id), row]));
  const activeIds = new Set<string>();

  for (const exception of report.exceptions) {
    activeIds.add(exception.id);
    const previous = byId.get(exception.id);
    const escalation = escalationFor(exception, previous);
    const rows = await sql()`INSERT INTO omnichannel_exception_notifications(
      exception_id,intake_id,category,severity,title,source_channel,item_type,resource,reference,escalation_level,last_detected_at,last_notified_at
    ) VALUES(
      ${exception.id},${exception.intakeId},${exception.category},${exception.severity},${exception.title},${exception.sourceChannel},${exception.itemType},${exception.resource || null},${exception.reference || null},${escalation},NOW(),CASE WHEN ${exception.severity} IN ('critical','high') THEN NOW() ELSE NULL END
    ) ON CONFLICT(exception_id) DO UPDATE SET
      severity=EXCLUDED.severity,title=EXCLUDED.title,resource=EXCLUDED.resource,reference=EXCLUDED.reference,
      escalation_level=${escalation},last_detected_at=NOW(),updated_at=NOW(),
      state=CASE WHEN omnichannel_exception_notifications.state='resolved' THEN 'open' ELSE omnichannel_exception_notifications.state END,
      resolved_by_employee_id=CASE WHEN omnichannel_exception_notifications.state='resolved' THEN NULL ELSE omnichannel_exception_notifications.resolved_by_employee_id END,
      resolved_at=CASE WHEN omnichannel_exception_notifications.state='resolved' THEN NULL ELSE omnichannel_exception_notifications.resolved_at END,
      resolution_note=CASE WHEN omnichannel_exception_notifications.state='resolved' THEN NULL ELSE omnichannel_exception_notifications.resolution_note END
    RETURNING *` as Row[];
    if (!previous) await history(exception.id, "detected", null, exception.reason, { severity: exception.severity, escalationLevel: escalation });
    else if (Number(previous.escalation_level || 0) < escalation) await history(exception.id, "escalated", null, `Escalated to level ${escalation}.`, { previousLevel: Number(previous.escalation_level || 0), escalationLevel: escalation });
  }

  for (const row of existing) {
    const id = String(row.exception_id);
    if (activeIds.has(id)) continue;
    await sql()`UPDATE omnichannel_exception_notifications SET state='resolved',resolved_at=NOW(),resolution_note=COALESCE(resolution_note,'Exception cleared automatically after authoritative evidence no longer met the rule.'),updated_at=NOW() WHERE exception_id=${id} AND state <> 'resolved'`;
    await history(id, "auto_resolved", null, "Exception cleared automatically after authoritative evidence no longer met the rule.");
  }

  const records = await sql()`SELECT * FROM omnichannel_exception_notifications WHERE state <> 'resolved' OR resolved_at > NOW() - INTERVAL '30 days' ORDER BY CASE severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC, escalation_level DESC, updated_at DESC LIMIT ${Math.max(1, Math.min(500, Number(input.limit || 200)))}` as Row[];
  const exceptionById = new Map(report.exceptions.map((item) => [item.id, item]));
  return records.map((row) => ({ ...row, exception: exceptionById.get(String(row.exception_id)) || null }));
}

export async function updateExceptionNotification(input: { exceptionId: string; action: "claim" | "acknowledge" | "snooze" | "resolve" | "reopen"; employeeId: string; note?: string | null; snoozeHours?: number }) {
  await ensureSchema();
  const rows = await sql()`SELECT * FROM omnichannel_exception_notifications WHERE exception_id=${input.exceptionId} LIMIT 1` as Row[];
  const current = rows[0];
  if (!current) throw new Error("EXCEPTION_NOTIFICATION_NOT_FOUND");
  const note = String(input.note || "").trim().slice(0, 1000) || null;
  if (input.action === "claim") {
    const updated = await sql()`UPDATE omnichannel_exception_notifications SET owner_employee_id=${input.employeeId},state=CASE WHEN state='open' THEN 'claimed' ELSE state END,updated_at=NOW() WHERE exception_id=${input.exceptionId} RETURNING *` as Row[];
    await history(input.exceptionId, "claimed", input.employeeId, note);
    return updated[0];
  }
  if (input.action === "acknowledge") {
    const updated = await sql()`UPDATE omnichannel_exception_notifications SET owner_employee_id=COALESCE(owner_employee_id,${input.employeeId}),state='acknowledged',acknowledged_by_employee_id=${input.employeeId},acknowledged_at=NOW(),snoozed_until=NULL,updated_at=NOW() WHERE exception_id=${input.exceptionId} AND state <> 'resolved' RETURNING *` as Row[];
    if (!updated[0]) throw new Error("EXCEPTION_NOTIFICATION_STATE_CONFLICT");
    await history(input.exceptionId, "acknowledged", input.employeeId, note);
    return updated[0];
  }
  if (input.action === "snooze") {
    const hours = Math.max(1, Math.min(168, Math.trunc(Number(input.snoozeHours || 4))));
    const updated = await sql()`UPDATE omnichannel_exception_notifications SET owner_employee_id=COALESCE(owner_employee_id,${input.employeeId}),state='snoozed',snoozed_until=NOW()+(${hours}::text || ' hours')::interval,updated_at=NOW() WHERE exception_id=${input.exceptionId} AND state <> 'resolved' RETURNING *` as Row[];
    if (!updated[0]) throw new Error("EXCEPTION_NOTIFICATION_STATE_CONFLICT");
    await history(input.exceptionId, "snoozed", input.employeeId, note, { hours });
    return updated[0];
  }
  if (input.action === "resolve") {
    if (!note) throw new Error("EXCEPTION_RESOLUTION_NOTE_REQUIRED");
    const updated = await sql()`UPDATE omnichannel_exception_notifications SET owner_employee_id=COALESCE(owner_employee_id,${input.employeeId}),state='resolved',resolved_by_employee_id=${input.employeeId},resolved_at=NOW(),resolution_note=${note},snoozed_until=NULL,updated_at=NOW() WHERE exception_id=${input.exceptionId} RETURNING *` as Row[];
    await history(input.exceptionId, "resolved", input.employeeId, note);
    return updated[0];
  }
  const updated = await sql()`UPDATE omnichannel_exception_notifications SET state='open',resolved_by_employee_id=NULL,resolved_at=NULL,resolution_note=NULL,snoozed_until=NULL,updated_at=NOW() WHERE exception_id=${input.exceptionId} RETURNING *` as Row[];
  await history(input.exceptionId, "reopened", input.employeeId, note);
  return updated[0];
}

export async function listExceptionNotificationHistory(exceptionId: string) {
  await ensureSchema();
  return await sql()`SELECT * FROM omnichannel_exception_notification_history WHERE exception_id=${exceptionId} ORDER BY created_at DESC LIMIT 200` as Row[];
}
