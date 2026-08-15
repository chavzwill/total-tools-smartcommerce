import { neon } from "@neondatabase/serverless";
import { createHash, createHmac, randomBytes } from "node:crypto";

let sqlClient: ReturnType<typeof neon> | undefined;
let auditIntegritySchemaReady = false;

export type SecurityRiskLevel = "info" | "low" | "medium" | "high" | "critical";

const AUDIT_CHAIN_ID = "security_events_v1";
const AUDIT_GENESIS_HASH = "GENESIS";
const AUDIT_INTEGRITY_KEY_ENV = "SMARTCOMMERCE_AUDIT_INTEGRITY_KEY";

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("SECURITY_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

function auditIntegrityKey() {
  const value = process.env[AUDIT_INTEGRITY_KEY_ENV]?.trim() || "";
  return value.length >= 32 ? value : null;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)])
    );
  }
  return value;
}

function stableJson(value: unknown) {
  return JSON.stringify(stableValue(value));
}

function securityEventChainPayload(input: {
  id: string;
  eventType: string;
  eventStatus: string;
  customerId: string | null;
  commercialAccountId: string | null;
  sessionId: string | null;
  subjectHash: string | null;
  ipHash: string | null;
  userAgentHash: string | null;
  riskLevel: SecurityRiskLevel;
  metadata: Record<string, unknown>;
  createdAt: string;
  previousHash: string;
}) {
  return stableJson({
    version: 1,
    chainId: AUDIT_CHAIN_ID,
    previousHash: input.previousHash,
    id: input.id,
    eventType: input.eventType,
    eventStatus: input.eventStatus,
    customerId: input.customerId,
    commercialAccountId: input.commercialAccountId,
    sessionId: input.sessionId,
    subjectHash: input.subjectHash,
    ipHash: input.ipHash,
    userAgentHash: input.userAgentHash,
    riskLevel: input.riskLevel,
    metadata: input.metadata,
    createdAt: input.createdAt,
  });
}

function securityEventChainHash(key: string, payload: string) {
  return createHmac("sha256", key).update(payload).digest("hex");
}

