import { neon } from "@neondatabase/serverless";

let sqlClient: ReturnType<typeof neon> | undefined;

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("CUSTOMER_RENTAL_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

export type ProviderRentalLifecycleEvent = {
  providerReservationId: string;
  status: string;
  startAt?: string;
  endAt?: string;
  branch?: string | null;
  fulfillment?: string | null;
  extensionRequestable?: boolean;
  occurredAt?: string;
  providerEventId?: string;
};

const TERMINAL_STATUSES = new Set(["returned", "completed", "cancelled", "declined"]);
const EXTENSION_ACCEPTED_STATUSES = new Set(["confirmed", "reserved", "active", "extended"]);
const ALLOWED_STATUSES = new Set([
  "requested",
  "pending",
  "confirmed",
  "reserved",
  "active",
  "extended",
  "due_soon",
  "overdue",
  "returned",
  "completed",
  "cancelled",
  "declined",
]);

function normalizedStatus(value: string) {
  const status = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
  if (!ALLOWED_STATUSES.has(status)) throw new Error("RENTAL_SYNC_STATUS_INVALID");
  return status;
}

function optionalIso(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("RENTAL_SYNC_DATE_INVALID");
  return date.toISOString();
}

export async function syncProviderRentalLifecycleEvent(event: ProviderRentalLifecycleEvent) {
  const providerReservationId = String(event.providerReservationId || "").trim();
  if (!providerReservationId) throw new Error("RENTAL_SYNC_RESERVATION_REQUIRED");

  const status = normalizedStatus(event.status);
  const startAt = optionalIso(event.startAt);
  const endAt = optionalIso(event.endAt);
  if (startAt && endAt && new Date(endAt) < new Date(startAt)) throw new Error("RENTAL_SYNC_DATE_RANGE_INVALID");

  const rows = await sql()`
    UPDATE customer_rental_lifecycle
    SET
      status = ${status},
      start_at = COALESCE(${startAt || null}::timestamptz, start_at),
      end_at = COALESCE(${endAt || null}::timestamptz, end_at),
      branch = COALESCE(${event.branch ?? null}, branch),
      fulfillment = COALESCE(${event.fulfillment ?? null}, fulfillment),
      extension_requestable = COALESCE(${typeof event.extensionRequestable === "boolean" ? event.extensionRequestable : null}::boolean, extension_requestable),
      updated_at = NOW()
    WHERE provider_reservation_id = ${providerReservationId}
    RETURNING id, customer_id, provider_reservation_id, rental_asset_id, equipment_name, branch,
      start_at, end_at, status, fulfillment, add_ons, extension_of_reservation_id, extension_requestable, updated_at
  ` as unknown as Array<Record<string, unknown>>;

  const rental = rows[0] || null;
  let parentUpdated = 0;

  if (rental && rental.extension_of_reservation_id && EXTENSION_ACCEPTED_STATUSES.has(status)) {
    const extensionEndAt = new Date(String(rental.end_at));
    if (Number.isFinite(extensionEndAt.getTime())) {
      const parentRows = await sql()`
        UPDATE customer_rental_lifecycle
        SET
          status = 'extended',
          end_at = GREATEST(end_at, ${extensionEndAt.toISOString()}::timestamptz),
          updated_at = NOW()
        WHERE customer_id = ${String(rental.customer_id)}
          AND provider_reservation_id = ${String(rental.extension_of_reservation_id)}
        RETURNING id
      ` as unknown as Array<{ id: string }>;
      parentUpdated = parentRows.length;
    }
  }

  return {
    updated: rows.length,
    parentUpdated,
    rental,
    terminal: TERMINAL_STATUSES.has(status),
  };
}

export async function syncProviderRentalLifecycleBatch(events: ProviderRentalLifecycleEvent[]) {
  if (!Array.isArray(events) || events.length === 0) throw new Error("RENTAL_SYNC_EMPTY");
  if (events.length > 500) throw new Error("RENTAL_SYNC_BATCH_TOO_LARGE");

  const results = [];
  for (const event of events) results.push(await syncProviderRentalLifecycleEvent(event));
  return results;
}
