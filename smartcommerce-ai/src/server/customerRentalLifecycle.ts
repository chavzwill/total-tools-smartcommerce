import { neon } from "@neondatabase/serverless";
import { randomBytes } from "node:crypto";

let sqlClient: ReturnType<typeof neon> | undefined;
let schemaReady = false;

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("CUSTOMER_RENTAL_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

export type CustomerRentalLifecycleInput = {
  customerId: string;
  providerReservationId: string;
  rentalAssetId: string;
  equipmentName: string;
  branch?: string | null;
  startAt: string;
  endAt: string;
  status: string;
  fulfillment?: string | null;
  addOns?: unknown[];
  extensionOfReservationId?: string | null;
};

export async function ensureCustomerRentalLifecycleSchema() {
  if (schemaReady) return;
  const db = sql();
  await db`
    CREATE TABLE IF NOT EXISTS customer_rental_lifecycle (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      provider_reservation_id TEXT NOT NULL,
      rental_asset_id TEXT NOT NULL,
      equipment_name TEXT NOT NULL,
      branch TEXT,
      start_at TIMESTAMPTZ NOT NULL,
      end_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL,
      fulfillment TEXT,
      add_ons JSONB NOT NULL DEFAULT '[]'::jsonb,
      extension_of_reservation_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT customer_rental_lifecycle_dates CHECK (end_at >= start_at)
    )
  `;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS customer_rental_lifecycle_provider_uidx ON customer_rental_lifecycle(customer_id, provider_reservation_id)`;
  await db`CREATE INDEX IF NOT EXISTS customer_rental_lifecycle_customer_end_idx ON customer_rental_lifecycle(customer_id, end_at DESC)`;
  schemaReady = true;
}

export async function recordCustomerRentalLifecycle(input: CustomerRentalLifecycleInput) {
  await ensureCustomerRentalLifecycleSchema();
  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  if (!input.customerId || !input.providerReservationId || !input.rentalAssetId || !input.equipmentName) throw new Error("CUSTOMER_RENTAL_FIELDS_REQUIRED");
  if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) || endAt < startAt) throw new Error("CUSTOMER_RENTAL_DATES_INVALID");
  const id = `crl_${randomBytes(16).toString("hex")}`;
  const rows = await sql()`
    INSERT INTO customer_rental_lifecycle (
      id, customer_id, provider_reservation_id, rental_asset_id, equipment_name, branch,
      start_at, end_at, status, fulfillment, add_ons, extension_of_reservation_id
    ) VALUES (
      ${id}, ${input.customerId}, ${input.providerReservationId}, ${input.rentalAssetId}, ${input.equipmentName}, ${input.branch || null},
      ${startAt.toISOString()}, ${endAt.toISOString()}, ${input.status || "requested"}, ${input.fulfillment || null},
      ${JSON.stringify(input.addOns || [])}::jsonb, ${input.extensionOfReservationId || null}
    )
    ON CONFLICT (customer_id, provider_reservation_id)
    DO UPDATE SET
      status = EXCLUDED.status,
      end_at = EXCLUDED.end_at,
      branch = COALESCE(EXCLUDED.branch, customer_rental_lifecycle.branch),
      fulfillment = COALESCE(EXCLUDED.fulfillment, customer_rental_lifecycle.fulfillment),
      add_ons = EXCLUDED.add_ons,
      updated_at = NOW()
    RETURNING *
  ` as unknown as Array<Record<string, unknown>>;
  return rows[0];
}

export async function listCustomerRentalLifecycle(customerId: string) {
  await ensureCustomerRentalLifecycleSchema();
  return await sql()`
    SELECT id, provider_reservation_id, rental_asset_id, equipment_name, branch, start_at, end_at,
           status, fulfillment, add_ons, extension_of_reservation_id, created_at, updated_at
    FROM customer_rental_lifecycle
    WHERE customer_id = ${customerId}
    ORDER BY end_at ASC
  ` as unknown as Array<Record<string, any>>;
}
