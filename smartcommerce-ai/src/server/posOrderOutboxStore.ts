import { neon } from '@neondatabase/serverless';
import { randomUUID } from 'node:crypto';
import type { OrderDeliveryStore } from './posOrderDelivery.js';

export function createPosOrderOutboxStore(): OrderDeliveryStore {
  const databaseUrl = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('POS_ORDER_DATABASE_NOT_CONFIGURED');
  const sql = neon(databaseUrl);
  return {
    async claim() {
      const rows = await sql`SELECT * FROM claim_pos_order_delivery(${randomUUID()})`;
      const row = rows[0];
      if (!row) return undefined;
      return { id: String(row.id), websiteEntityId: String(row.website_entity_id),
        attempts: Number(row.attempts), leaseToken: String(row.lease_token),
        payload: row.payload as Record<string, unknown> };
    },
    async finish(row, result) {
      const rows = await sql`SELECT finish_pos_order_delivery(${row.id},${row.leaseToken},${result.state},
        ${result.posReference ?? null},${result.errorCode ?? null},${result.retryAfterSeconds ?? 0}) AS saved`;
      return rows[0]?.saved === true;
    },
  };
}
