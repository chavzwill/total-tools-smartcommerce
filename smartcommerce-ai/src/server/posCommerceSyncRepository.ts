import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";
import type { PosCommerceSyncEnvelope, PosSyncDisposition } from "../integrations/posCommerceSyncContract.js";
import { extractPosCatalogDependencies } from "../integrations/posCatalogDependencies.js";
import { validPosOrderPayload } from "./posOrderDelivery.js";

let sqlClient: ReturnType<typeof neon> | undefined;

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("POS_SYNC_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}

export function stablePosSyncPayloadHash(payload: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex");
}

export type PosSyncAdmissionResult = {
  disposition: PosSyncDisposition;
  websiteId?: string;
  currentVersion?: number;
  currentHash?: string;
};
export async function applyPosCommerceSyncEvent(
  event: PosCommerceSyncEnvelope,
): Promise<PosSyncAdmissionResult> {
  const posEntityId = event.entityId;
  const payloadHash = stablePosSyncPayloadHash(event.payload);
  const payloadJson = JSON.stringify(event.payload);
  const dependenciesJson = JSON.stringify(extractPosCatalogDependencies(event));
  const rows = await sql()`
    SELECT disposition, website_id, current_version, current_hash
    FROM apply_pos_sync_event(
      ${event.eventId}, ${event.source}, ${event.entityType}, ${posEntityId},
      ${event.entityVersion}, ${payloadHash}, ${payloadJson}::jsonb,
      ${dependenciesJson}::jsonb, ${event.occurredAt}, ${event.correlationId}
    )
  ` as Array<{
    disposition: PosSyncDisposition;
    website_id: string | null;
    current_version: string | number | null;
    current_hash: string | null;
  }>;

  const row = rows[0];
  if (!row) throw new Error("POS_SYNC_ADMISSION_EMPTY_RESULT");
  return {
    disposition: row.disposition,
    websiteId: row.website_id || undefined,
    currentVersion: row.current_version === null ? undefined : Number(row.current_version),
    currentHash: row.current_hash || undefined,
  };
}

export async function enqueueWebsitePosOperation(input: {
  id: string;
  operation: string;
  entityType: string;
  websiteEntityId: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  correlationId: string;
}) {
  if (input.operation === "order.create" && (input.entityType !== "order" || !validPosOrderPayload(input.payload, input.websiteEntityId))) {
    throw new Error("POS_ORDER_INVALID_PAYLOAD");
  }
  const payloadJson = JSON.stringify(input.payload);
  const rows = await sql()`
    SELECT created, id, state FROM enqueue_pos_operation(
      ${input.id}, ${input.operation}, ${input.entityType}, ${input.websiteEntityId},
      ${input.idempotencyKey}, ${payloadJson}::jsonb, ${input.correlationId}
    )
  ` as Array<{ created: boolean; id: string; state: string }>;
  if (!rows[0]) throw new Error("POS_OUTBOX_ENQUEUE_EMPTY_RESULT");
  return rows[0];
}
