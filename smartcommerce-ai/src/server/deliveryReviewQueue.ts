import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";

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

function stableId(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);
}

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql()`
        CREATE TABLE IF NOT EXISTS delivery_manual_reviews (
          id TEXT PRIMARY KEY,
          quote_id TEXT NOT NULL,
          customer_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          reason_code TEXT,
          reason_message TEXT,
          requested_service_id TEXT,
          requested_speed TEXT,
          destination_class TEXT,
          address JSONB NOT NULL DEFAULT '{}'::jsonb,
          items JSONB NOT NULL DEFAULT '[]'::jsonb,
          provider_name TEXT,
          vehicle_class TEXT,
          provider_cost_minor BIGINT,
          operations_markup_minor BIGINT,
          customer_charge_minor BIGINT,
          currency TEXT NOT NULL DEFAULT 'JMD',
          scheduled_for TIMESTAMPTZ,
          staff_notes TEXT,
          reviewed_by TEXT,
          reviewed_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql()`CREATE INDEX IF NOT EXISTS delivery_manual_reviews_status_idx ON delivery_manual_reviews(status, created_at DESC)`;
      await sql()`CREATE INDEX IF NOT EXISTS delivery_manual_reviews_customer_idx ON delivery_manual_reviews(customer_id, created_at DESC)`;
    })();
  }
  await schemaReady;
}

export type ManualDeliveryReviewInput = {
  quoteId: string;
  customerId: string;
  reasonCode?: string;
  reasonMessage?: string;
  requestedServiceId?: string;
  requestedSpeed?: string;
  destinationClass?: string;
  address: unknown;
  items: unknown[];
};

export async function createManualDeliveryReview(input: ManualDeliveryReviewInput) {
  await ensureSchema();
  const id = `dlvrev_${stableId({ quoteId: input.quoteId, customerId: input.customerId, address: input.address, items: input.items })}`;
  const rows = await sql()`
    INSERT INTO delivery_manual_reviews (
      id, quote_id, customer_id, status, reason_code, reason_message,
      requested_service_id, requested_speed, destination_class, address, items
    ) VALUES (
      ${id}, ${input.quoteId}, ${input.customerId}, 'pending', ${input.reasonCode || null}, ${input.reasonMessage || null},
      ${input.requestedServiceId || null}, ${input.requestedSpeed || null}, ${input.destinationClass || null},
      ${JSON.stringify(input.address)}::jsonb, ${JSON.stringify(input.items)}::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      quote_id = EXCLUDED.quote_id,
      reason_code = EXCLUDED.reason_code,
      reason_message = EXCLUDED.reason_message,
      requested_service_id = EXCLUDED.requested_service_id,
      requested_speed = EXCLUDED.requested_speed,
      destination_class = EXCLUDED.destination_class,
      address = EXCLUDED.address,
      items = EXCLUDED.items,
      updated_at = NOW()
    RETURNING *
  ` as any[];
  return rows[0];
}

export async function listManualDeliveryReviews(status?: string) {
  await ensureSchema();
  const normalized = String(status || "pending").trim();
  if (normalized === "all") {
    return await sql()`SELECT * FROM delivery_manual_reviews ORDER BY created_at DESC LIMIT 200` as any[];
  }
  return await sql()`SELECT * FROM delivery_manual_reviews WHERE status = ${normalized} ORDER BY created_at ASC LIMIT 200` as any[];
}

export async function priceManualDeliveryReview(input: {
  id: string;
  reviewedBy: string;
  providerName?: string;
  vehicleClass?: string;
  providerCostMinor: number;
  customerChargeMinor: number;
  currency?: string;
  scheduledFor?: string;
  staffNotes?: string;
}) {
  await ensureSchema();
  const providerCostMinor = Math.max(0, Math.round(Number(input.providerCostMinor || 0)));
  const customerChargeMinor = Math.max(0, Math.round(Number(input.customerChargeMinor || 0)));
  if (!input.id || customerChargeMinor <= 0) throw Object.assign(new Error("INVALID_MANUAL_DELIVERY_PRICE"), { status: 400 });
  const operationsMarkupMinor = Math.max(0, customerChargeMinor - providerCostMinor);
  const rows = await sql()`
    UPDATE delivery_manual_reviews
    SET status = 'priced',
        provider_name = ${String(input.providerName || "").trim().slice(0, 120) || null},
        vehicle_class = ${String(input.vehicleClass || "").trim().slice(0, 80) || null},
        provider_cost_minor = ${providerCostMinor},
        operations_markup_minor = ${operationsMarkupMinor},
        customer_charge_minor = ${customerChargeMinor},
        currency = ${String(input.currency || "JMD").trim().toUpperCase().slice(0, 3)},
        scheduled_for = ${input.scheduledFor ? new Date(input.scheduledFor).toISOString() : null},
        staff_notes = ${String(input.staffNotes || "").trim().slice(0, 1000) || null},
        reviewed_by = ${input.reviewedBy},
        reviewed_at = NOW(),
        updated_at = NOW()
    WHERE id = ${input.id}
    RETURNING *
  ` as any[];
  if (!rows[0]) throw Object.assign(new Error("DELIVERY_REVIEW_NOT_FOUND"), { status: 404 });
  return rows[0];
}

export async function getManualDeliveryReview(id: string) {
  await ensureSchema();
  const rows = await sql()`SELECT * FROM delivery_manual_reviews WHERE id = ${id} LIMIT 1` as any[];
  return rows[0];
}