async function ensureAuditIntegritySchema() {
  if (auditIntegritySchemaReady) return;
  await sql()`ALTER TABLE security_events ADD COLUMN IF NOT EXISTS chain_id TEXT`;
  await sql()`ALTER TABLE security_events ADD COLUMN IF NOT EXISTS chain_version INTEGER`;
  await sql()`ALTER TABLE security_events ADD COLUMN IF NOT EXISTS chain_prev_hash TEXT`;
  await sql()`ALTER TABLE security_events ADD COLUMN IF NOT EXISTS chain_hash TEXT`;
  await sql()`CREATE UNIQUE INDEX IF NOT EXISTS security_events_chain_hash_uidx ON security_events(chain_hash) WHERE chain_hash IS NOT NULL`;
  await sql()`
    CREATE TABLE IF NOT EXISTS security_event_chain_state (
      chain_id TEXT PRIMARY KEY,
      head_hash TEXT NOT NULL,
      event_count BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql()`
    INSERT INTO security_event_chain_state (chain_id, head_hash, event_count, updated_at)
    VALUES (${AUDIT_CHAIN_ID}, ${AUDIT_GENESIS_HASH}, 0, NOW())
    ON CONFLICT (chain_id) DO NOTHING
  `;
  auditIntegritySchemaReady = true;
}

export function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function securityHash(value?: string | null) {
  if (!value) return null;
  return createHash("sha256").update(value.slice(0, 1024)).digest("hex");
}

export function requestIp(request: any) {
  const forwarded = firstHeader(request.headers?.["x-forwarded-for"]);
  return forwarded?.split(",")[0]?.trim() || request.socket?.remoteAddress || "unknown";
}

export function requestUserAgent(request: any) {
  return firstHeader(request.headers?.["user-agent"]) || "unknown";
}

export async function enforceDurableRateLimit(input: {
  request: any;
  action: string;
  subject: string;
  limit: number;
  windowSeconds?: number;
}) {
  const windowSeconds = Math.max(60, Math.min(86_400, Math.floor(input.windowSeconds || 900)));
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const bucketNumber = Math.floor(now / windowMs);
  const subjectHash = securityHash(input.subject) || securityHash("unknown")!;
  const bucketKey = securityHash(`${input.action}:${subjectHash}:${bucketNumber}`)!;
  const windowStart = new Date(bucketNumber * windowMs).toISOString();
  const blockedUntil = new Date((bucketNumber + 1) * windowMs).toISOString();

  const rows = await sql()`
    INSERT INTO security_rate_limits (
      bucket_key, action, subject_hash, window_start, window_seconds,
      attempt_count, blocked_until, updated_at
    ) VALUES (
      ${bucketKey}, ${input.action}, ${subjectHash}, ${windowStart}, ${windowSeconds},
      1, NULL, NOW()
    )
    ON CONFLICT (bucket_key)
    DO UPDATE SET
      attempt_count = security_rate_limits.attempt_count + 1,
      blocked_until = CASE
        WHEN security_rate_limits.attempt_count + 1 > ${input.limit}
          THEN ${blockedUntil}
        ELSE security_rate_limits.blocked_until
      END,
      updated_at = NOW()
    RETURNING attempt_count, blocked_until
  ` as Array<{ attempt_count: number; blocked_until: string | Date | null }>;

  const row = rows[0];
  if (!row) throw new Error("RATE_LIMIT_STATE_UNAVAILABLE");
  if (row.blocked_until && new Date(row.blocked_until).getTime() > Date.now()) {
    const error = new Error("RATE_LIMITED") as Error & { status?: number; retryAfterSeconds?: number };
    error.status = 429;
    error.retryAfterSeconds = Math.max(1, Math.ceil((new Date(row.blocked_until).getTime() - Date.now()) / 1000));
    throw error;
  }
}

export async function recordSecurityEvent(input: {
  request?: any;
  eventType: string;
  eventStatus: string;
  riskLevel?: SecurityRiskLevel;
  customerId?: string | null;
  commercialAccountId?: string | null;
  sessionId?: string | null;
  subject?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const id = `sev_${randomBytes(16).toString("hex")}`;
  const ipHash = input.request ? securityHash(requestIp(input.request)) : null;
  const userAgentHash = input.request ? securityHash(requestUserAgent(input.request)) : null;
  const subjectHash = securityHash(input.subject || null);
  const riskLevel = input.riskLevel || "info";
  const metadata = input.metadata || {};
  const customerId = input.customerId || null;
  const commercialAccountId = input.commercialAccountId || null;
  const sessionId = input.sessionId || null;
  const createdAt = new Date().toISOString();
  const integrityKey = auditIntegrityKey();

  if (!integrityKey) {
    await sql()`
      INSERT INTO security_events (
        id, event_type, event_status, customer_id, commercial_account_id, session_id,
        subject_hash, ip_hash, user_agent_hash, risk_level, metadata, created_at
      ) VALUES (
        ${id}, ${input.eventType}, ${input.eventStatus}, ${customerId},
        ${commercialAccountId}, ${sessionId}, ${subjectHash},
        ${ipHash}, ${userAgentHash}, ${riskLevel},
        ${JSON.stringify(metadata)}::jsonb, ${createdAt}
      )
    `;
    return;
  }

  await ensureAuditIntegritySchema();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const stateRows = await sql()`
      SELECT head_hash
      FROM security_event_chain_state
      WHERE chain_id = ${AUDIT_CHAIN_ID}
      LIMIT 1
    ` as Array<{ head_hash: string }>;
    const previousHash = stateRows[0]?.head_hash || AUDIT_GENESIS_HASH;
    const payload = securityEventChainPayload({
      id,
      eventType: input.eventType,
      eventStatus: input.eventStatus,
      customerId,
      commercialAccountId,
      sessionId,
      subjectHash,
      ipHash,
      userAgentHash,
      riskLevel,
      metadata,
      createdAt,
      previousHash,
    });
    const chainHash = securityEventChainHash(integrityKey, payload);

    const inserted = await sql()`
      WITH advanced AS (
        UPDATE security_event_chain_state
        SET head_hash = ${chainHash},
            event_count = event_count + 1,
            updated_at = NOW()
        WHERE chain_id = ${AUDIT_CHAIN_ID}
          AND head_hash = ${previousHash}
        RETURNING chain_id
      )
      INSERT INTO security_events (
        id, event_type, event_status, customer_id, commercial_account_id, session_id,
        subject_hash, ip_hash, user_agent_hash, risk_level, metadata, created_at,
        chain_id, chain_version, chain_prev_hash, chain_hash
      )
      SELECT
        ${id}, ${input.eventType}, ${input.eventStatus}, ${customerId},
        ${commercialAccountId}, ${sessionId}, ${subjectHash}, ${ipHash}, ${userAgentHash},
        ${riskLevel}, ${JSON.stringify(metadata)}::jsonb, ${createdAt},
        ${AUDIT_CHAIN_ID}, 1, ${previousHash}, ${chainHash}
      FROM advanced
      RETURNING id
    ` as Array<{ id: string }>;

    if (inserted.length === 1) return;
  }

  throw new Error("SECURITY_AUDIT_CHAIN_CONTENTION");
}

export async function verifySecurityEventIntegrity() {
  const integrityKey = auditIntegrityKey();
  if (!integrityKey) {
    return {
      configured: false,
      valid: false,
      code: "AUDIT_INTEGRITY_NOT_CONFIGURED",
      checkedEvents: 0,
    };
  }

  await ensureAuditIntegritySchema();
  const stateRows = await sql()`
    SELECT head_hash, event_count
    FROM security_event_chain_state
    WHERE chain_id = ${AUDIT_CHAIN_ID}
    LIMIT 1
  ` as Array<{ head_hash: string; event_count: string | number }>;
  const state = stateRows[0];
  if (!state) {
    return { configured: true, valid: false, code: "AUDIT_CHAIN_STATE_MISSING", checkedEvents: 0 };
  }

  const rows = await sql()`
    SELECT id, event_type, event_status, customer_id, commercial_account_id, session_id,
           subject_hash, ip_hash, user_agent_hash, risk_level, metadata, created_at,
           chain_prev_hash, chain_hash
    FROM security_events
    WHERE chain_id = ${AUDIT_CHAIN_ID}
      AND chain_version = 1
    ORDER BY created_at ASC, id ASC
  ` as Array<{
    id: string;
    event_type: string;
    event_status: string;
    customer_id: string | null;
    commercial_account_id: string | null;
    session_id: string | null;
    subject_hash: string | null;
    ip_hash: string | null;
    user_agent_hash: string | null;
    risk_level: SecurityRiskLevel;
    metadata: Record<string, unknown> | null;
    created_at: string | Date;
    chain_prev_hash: string;
    chain_hash: string;
  }>;

  const byPreviousHash = new Map<string, typeof rows>();
  for (const row of rows) {
    const bucket = byPreviousHash.get(row.chain_prev_hash) || [];
    bucket.push(row);
    byPreviousHash.set(row.chain_prev_hash, bucket);
  }

  let currentHash = AUDIT_GENESIS_HASH;
  let checkedEvents = 0;
  const visited = new Set<string>();

  while (true) {
    const nextRows = byPreviousHash.get(currentHash) || [];
    if (nextRows.length === 0) break;
    if (nextRows.length !== 1) {
      return {
        configured: true,
        valid: false,
        code: "AUDIT_CHAIN_FORK_DETECTED",
        checkedEvents,
      };
    }

    const row = nextRows[0];
    if (visited.has(row.id)) {
      return { configured: true, valid: false, code: "AUDIT_CHAIN_CYCLE_DETECTED", checkedEvents };
    }
    visited.add(row.id);

    const createdAt = new Date(row.created_at).toISOString();
    const expected = securityEventChainHash(
      integrityKey,
      securityEventChainPayload({
        id: row.id,
        eventType: row.event_type,
        eventStatus: row.event_status,
        customerId: row.customer_id,
        commercialAccountId: row.commercial_account_id,
        sessionId: row.session_id,
        subjectHash: row.subject_hash,
        ipHash: row.ip_hash,
        userAgentHash: row.user_agent_hash,
        riskLevel: row.risk_level,
        metadata: row.metadata || {},
        createdAt,
        previousHash: row.chain_prev_hash,
      })
    );

    if (expected !== row.chain_hash) {
      return {
        configured: true,
        valid: false,
        code: "AUDIT_EVENT_HASH_MISMATCH",
        checkedEvents,
        eventId: row.id,
      };
    }

    currentHash = row.chain_hash;
    checkedEvents += 1;
  }

  if (checkedEvents !== rows.length) {
    return {
      configured: true,
      valid: false,
      code: "AUDIT_CHAIN_DISCONNECTED_EVENTS",
      checkedEvents,
      totalEvents: rows.length,
    };
  }

  if (currentHash !== state.head_hash) {
    return {
      configured: true,
      valid: false,
      code: "AUDIT_CHAIN_HEAD_MISMATCH",
      checkedEvents,
    };
  }

  if (checkedEvents !== Number(state.event_count)) {
    return {
      configured: true,
      valid: false,
      code: "AUDIT_CHAIN_COUNT_MISMATCH",
      checkedEvents,
      recordedEventCount: Number(state.event_count),
    };
  }

  return {
    configured: true,
    valid: true,
    code: "AUDIT_CHAIN_VALID",
    checkedEvents,
    headHash: state.head_hash,
  };
}

export async function touchSessionSecurity(input: {
  tokenHash: string;
  authenticatedNow?: boolean;
  authLevel?: "password" | "mfa" | "passkey";
  request?: any;
}) {
  const ipHash = input.request ? securityHash(requestIp(input.request)) : null;
  if (input.authenticatedNow) {
    await sql()`
      UPDATE customer_sessions
      SET last_activity_at = NOW(),
          last_authenticated_at = NOW(),
          auth_level = ${input.authLevel || "password"},
          ip_hash = COALESCE(${ipHash}, ip_hash)
      WHERE token_hash = ${input.tokenHash}
        AND revoked_at IS NULL
    `;
    return;
  }

  await sql()`
    UPDATE customer_sessions
    SET last_activity_at = NOW(),
        ip_hash = COALESCE(${ipHash}, ip_hash)
    WHERE token_hash = ${input.tokenHash}
      AND revoked_at IS NULL
  `;
}

export async function sessionRequiresStepUp(input: {
  tokenHash: string;
  maxAuthenticationAgeSeconds?: number;
}) {
  const maxAgeSeconds = Math.max(60, Math.floor(input.maxAuthenticationAgeSeconds || 900));
  const rows = await sql()`
    SELECT auth_level, last_authenticated_at, step_up_expires_at
    FROM customer_sessions
    WHERE token_hash = ${input.tokenHash}
      AND revoked_at IS NULL
      AND expires_at > NOW()
    LIMIT 1
  ` as Array<{ auth_level: string; last_authenticated_at: string | Date | null; step_up_expires_at: string | Date | null }>;
  const row = rows[0];
  if (!row) return true;
  if (row.step_up_expires_at && new Date(row.step_up_expires_at).getTime() > Date.now()) return false;
  if (!row.last_authenticated_at) return true;
  return Date.now() - new Date(row.last_authenticated_at).getTime() > maxAgeSeconds * 1000;
}

export async function assessSensitiveActionRisk(input: {
  request: any;
  customerId: string;
  sessionId: string;
  sessionIpHash?: string | null;
}) {
  const currentIpHash = securityHash(requestIp(input.request));
  const currentUserAgentHash = securityHash(requestUserAgent(input.request));
  const networkChanged = Boolean(input.sessionIpHash && currentIpHash && input.sessionIpHash !== currentIpHash);

  const trustedAuthRows = await sql()`
    SELECT ip_hash, user_agent_hash, created_at
    FROM security_events
    WHERE customer_id = ${input.customerId}
      AND session_id = ${input.sessionId}
      AND created_at > NOW() - INTERVAL '20 minutes'
      AND (
        (event_type = 'totp_step_up_succeeded' AND event_status = 'success') OR
        (event_type = 'recovery_code_used' AND event_status = 'success') OR
        (event_type = 'totp_enabled' AND event_status = 'success') OR
        (event_type = 'passkey_step_up' AND event_status = 'success')
      )
    ORDER BY created_at DESC
    LIMIT 1
  ` as Array<{ ip_hash: string | null; user_agent_hash: string | null; created_at: string | Date }>;

  const trustedAuth = trustedAuthRows[0];
  const strongAuthBoundToRequest = Boolean(
    trustedAuth &&
    currentIpHash &&
    currentUserAgentHash &&
    trustedAuth.ip_hash === currentIpHash &&
    trustedAuth.user_agent_hash === currentUserAgentHash
  );

  const recentThreatRows = await sql()`
    SELECT created_at
    FROM security_events
    WHERE customer_id = ${input.customerId}
      AND created_at > NOW() - INTERVAL '30 minutes'
      AND risk_level IN ('high', 'critical')
      AND event_status NOT IN ('success', 'allowed', 'recorded', 'pending_manual_review')
    ORDER BY created_at DESC
    LIMIT 1
  ` as Array<{ created_at: string | Date }>;

  const recentThreat = recentThreatRows[0];
  const threatAfterStrongAuth = Boolean(
    recentThreat &&
    (!trustedAuth || new Date(recentThreat.created_at).getTime() > new Date(trustedAuth.created_at).getTime())
  );
  const requiresFreshStrongStepUp = !strongAuthBoundToRequest || threatAfterStrongAuth;

  return {
    requiresFreshStrongStepUp,
    networkChanged,
    strongAuthBoundToRequest,
    recentThreatAfterStrongAuth: threatAfterStrongAuth,
  };
}
