import { neon } from "@neondatabase/serverless";

let sqlClient: ReturnType<typeof neon> | undefined;
let schemaReady: Promise<void> | undefined;

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("COMMERCE_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql()`
        CREATE TABLE IF NOT EXISTS fulfilment_origin_settings (
          id TEXT PRIMARY KEY,
          branch_id TEXT,
          branch_name TEXT,
          town TEXT NOT NULL,
          parish TEXT NOT NULL,
          address_line1 TEXT,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          updated_by TEXT,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
    })();
  }
  await schemaReady;
}

export type FulfilmentOrigin = {
  id: string;
  branchId?: string | null;
  branchName?: string | null;
  town: string;
  parish: string;
  addressLine1?: string | null;
  active: boolean;
  source: "database" | "environment" | "unconfigured";
  updatedBy?: string | null;
  updatedAt?: string | null;
};

function environmentOrigin(): FulfilmentOrigin | undefined {
  const town = String(process.env.SMARTCOMMERCE_FULFILMENT_ORIGIN_TOWN || "").trim();
  const parish = String(process.env.SMARTCOMMERCE_FULFILMENT_ORIGIN_PARISH || "").trim();
  if (!town || !parish) return undefined;
  return {
    id: "ecommerce_default",
    branchId: process.env.SMARTCOMMERCE_FULFILMENT_ORIGIN_BRANCH_ID?.trim() || null,
    branchName: process.env.SMARTCOMMERCE_FULFILMENT_ORIGIN_BRANCH_NAME?.trim() || null,
    town,
    parish,
    addressLine1: process.env.SMARTCOMMERCE_FULFILMENT_ORIGIN_ADDRESS?.trim() || null,
    active: true,
    source: "environment",
  };
}

export async function getFulfilmentOrigin(): Promise<FulfilmentOrigin> {
  await ensureSchema();
  const rows = await sql()`
    SELECT id, branch_id, branch_name, town, parish, address_line1, active, updated_by, updated_at
    FROM fulfilment_origin_settings
    WHERE id = 'ecommerce_default' AND active = TRUE
    LIMIT 1
  ` as any[];
  const row = rows[0];
  if (row) {
    return {
      id: row.id,
      branchId: row.branch_id,
      branchName: row.branch_name,
      town: row.town,
      parish: row.parish,
      addressLine1: row.address_line1,
      active: Boolean(row.active),
      source: "database",
      updatedBy: row.updated_by,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    };
  }
  return environmentOrigin() || {
    id: "ecommerce_default",
    town: "",
    parish: "",
    active: false,
    source: "unconfigured",
  };
}

export async function setFulfilmentOrigin(input: {
  branchId?: string;
  branchName?: string;
  town: string;
  parish: string;
  addressLine1?: string;
  updatedBy: string;
}) {
  await ensureSchema();
  const town = String(input.town || "").trim().slice(0, 100);
  const parish = String(input.parish || "").trim().slice(0, 100);
  if (!town || !parish) throw Object.assign(new Error("FULFILMENT_ORIGIN_INCOMPLETE"), { status: 400 });
  const rows = await sql()`
    INSERT INTO fulfilment_origin_settings (
      id, branch_id, branch_name, town, parish, address_line1, active, updated_by, updated_at
    ) VALUES (
      'ecommerce_default',
      ${String(input.branchId || "").trim().slice(0, 120) || null},
      ${String(input.branchName || "").trim().slice(0, 160) || null},
      ${town}, ${parish},
      ${String(input.addressLine1 || "").trim().slice(0, 220) || null},
      TRUE, ${input.updatedBy}, NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      branch_id = EXCLUDED.branch_id,
      branch_name = EXCLUDED.branch_name,
      town = EXCLUDED.town,
      parish = EXCLUDED.parish,
      address_line1 = EXCLUDED.address_line1,
      active = TRUE,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
    RETURNING id, branch_id, branch_name, town, parish, address_line1, active, updated_by, updated_at
  ` as any[];
  const row = rows[0];
  return {
    id: row.id,
    branchId: row.branch_id,
    branchName: row.branch_name,
    town: row.town,
    parish: row.parish,
    addressLine1: row.address_line1,
    active: Boolean(row.active),
    source: "database" as const,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}
