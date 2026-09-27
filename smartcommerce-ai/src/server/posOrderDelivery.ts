import { createHardenedServerFetch, validateServerIntegrationBaseUrl } from './hardenedOutboundFetch.js';

export type OrderDeliveryRow = {
  id: string; websiteEntityId: string; attempts: number; leaseToken: string;
  payload: Record<string, unknown>;
};
export type OrderDeliveryResult = {
  state: 'pending' | 'accepted' | 'failed' | 'needs_review';
  errorCode?: string; posReference?: string; retryAfterSeconds?: number;
};
type DeliveryOptions = { baseUrl: string; apiKey: string; fetchImpl?: typeof fetch };
export type OrderDeliveryStore = {
  claim(): Promise<OrderDeliveryRow | undefined>;
  finish(row: OrderDeliveryRow, result: OrderDeliveryResult): Promise<boolean>;
};
const object = (v: unknown): Record<string, unknown> | undefined =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : undefined;
const positiveId = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const reference = (v: unknown) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(v);

// This path only accepts finalized, server-authorized paid orders. The POS currently
// treats every non-credit POST as a completed payment; draft carts must never enter it.
export function validPosOrderPayload(payload: Record<string, unknown>, websiteId: string): boolean {
  const allowed = new Set(['external_order_id', 'external_quote_id', 'external_payment_reference',
    'external_customer_id', 'customer_id', 'branch_id', 'items', 'payment_method',
    'delivery_amount', 'service_amount', 'handling_amount', 'expected_pos_total']);
  if (Object.keys(payload).some(k => !allowed.has(k))) return false;
  if (!reference(websiteId) || payload.external_order_id !== websiteId || !positiveId(payload.branch_id)) return false;
  if (payload.payment_method !== 'online' || !reference(payload.external_payment_reference)) return false;
  if (typeof payload.expected_pos_total !== 'number' || !Number.isFinite(payload.expected_pos_total) || payload.expected_pos_total < 0 || payload.expected_pos_total > 1e9 || Math.abs(payload.expected_pos_total * 100 - Math.round(payload.expected_pos_total * 100)) > 1e-6) return false;
  for (const key of ['external_quote_id', 'external_customer_id']) {
    if (payload[key] !== undefined && !reference(payload[key])) return false;
  }
  if (payload.customer_id !== undefined && !positiveId(payload.customer_id)) return false;
  for (const key of ['delivery_amount', 'service_amount', 'handling_amount']) {
    const value = payload[key];
    if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e9 || Math.abs(value * 100 - Math.round(value * 100)) > 1e-6)) return false;
  }
  if (!Array.isArray(payload.items) || payload.items.length < 1 || payload.items.length > 200) return false;
  const seen = new Set<number>();
  return payload.items.every(value => {
    const item = object(value);
    if (!item || Object.keys(item).some(k => k !== 'product_id' && k !== 'quantity')) return false;
    if (!positiveId(item.product_id) || typeof item.quantity !== 'number' || !Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity > 1e6) return false;
    if (seen.has(item.product_id as number)) return false;
    seen.add(item.product_id as number);
    return true;
  });
}

function acceptedReceipt(value: unknown, row: OrderDeliveryRow): string | undefined {
  const receipt = object(value);
  if (!receipt || !positiveId(receipt.id) || receipt.external_order_id !== row.websiteEntityId || receipt.status !== 'completed') return;
  const p = row.payload;
  if (Number(receipt.branch_id) !== p.branch_id || receipt.payment_method !== p.payment_method || receipt.external_payment_reference !== p.external_payment_reference) return;
  for (const field of ['customer_id', 'external_customer_id', 'external_quote_id']) {
    if ((receipt[field] ?? null) !== (p[field] ?? null)) return;
  }
  for (const field of ['delivery_amount', 'service_amount', 'handling_amount']) {
    if (Number(receipt[field] ?? 0) !== Number(p[field] ?? 0)) return;
  }
  if (typeof receipt.total !== 'number' || !Number.isFinite(receipt.total) || receipt.total < 0) return;
  if (Math.round(receipt.total * 100) !== Math.round(Number(p.expected_pos_total) * 100)) return;
  if (!Array.isArray(receipt.items) || receipt.items.length !== (p.items as unknown[]).length) return;
  const remaining = new Map((p.items as Array<{ product_id: number; quantity: number }>).map(i => [i.product_id, i.quantity]));
  for (const value of receipt.items) {
    const item = object(value);
    if (!item || remaining.get(Number(item.product_id)) !== Number(item.quantity)) return;
    remaining.delete(Number(item.product_id));
  }
  if (remaining.size) return;
  return String(receipt.id);
}

