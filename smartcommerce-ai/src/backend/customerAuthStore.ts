import { createClient, type Client } from "@libsql/client";
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export type CustomerAccount = {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CustomerSession = {
  token: string;
  expiresAt: string;
  customer: CustomerAccount;
};

let clientPromise: Promise<Client> | undefined;
let schemaPromise: Promise<void> | undefined;

function getDatabaseConfig() {
  const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.TURSO_DATABASE_URL;
  const authToken = process.env.SMARTCOMMERCE_DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN;
  if (!url) throw new Error("SmartCommerce customer database is not configured.");
  return { url, authToken };
}

async function getClient() {
  if (!clientPromise) {
    clientPromise = Promise.resolve(createClient(getDatabaseConfig()));
  }
  return clientPromise;
}

async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const db = await getClient();
      await db.batch([
        `CREATE TABLE IF NOT EXISTS customer_accounts (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          full_name TEXT NOT NULL,
          phone TEXT,
          email_verified INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS customer_sessions (
          id TEXT PRIMARY KEY,
          customer_id TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          revoked_at TEXT,
          user_agent_hash TEXT,
          FOREIGN KEY(customer_id) REFERENCES customer_accounts(id)
        )`,
        `CREATE INDEX IF NOT EXISTS idx_customer_sessions_customer ON customer_sessions(customer_id)`,
        `CREATE INDEX IF NOT EXISTS idx_customer_sessions_token ON customer_sessions(token_hash)`,
      ], "write");
    })();
  }
  return schemaPromise;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function accountFromRow(row: Record<string, unknown>): CustomerAccount {
  return {
    id: String(row.id),
    email: String(row.email),
    fullName: String(row.full_name),
    phone: row.phone ? String(row.phone) : undefined,
    emailVerified: Number(row.email_verified) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

async function verifyPassword(password: string, stored: string) {
  const [algorithm, saltEncoded, hashEncoded] = stored.split("$");
  if (algorithm !== "scrypt" || !saltEncoded || !hashEncoded) return false;
  const salt = Buffer.from(saltEncoded, "base64url");
  const expected = Buffer.from(hashEncoded, "base64url");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function userAgentHash(userAgent?: string) {
  if (!userAgent) return null;
  return createHash("sha256").update(userAgent.slice(0, 512)).digest("hex");
}

export async function createCustomerAccount(input: {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
}) {
  await ensureSchema();
  const db = await getClient();
  const email = normalizeEmail(input.email);
  const existing = await db.execute({ sql: "SELECT id FROM customer_accounts WHERE email = ? LIMIT 1", args: [email] });
  if (existing.rows.length) return { created: false as const };

  const id = `cus_${randomBytes(16).toString("hex")}`;
  const now = new Date().toISOString();
  const passwordHash = await hashPassword(input.password);
  await db.execute({
    sql: `INSERT INTO customer_accounts (id, email, password_hash, full_name, phone, email_verified, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    args: [id, email, passwordHash, input.fullName.trim(), input.phone?.trim() || null, now, now],
  });
  return {
    created: true as const,
    customer: {
      id,
      email,
      fullName: input.fullName.trim(),
      phone: input.phone?.trim() || undefined,
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    } satisfies CustomerAccount,
  };
}

export async function authenticateCustomer(emailInput: string, password: string) {
  await ensureSchema();
  const db = await getClient();
  const email = normalizeEmail(emailInput);
  const result = await db.execute({
    sql: "SELECT id, email, password_hash, full_name, phone, email_verified, created_at, updated_at FROM customer_accounts WHERE email = ? LIMIT 1",
    args: [email],
  });
  if (!result.rows.length) return undefined;
  const row = result.rows[0] as unknown as Record<string, unknown>;
  const valid = await verifyPassword(password, String(row.password_hash));
  return valid ? accountFromRow(row) : undefined;
}

export async function createCustomerSession(customer: CustomerAccount, userAgent?: string): Promise<CustomerSession> {
  await ensureSchema();
  const db = await getClient();
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  await db.execute({
    sql: `INSERT INTO customer_sessions (id, customer_id, token_hash, created_at, expires_at, revoked_at, user_agent_hash)
          VALUES (?, ?, ?, ?, ?, NULL, ?)`,
    args: [`ses_${randomBytes(16).toString("hex")}`, customer.id, tokenHash(token), now.toISOString(), expiresAt, userAgentHash(userAgent)],
  });
  return { token, expiresAt, customer };
}

export async function getCustomerBySessionToken(token: string) {
  if (!token) return undefined;
  await ensureSchema();
  const db = await getClient();
  const now = new Date().toISOString();
  const result = await db.execute({
    sql: `SELECT c.id, c.email, c.full_name, c.phone, c.email_verified, c.created_at, c.updated_at
          FROM customer_sessions s
          JOIN customer_accounts c ON c.id = s.customer_id
          WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?
          LIMIT 1`,
    args: [tokenHash(token), now],
  });
  if (!result.rows.length) return undefined;
  return accountFromRow(result.rows[0] as unknown as Record<string, unknown>);
}

export async function revokeCustomerSession(token: string) {
  if (!token) return;
  await ensureSchema();
  const db = await getClient();
  await db.execute({
    sql: "UPDATE customer_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL",
    args: [new Date().toISOString(), tokenHash(token)],
  });
}

export async function revokeAllCustomerSessions(customerId: string) {
  await ensureSchema();
  const db = await getClient();
  await db.execute({
    sql: "UPDATE customer_sessions SET revoked_at = ? WHERE customer_id = ? AND revoked_at IS NULL",
    args: [new Date().toISOString(), customerId],
  });
}
