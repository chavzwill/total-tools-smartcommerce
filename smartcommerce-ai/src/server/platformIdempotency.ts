import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";

let sqlClient: ReturnType<typeof neon> | undefined;
let schemaReady: Promise<void> | undefined;

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("IDEMPOTENCY_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql()`
        CREATE TABLE IF NOT EXISTS platform_idempotency_records (
          record_key TEXT PRIMARY KEY,
          operation TEXT NOT NULL,
          business_account_id TEXT NOT NULL,
          provider_id TEXT NOT NULL,
          key_hash TEXT NOT NULL,
          request_fingerprint TEXT NOT NULL,
          state TEXT NOT NULL CHECK (state IN ('processing','completed')),
          response_status INTEGER,
          response_body TEXT,
          response_content_type TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMPTZ NOT NULL
        )
      `;
      await sql()`CREATE INDEX IF NOT EXISTS platform_idempotency_expiry_idx ON platform_idempotency_records (expires_at)`;
    })();
  }
  await schemaReady;
}

function errorResponse(status: number, code: string, message: string, retryAfter?: number) {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (retryAfter) headers.set("Retry-After", String(retryAfter));
  return new Response(JSON.stringify({ success: false, error: { code, message } }), { status, headers });
}

export async function executeIdempotentPlatformWrite(input: {
  request: Request;
  operation: string;
  execute: () => Promise<Response>;
  keyHeader?: string;
  ttlHours?: number;
}) {
  await ensureSchema();

  const businessAccountId = input.request.headers.get("x-business-account-id") || "";
  const providerId = input.request.headers.get("x-provider-id") || "";
  const keyHeader = input.keyHeader || "idempotency-key";
  const suppliedKey = (input.request.headers.get(keyHeader) || "").trim();
  if (!suppliedKey || suppliedKey.length < 12 || suppliedKey.length > 200) {
    return errorResponse(400, "IDEMPOTENCY_KEY_REQUIRED", `A valid ${keyHeader} header is required for this operation.`);
  }

  const rawBody = await input.request.clone().text();
  const requestFingerprint = hash(`${input.request.method}:${new URL(input.request.url).pathname}:${rawBody}`);
  const keyHash = hash(suppliedKey);
  const recordKey = hash(`${businessAccountId}:${providerId}:${input.operation}:${keyHash}`);
  const expiresAt = new Date(Date.now() + Math.max(1, Math.min(168, input.ttlHours || 24)) * 60 * 60 * 1000).toISOString();

  const inserted = await sql()`
    INSERT INTO platform_idempotency_records (
      record_key, operation, business_account_id, provider_id, key_hash,
      request_fingerprint, state, expires_at
    ) VALUES (
      ${recordKey}, ${input.operation}, ${businessAccountId}, ${providerId}, ${keyHash},
      ${requestFingerprint}, 'processing', ${expiresAt}
    )
    ON CONFLICT (record_key) DO NOTHING
    RETURNING record_key
  ` as Array<{ record_key: string }>;

  if (!inserted[0]) {
    const rows = await sql()`
      SELECT request_fingerprint, state, response_status, response_body, response_content_type, expires_at
      FROM platform_idempotency_records
      WHERE record_key = ${recordKey}
      LIMIT 1
    ` as Array<{
      request_fingerprint: string;
      state: string;
      response_status: number | null;
      response_body: string | null;
      response_content_type: string | null;
      expires_at: string | Date;
    }>;
    const existing = rows[0];
    if (!existing || new Date(existing.expires_at).getTime() <= Date.now()) {
      await sql()`DELETE FROM platform_idempotency_records WHERE record_key = ${recordKey}`;
      return executeIdempotentPlatformWrite(input);
    }
    if (existing.request_fingerprint !== requestFingerprint) {
      return errorResponse(409, "IDEMPOTENCY_KEY_REUSED", "That idempotency key was already used for a different request.");
    }
    if (existing.state === "completed" && existing.response_status !== null) {
      return new Response(existing.response_body || "", {
        status: existing.response_status,
        headers: {
          "Content-Type": existing.response_content_type || "application/json",
          "Cache-Control": "no-store",
          "X-Idempotency-Replayed": "true",
        },
      });
    }
    return errorResponse(409, "IDEMPOTENCY_REQUEST_IN_PROGRESS", "An identical request with this idempotency key is already processing.", 2);
  }

  try {
    const response = await input.execute();
    const body = await response.clone().text();
    if (response.status < 500) {
      await sql()`
        UPDATE platform_idempotency_records
        SET state = 'completed', response_status = ${response.status}, response_body = ${body},
            response_content_type = ${response.headers.get("content-type") || "application/json"}, updated_at = NOW()
        WHERE record_key = ${recordKey}
      `;
    } else {
      await sql()`DELETE FROM platform_idempotency_records WHERE record_key = ${recordKey}`;
    }
    response.headers.set("X-Idempotency-Key-Accepted", "true");
    return response;
  } catch (error) {
    await sql()`DELETE FROM platform_idempotency_records WHERE record_key = ${recordKey}`;
    throw error;
  }
}
