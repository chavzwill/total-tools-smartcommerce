import { timingSafeEqual } from 'node:crypto';
import { runPosOrderDelivery } from '../src/server/posOrderDelivery.js';
import { createPosOrderOutboxStore } from '../src/server/posOrderOutboxStore.js';

export function createPosOrderDeliveryHandler(run: () => Promise<unknown>) {
  return async function handler(request: any, response: any) {
    const send = (status: number, body: unknown) => {
      response.statusCode = status;
      response.setHeader('Content-Type', 'application/json');
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.end(JSON.stringify(body));
    };
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      return send(405, { error: { code: 'METHOD_NOT_ALLOWED' } });
    }
    const secret = process.env.SMARTCOMMERCE_POS_DELIVERY_SECRET?.trim();
    if (!secret || secret.length < 32) return send(503, { error: { code: 'POS_ORDER_DELIVERY_NOT_CONFIGURED' } });
    const authorization = request.headers?.authorization;
    const supplied = Buffer.from(typeof authorization === 'string' ? authorization : '');
    const expected = Buffer.from(`Bearer ${secret}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      return send(401, { error: { code: 'POS_ORDER_DELIVERY_UNAUTHORIZED' } });
    }
    try { return send(200, await run()); }
    catch {
      // The lease remains recoverable. Never claim a provider rejection on DB failure.
      return send(503, { error: { code: 'POS_ORDER_DELIVERY_UNAVAILABLE', retryable: true } });
    }
  };
}

export default createPosOrderDeliveryHandler(async () => {
  const baseUrl = process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_URL?.trim();
  const apiKey = process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_API_KEY?.trim();
  if (!baseUrl || !apiKey) throw new Error('POS_ORDER_NOT_CONFIGURED');
  return runPosOrderDelivery(createPosOrderOutboxStore(), { baseUrl, apiKey });
});
