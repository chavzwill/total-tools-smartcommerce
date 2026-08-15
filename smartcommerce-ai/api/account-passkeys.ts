import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import {
  enforceDurableRateLimit,
  firstHeader,
  recordSecurityEvent,
  requestIp,
  securityHash,
  sessionRequiresStepUp,
  touchSessionSecurity,
} from "../src/server/securityInfrastructure";

const COOKIE_NAME = "sc_session";
const MAX_BODY_BYTES = 64_000;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const PASSKEY_STEP_UP_MS = 10 * 60 * 1000;
let sqlClient: ReturnType<typeof neon> | undefined;

type SessionCustomer = {
  session_id: string;
  customer_id: string;
  email: string;
  full_name: string;
};

type PasskeyRow = {
  id: string;
  credential_id: string;
  public_key: string;
  sign_count: number | string | null;
  transports: unknown;
  user_handle: string | null;
  device_type: string | null;
  backed_up: boolean | null;
  rp_id: string | null;
};

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("SECURITY_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function parseCookie(header?: string) {
  const result: Record<string, string> = {};
  for (const part of (header || "").split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try { result[key] = decodeURIComponent(value); } catch { result[key] = value; }
  }
  return result;
}

function sameOrigin(request: any) {
  const origin = firstHeader(request.headers?.origin);
  if (!origin) return true;
  const host = firstHeader(request.headers?.host);
  if (!host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

function relyingParty() {
  const raw = String(process.env.SMARTCOMMERCE_APP_URL || "").trim();
  if (!raw) throw new Error("PASSKEY_ORIGIN_NOT_CONFIGURED");
  const parsed = new URL(raw);
  if (parsed.protocol !== "https:") throw new Error("PASSKEY_ORIGIN_NOT_CONFIGURED");
  return {
    rpName: "SmartCommerce",
    rpID: parsed.hostname,
    origin: `${parsed.protocol}//${parsed.host}`,
  };
}

async function readJsonBody<T>(request: AsyncIterable<unknown>): Promise<T> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    if (chunk === undefined || chunk === null) continue;
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    total += buffer.length;
    if (total > MAX_BODY_BYTES) {
      const error = new Error("BODY_TOO_LARGE") as Error & { status?: number };
      error.status = 413;
      throw error;
    }
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as T;
}

async function currentSession(token?: string): Promise<SessionCustomer | undefined> {
  if (!token) return undefined;
  const rows = await sql()`
    SELECT s.id AS session_id, c.id AS customer_id, c.email, c.full_name
    FROM customer_sessions s
    JOIN customer_accounts c ON c.id = s.customer_id
    WHERE s.token_hash = ${hashToken(token)}
      AND s.revoked_at IS NULL
      AND s.expires_at > NOW()
    LIMIT 1
  ` as SessionCustomer[];
  return rows[0];
}

function transportsFromDb(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch { return []; }
  }
  return [];
}

async function listPasskeys(customerId: string) {
  return await sql()`
    SELECT id, credential_id, public_key, sign_count, transports, user_handle, device_type, backed_up, rp_id
    FROM customer_authenticators
    WHERE customer_id = ${customerId}
      AND authenticator_type = 'passkey'
      AND status = 'active'
      AND credential_id IS NOT NULL
      AND public_key IS NOT NULL
    ORDER BY created_at DESC
  ` as PasskeyRow[];
}

async function replaceChallenge(input: {
  customerId: string;
  sessionId: string;
  purpose: string;
  challengeType: string;
  challenge: string;
}) {
  const id = `wch_${randomBytes(16).toString("hex")}`;
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();
  await sql()`
    UPDATE auth_step_up_challenges
    SET status = 'cancelled'
    WHERE customer_id = ${input.customerId}
      AND session_id = ${input.sessionId}
      AND purpose = ${input.purpose}
      AND status = 'pending'
  `;
  await sql()`
    INSERT INTO auth_step_up_challenges
      (id, customer_id, session_id, purpose, challenge_hash, status, expires_at, created_at, challenge_value, challenge_type)
    VALUES
      (${id}, ${input.customerId}, ${input.sessionId}, ${input.purpose}, ${securityHash(input.challenge)},
       'pending', ${expiresAt}, NOW(), ${input.challenge}, ${input.challengeType})
  `;
  return id;
}

