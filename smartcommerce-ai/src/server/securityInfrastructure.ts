import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";

let sqlClient: ReturnType<typeof neon> | undefined;

export type SecurityRiskLevel = "info" | "low" | "medium" | "high" | "critical";

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("SECURITY_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
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

  await sql()`
    INSERT INTO security_events (
      id, event_type, event_status, customer_id, commercial_account_id, session_id,
      subject_hash, ip_hash, user_agent_hash, risk_level, metadata, created_at
    ) VALUES (
      ${id}, ${input.eventType}, ${input.eventStatus}, ${input.customerId || null},
      ${input.commercialAccountId || null}, ${input.sessionId || null}, ${subjectHash},
      ${ipHash}, ${userAgentHash}, ${input.riskLevel || "info"},
      ${JSON.stringify(input.metadata || {})}::jsonb, NOW()
    )
  `;
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
