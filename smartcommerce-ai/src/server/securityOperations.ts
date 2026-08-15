import { neon } from "@neondatabase/serverless";
import { verifySecurityEventIntegrity } from "./securityInfrastructure.js";

const DEFAULT_SECURITY_EVENT_RETENTION_DAYS = 400;
const ALERT_WEBHOOK_ENV = "SMARTCOMMERCE_SECURITY_ALERT_WEBHOOK_URL";
const ALERT_WEBHOOK_TOKEN_ENV = "SMARTCOMMERCE_SECURITY_ALERT_WEBHOOK_TOKEN";
let sqlClient: ReturnType<typeof neon> | undefined;
let monitorSchemaReady = false;

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("SECURITY_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

function retentionDays() {
  const configured = Number(process.env.SMARTCOMMERCE_SECURITY_EVENT_RETENTION_DAYS || DEFAULT_SECURITY_EVENT_RETENTION_DAYS);
  if (!Number.isFinite(configured)) return DEFAULT_SECURITY_EVENT_RETENTION_DAYS;
  return Math.max(90, Math.min(3650, Math.floor(configured)));
}

async function ensureMonitorSchema() {
  if (monitorSchemaReady) return;
  await sql()`
    CREATE TABLE IF NOT EXISTS security_monitor_state (
      monitor_id TEXT PRIMARY KEY,
      last_critical_event_at TIMESTAMPTZ,
      last_critical_event_id TEXT,
      last_integrity_code TEXT,
      last_run_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  monitorSchemaReady = true;
}

function configuredWebhook() {
  const raw = process.env[ALERT_WEBHOOK_ENV]?.trim() || "";
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function deliverAlert(payload: Record<string, unknown>) {
  const url = configuredWebhook();
  if (!url) return { configured: false, delivered: false };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const token = process.env[ALERT_WEBHOOK_TOKEN_ENV]?.trim() || "";
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "SmartCommerce-Security-Monitor/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        source: "smartcommerce-security-monitor",
        occurredAt: new Date().toISOString(),
        ...payload,
      }),
      signal: controller.signal,
    });
    return { configured: true, delivered: response.ok, status: response.status };
  } catch {
    return { configured: true, delivered: false };
  } finally {
    clearTimeout(timeout);
  }
}

async function criticalEventsSince(lastAt: string | Date | null, lastId: string | null) {
  const fallback = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
  const since = lastAt ? new Date(lastAt).toISOString() : fallback;
  return await sql()`
    SELECT id, event_type, event_status, risk_level, created_at
    FROM security_events
    WHERE risk_level = 'critical'
      AND (
        created_at > ${since}
        OR (created_at = ${since} AND id > ${lastId || ""})
      )
    ORDER BY created_at ASC, id ASC
    LIMIT 100
  ` as Array<{
    id: string;
    event_type: string;
    event_status: string;
    risk_level: string;
    created_at: string | Date;
  }>;
}

async function pruneLegacyUnchainedEvents() {
  const days = retentionDays();
  const result = await sql()`
    DELETE FROM security_events
    WHERE chain_id IS NULL
      AND created_at < NOW() - (${days}::text || ' days')::interval
    RETURNING id
  ` as Array<{ id: string }>;
  return { retentionDays: days, deletedLegacyEvents: result.length, chainedEventsAutoDeleted: false };
}

export async function runSecurityOperationsMonitor() {
  await ensureMonitorSchema();
  const stateRows = await sql()`
    SELECT last_critical_event_at, last_critical_event_id, last_integrity_code
    FROM security_monitor_state
    WHERE monitor_id = 'daily_security_monitor'
    LIMIT 1
  ` as Array<{
    last_critical_event_at: string | Date | null;
    last_critical_event_id: string | null;
    last_integrity_code: string | null;
  }>;
  const state = stateRows[0] || null;

  const integrity = await verifySecurityEventIntegrity();
  let integrityAlert = { configured: Boolean(configuredWebhook()), delivered: false, status: undefined as number | undefined };
  if (!integrity.configured || !integrity.valid) {
    integrityAlert = await deliverAlert({
      severity: "critical",
      alertType: "security_audit_integrity_failure",
      integrityCode: integrity.code,
      checkedEvents: integrity.checkedEvents,
    });
  }

  const criticalEvents = await criticalEventsSince(
    state?.last_critical_event_at || null,
    state?.last_critical_event_id || null,
  );
  let criticalAlert = { configured: Boolean(configuredWebhook()), delivered: false, status: undefined as number | undefined };
  if (criticalEvents.length > 0) {
    criticalAlert = await deliverAlert({
      severity: "critical",
      alertType: "critical_security_events",
      count: criticalEvents.length,
      events: criticalEvents.map((event) => ({
        id: event.id,
        type: event.event_type,
        status: event.event_status,
        createdAt: new Date(event.created_at).toISOString(),
      })),
    });
  }

  const newestCritical = criticalEvents[criticalEvents.length - 1];
  const retention = await pruneLegacyUnchainedEvents();

  await sql()`
    INSERT INTO security_monitor_state (
      monitor_id, last_critical_event_at, last_critical_event_id,
      last_integrity_code, last_run_at, updated_at
    ) VALUES (
      'daily_security_monitor',
      ${criticalAlert.delivered && newestCritical ? new Date(newestCritical.created_at).toISOString() : state?.last_critical_event_at || null},
      ${criticalAlert.delivered && newestCritical ? newestCritical.id : state?.last_critical_event_id || null},
      ${integrity.code}, NOW(), NOW()
    )
    ON CONFLICT (monitor_id)
    DO UPDATE SET
      last_critical_event_at = EXCLUDED.last_critical_event_at,
      last_critical_event_id = EXCLUDED.last_critical_event_id,
      last_integrity_code = EXCLUDED.last_integrity_code,
      last_run_at = NOW(),
      updated_at = NOW()
  `;

  return {
    ok: integrity.configured && integrity.valid,
    integrity: {
      configured: integrity.configured,
      valid: integrity.valid,
      code: integrity.code,
      checkedEvents: integrity.checkedEvents,
    },
    alerts: {
      webhookConfigured: Boolean(configuredWebhook()),
      integrity: integrityAlert,
      criticalEvents: criticalAlert,
      criticalEventCount: criticalEvents.length,
    },
    retention,
  };
}