export async function deliverPosOrder(row: OrderDeliveryRow, options: DeliveryOptions): Promise<OrderDeliveryResult> {
  const review = (errorCode: string): OrderDeliveryResult => ({ state: 'needs_review', errorCode });
  const receiptResult = (value: unknown): OrderDeliveryResult => {
    const posReference = acceptedReceipt(value, row);
    if (posReference) return { state: 'accepted', posReference };
    const receipt = object(value);
    const confirmedReference = receipt && receipt.external_order_id === row.websiteEntityId && positiveId(receipt.id) ? String(receipt.id) : undefined;
    return { ...review('POS_ORDER_RECEIPT_CONFLICT'), ...(confirmedReference ? { posReference: confirmedReference } : {}) };
  };
  const retry = (errorCode: string, response?: Response): OrderDeliveryResult => {
    if (row.attempts >= 8) return review('POS_ORDER_RETRY_EXHAUSTED');
    const header = response?.headers.get('retry-after');
    const retrySeconds = header && /^\d+$/.test(header) ? Number(header) : header ? Math.ceil((Date.parse(header) - Date.now()) / 1000) : 0;
    return { state: 'pending', errorCode, retryAfterSeconds: Math.min(3600, Math.max(15 * 2 ** Math.min(row.attempts, 7), Number.isFinite(retrySeconds) ? retrySeconds : 0)) };
  };
  if (!validPosOrderPayload(row.payload, row.websiteEntityId)) return review('POS_ORDER_INVALID_PAYLOAD');
  let endpoint: string;
  try {
    const url = validateServerIntegrationBaseUrl(options.baseUrl);
    if (url.protocol !== 'https:' || url.search || url.pathname !== '/' || !options.apiKey.trim()) return review('POS_ORDER_NOT_CONFIGURED');
    endpoint = `${url.origin}/api/smartcommerce-orders`;
  } catch { return review('POS_ORDER_NOT_CONFIGURED'); }
  const request = createHardenedServerFetch({ fetchImpl: options.fetchImpl, timeoutMs: 7000, maxResponseBytes: 512_000 });
  const headers = { 'X-API-Key': options.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' };
  const lookup = async (): Promise<OrderDeliveryResult | undefined> => {
    let response: Response;
    try { response = await request(`${endpoint}/${encodeURIComponent(row.websiteEntityId)}`, { method: 'GET', headers }); }
    catch { return retry('POS_ORDER_RECONCILIATION_UNAVAILABLE'); }
    if (response.status === 404) return undefined;
    if (response.status === 200) {
      try {
        return receiptResult(await response.json());
      } catch { return review('POS_ORDER_RECEIPT_INVALID'); }
    }
    if ([408, 429].includes(response.status) || response.status >= 500) return retry('POS_ORDER_RECONCILIATION_UNAVAILABLE', response);
    return review('POS_ORDER_RECONCILIATION_REJECTED');
  };
  const prior = await lookup();
  if (prior) return prior;
  let response: Response | undefined;
  try {
    const { expected_pos_total: _settledTotal, ...wirePayload } = row.payload;
    response = await request(endpoint, { method: 'POST', headers, body: JSON.stringify(wirePayload) });
    if (response.status === 200 || response.status === 201) {
      return receiptResult(await response.json());
    } else if ([401, 403, 409, 422].includes(response.status)) return review(`POS_ORDER_HTTP_${response.status}`);
    else if ([400, 404, 405, 413, 415].includes(response.status)) return { state: 'failed', errorCode: `POS_ORDER_HTTP_${response.status}` };
  } catch { /* Never persist provider exception text or assume that POST rolled back. */ }
  return await lookup() ?? retry(response && ([408, 429].includes(response.status) || response.status >= 500)
    ? `POS_ORDER_HTTP_${response.status}` : 'POS_ORDER_OUTCOME_UNKNOWN', response);
}

export async function runPosOrderDelivery(store: OrderDeliveryStore, options: DeliveryOptions) {
  const row = await store.claim();
  if (!row) return { status: 'idle' as const };
  const result = await deliverPosOrder(row, options);
  if (!await store.finish(row, result)) return { status: 'lease_lost' as const, id: row.id };
  return { status: result.state, id: row.id, ...(result.errorCode ? { errorCode: result.errorCode } : {}) };
}