async function consumeChallenge(input: {
  customerId: string;
  sessionId: string;
  purpose: string;
  challengeType: string;
}) {
  const rows = await sql()`
    UPDATE auth_step_up_challenges
    SET status = 'verified', verified_at = NOW()
    WHERE id = (
      SELECT id
      FROM auth_step_up_challenges
      WHERE customer_id = ${input.customerId}
        AND session_id = ${input.sessionId}
        AND purpose = ${input.purpose}
        AND challenge_type = ${input.challengeType}
        AND status = 'pending'
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING challenge_value
  ` as Array<{ challenge_value: string }>;
  return rows[0]?.challenge_value;
}

async function revokeConsumedChallenge(input: { customerId: string; sessionId: string; purpose: string; challengeType: string }) {
  await sql()`
    UPDATE auth_step_up_challenges
    SET status = 'cancelled'
    WHERE customer_id = ${input.customerId}
      AND session_id = ${input.sessionId}
      AND purpose = ${input.purpose}
      AND challenge_type = ${input.challengeType}
      AND status = 'pending'
  `;
}

function send(response: any, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");
  response.end(JSON.stringify(payload));
}

export default async function handler(request: any, response: any) {
  if (String(request.method || "").toUpperCase() !== "POST") {
    response.setHeader("Allow", "POST");
    return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "POST is required." } });
  }
  if (!sameOrigin(request)) {
    return send(response, 403, { error: { code: "ORIGIN_REJECTED", message: "This request was rejected." } });
  }

  const rawSessionToken = parseCookie(firstHeader(request.headers?.cookie))[COOKIE_NAME];
  const tokenHash = rawSessionToken ? hashToken(rawSessionToken) : "";

  try {
    const session = await currentSession(rawSessionToken);
    if (!session) return send(response, 401, { error: { code: "AUTH_REQUIRED", message: "Sign in to manage passkeys." } });

    await touchSessionSecurity({ tokenHash, request });
    const input = await readJsonBody<{ action?: string; response?: RegistrationResponseJSON | AuthenticationResponseJSON; label?: string }>(request);
    const action = String(input.action || "");
    const { rpName, rpID, origin } = relyingParty();

    await enforceDurableRateLimit({ request, action: `passkey_${action || "unknown"}_ip`, subject: requestIp(request), limit: 20, windowSeconds: 900 });
    await enforceDurableRateLimit({ request, action: `passkey_${action || "unknown"}_account`, subject: session.customer_id, limit: 20, windowSeconds: 900 });

    if (action === "list") {
      const passkeys = await listPasskeys(session.customer_id);
      return send(response, 200, {
        passkeys: passkeys.map((row) => ({
          id: row.id,
          label: row.id,
          deviceType: row.device_type,
          backedUp: row.backed_up,
          transports: transportsFromDb(row.transports),
        })),
      });
    }

    if (action === "registration_options") {
      if (await sessionRequiresStepUp({ tokenHash, maxAuthenticationAgeSeconds: 600 })) {
        return send(response, 403, { error: { code: "STEP_UP_REQUIRED", message: "Confirm your password before adding a passkey." } });
      }
      const existing = await listPasskeys(session.customer_id);
      const options = await generateRegistrationOptions({
        rpName,
        rpID,
        userName: session.email,
        userDisplayName: session.full_name,
        attestationType: "none",
        excludeCredentials: existing.map((passkey) => ({
          id: passkey.credential_id,
          transports: transportsFromDb(passkey.transports) as any,
        })),
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "required",
        },
      });
      await replaceChallenge({
        customerId: session.customer_id,
        sessionId: session.session_id,
        purpose: "passkey_registration",
        challengeType: "webauthn_registration",
        challenge: options.challenge,
      });
      return send(response, 200, { options });
    }

    if (action === "verify_registration") {
      if (await sessionRequiresStepUp({ tokenHash, maxAuthenticationAgeSeconds: 600 })) {
        return send(response, 403, { error: { code: "STEP_UP_REQUIRED", message: "Confirm your password before adding a passkey." } });
      }
      const credentialResponse = input.response as RegistrationResponseJSON | undefined;
      if (!credentialResponse) return send(response, 400, { error: { code: "PASSKEY_RESPONSE_REQUIRED", message: "Passkey registration response is required." } });
      const expectedChallenge = await consumeChallenge({
        customerId: session.customer_id,
        sessionId: session.session_id,
        purpose: "passkey_registration",
        challengeType: "webauthn_registration",
      });
      if (!expectedChallenge) return send(response, 400, { error: { code: "PASSKEY_CHALLENGE_EXPIRED", message: "Passkey setup expired. Try again." } });

      let verification;
      try {
        verification = await verifyRegistrationResponse({
          response: credentialResponse,
          expectedChallenge,
          expectedOrigin: origin,
          expectedRPID: rpID,
          requireUserVerification: true,
        });
      } catch {
        await recordSecurityEvent({ request, eventType: "passkey_registration", eventStatus: "failed", riskLevel: "medium", customerId: session.customer_id });
        return send(response, 400, { error: { code: "PASSKEY_REGISTRATION_FAILED", message: "The passkey could not be verified." } });
      }

      if (!verification.verified || !verification.registrationInfo) {
        return send(response, 400, { error: { code: "PASSKEY_REGISTRATION_FAILED", message: "The passkey could not be verified." } });
      }

      const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
      const authenticatorId = `auth_${randomBytes(16).toString("hex")}`;
      const label = String(input.label || "Passkey").trim().slice(0, 80) || "Passkey";
      const publicKey = Buffer.from(credential.publicKey).toString("base64url");
      await sql()`
        INSERT INTO customer_authenticators
          (id, customer_id, authenticator_type, status, label, credential_id, public_key, sign_count,
           transports, created_at, device_type, backed_up, rp_id, user_handle)
        VALUES
          (${authenticatorId}, ${session.customer_id}, 'passkey', 'active', ${label}, ${credential.id}, ${publicKey},
           ${credential.counter}, ${JSON.stringify(credential.transports || [])}::jsonb, NOW(), ${credentialDeviceType},
           ${credentialBackedUp}, ${rpID}, ${null})
      `;
      await recordSecurityEvent({ request, eventType: "passkey_registration", eventStatus: "success", riskLevel: "low", customerId: session.customer_id, metadata: { authenticatorId, deviceType: credentialDeviceType, backedUp: credentialBackedUp } });
      return send(response, 201, { verified: true, authenticatorId });
    }

    if (action === "authentication_options") {
      const passkeys = await listPasskeys(session.customer_id);
      if (!passkeys.length) return send(response, 404, { error: { code: "NO_PASSKEY", message: "No passkey is registered for this account." } });
      const options = await generateAuthenticationOptions({
        rpID,
        allowCredentials: passkeys.map((passkey) => ({
          id: passkey.credential_id,
          transports: transportsFromDb(passkey.transports) as any,
        })),
        userVerification: "required",
      });
      await replaceChallenge({
        customerId: session.customer_id,
        sessionId: session.session_id,
        purpose: "passkey_step_up",
        challengeType: "webauthn_authentication",
        challenge: options.challenge,
      });
      return send(response, 200, { options });
    }

    if (action === "verify_authentication") {
      const credentialResponse = input.response as AuthenticationResponseJSON | undefined;
      if (!credentialResponse?.id) return send(response, 400, { error: { code: "PASSKEY_RESPONSE_REQUIRED", message: "Passkey authentication response is required." } });
      const passkeys = await listPasskeys(session.customer_id);
      const passkey = passkeys.find((candidate) => candidate.credential_id === credentialResponse.id);
      if (!passkey) {
        await recordSecurityEvent({ request, eventType: "passkey_step_up", eventStatus: "unknown_credential", riskLevel: "high", customerId: session.customer_id });
        return send(response, 400, { error: { code: "PASSKEY_AUTHENTICATION_FAILED", message: "The passkey could not be verified." } });
      }
      const expectedChallenge = await consumeChallenge({
        customerId: session.customer_id,
        sessionId: session.session_id,
        purpose: "passkey_step_up",
        challengeType: "webauthn_authentication",
      });
      if (!expectedChallenge) return send(response, 400, { error: { code: "PASSKEY_CHALLENGE_EXPIRED", message: "Passkey authentication expired. Try again." } });

      let verification;
      try {
        verification = await verifyAuthenticationResponse({
          response: credentialResponse,
          expectedChallenge,
          expectedOrigin: origin,
          expectedRPID: rpID,
          credential: {
            id: passkey.credential_id,
            publicKey: Uint8Array.from(Buffer.from(passkey.public_key, "base64url")),
            counter: Number(passkey.sign_count || 0),
            transports: transportsFromDb(passkey.transports) as any,
          },
          requireUserVerification: true,
        });
      } catch {
        await recordSecurityEvent({ request, eventType: "passkey_step_up", eventStatus: "failed", riskLevel: "high", customerId: session.customer_id, metadata: { authenticatorId: passkey.id } });
        return send(response, 400, { error: { code: "PASSKEY_AUTHENTICATION_FAILED", message: "The passkey could not be verified." } });
      }

      if (!verification.verified) return send(response, 400, { error: { code: "PASSKEY_AUTHENTICATION_FAILED", message: "The passkey could not be verified." } });
      const stepUpExpiresAt = new Date(Date.now() + PASSKEY_STEP_UP_MS).toISOString();
      await sql()`
        UPDATE customer_authenticators
        SET sign_count = ${verification.authenticationInfo.newCounter}, last_used_at = NOW()
        WHERE id = ${passkey.id}
      `;
      await sql()`
        UPDATE customer_sessions
        SET auth_level = 'passkey', last_authenticated_at = NOW(), last_activity_at = NOW(), step_up_expires_at = ${stepUpExpiresAt}
        WHERE id = ${session.session_id}
          AND revoked_at IS NULL
      `;
      await recordSecurityEvent({ request, eventType: "passkey_step_up", eventStatus: "success", riskLevel: "low", customerId: session.customer_id, sessionId: session.session_id, metadata: { authenticatorId: passkey.id, stepUpExpiresAt } });
      return send(response, 200, { verified: true, stepUpExpiresAt });
    }

    await revokeConsumedChallenge({ customerId: session.customer_id, sessionId: session.session_id, purpose: "passkey_step_up", challengeType: "webauthn_authentication" });
    return send(response, 400, { error: { code: "INVALID_ACTION", message: "That passkey action is not supported." } });
  } catch (error) {
    if (error instanceof SyntaxError) return send(response, 400, { error: { code: "INVALID_JSON", message: "The request body is invalid." } });
    const status = Number((error as { status?: number })?.status || 500);
    if (status === 429) {
      const retryAfter = Number((error as { retryAfterSeconds?: number })?.retryAfterSeconds || 900);
      response.setHeader("Retry-After", String(retryAfter));
      return send(response, 429, { error: { code: "RATE_LIMITED", message: "Too many security attempts. Try again later." } });
    }
    if (status === 413) return send(response, 413, { error: { code: "REQUEST_TOO_LARGE", message: "The request is too large." } });
    console.error("passkey_security_error", { code: error instanceof Error ? error.message : "unknown" });
    return send(response, 503, { error: { code: "PASSKEY_SERVICE_UNAVAILABLE", message: "Passkey services are temporarily unavailable.", retryable: true } });
  }
}
