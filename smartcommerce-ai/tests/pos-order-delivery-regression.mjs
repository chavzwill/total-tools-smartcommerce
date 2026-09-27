import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && specifier.endsWith('.js') && context.parentURL) {
      const candidate = new URL(specifier.slice(0, -3) + '.ts', context.parentURL);
      if (fs.existsSync(candidate)) return { url: candidate.href, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('.ts')) return { format: 'module', shortCircuit: true, source: ts.transpileModule(fs.readFileSync(fileURLToPath(url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText };
    return next(url, context);
  },
});
const modulePath = new URL('../src/server/posOrderDelivery.ts', import.meta.url);
assert.ok(fs.existsSync(modulePath), 'Durable POS order delivery worker is missing');
const { deliverPosOrder, runPosOrderDelivery } = await import(modulePath.href);
const input = () => ({ id: 'out-1', websiteEntityId: 'web-1', attempts: 1, leaseToken: 'lease-1', payload: {
  external_order_id: 'web-1', branch_id: 2, payment_method: 'online', external_payment_reference: 'pay-1',
  items: [{ product_id: 7, quantity: 2 }], expected_pos_total: 24,
}});
const receipt = (extra = {}) => ({ id: 91, external_order_id: 'web-1', branch_id: 2, status: 'completed', total: 24,
  payment_method: 'online', external_payment_reference: 'pay-1', items: [{ product_id: 7, quantity: 2, unit_price: 12 }], payments: [], ...extra });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const config = { baseUrl: 'https://pos.example.test', apiKey: 'server-only-test-key' };
async function scenario(responses, row = input()) {
  const calls = [];
  const result = await deliverPosOrder(row, { ...config, fetchImpl: async (url, init) => {
    calls.push({ url: String(url), ...init });
    const next = responses.shift();
    assert.notEqual(next, undefined, 'Unexpected additional POS request');
    if (next instanceof Error) throw next;
    return next;
  }});
  return { result, calls };
}
let observed = await scenario([json({}, 404), json(receipt(), 201)]);
assert.equal(observed.result.state, 'accepted');
assert.equal(observed.result.posReference, '91');
assert.deepEqual(observed.calls.map(c => c.method), ['GET', 'POST']);
assert.equal(observed.calls[0].url, 'https://pos.example.test/api/smartcommerce-orders/web-1');
assert.equal(observed.calls[1].headers['X-API-Key'], config.apiKey);
const { expected_pos_total, ...wirePayload } = input().payload;
assert.deepEqual(JSON.parse(observed.calls[1].body), wirePayload, 'Website settlement evidence must not leak into POS contract');
observed = await scenario([json(receipt())]);
assert.equal(observed.result.state, 'accepted');
assert.equal(observed.calls.length, 1, 'Reconciled orders must never be posted again');
observed = await scenario([json({}, 404), new Error('secret provider credentials'), json(receipt())]);
assert.equal(observed.result.state, 'accepted', 'Lost POST response must reconcile committed order');
observed = await scenario([json({}, 404), new Error('secret'), json({}, 404)]);
assert.equal(observed.result.state, 'pending');
assert.equal(observed.result.errorCode, 'POS_ORDER_OUTCOME_UNKNOWN');
assert.ok(!JSON.stringify(observed.result).includes('secret'));
for (const status of [401, 403, 409, 422]) {
  observed = await scenario([json({}, 404), json({ error: 'secret' }, status)]);
  assert.equal(observed.result.state, 'needs_review');
  assert.ok(!JSON.stringify(observed.result).includes('secret'));
}
for (const status of [408, 429, 500, 503]) {
  observed = await scenario([json({}, 404), json({}, status), json({}, 404)]);
  assert.equal(observed.result.state, 'pending');
}
observed = await scenario([json({}, 404), json({}, 400)]);
assert.equal(observed.result.state, 'failed');
observed = await scenario([json({ error: 'secret' }, 503)]);
assert.equal(observed.result.state, 'pending');
assert.equal(observed.calls.length, 1, 'Do not POST when reconciliation is unavailable');
for (const bad of [{}, receipt({ external_order_id: 'wrong' }), receipt({ items: [] }), receipt({ status: 'cancelled' }), receipt({ branch_id: 3 }), receipt({ total: 25 }), receipt({ customer_id: 6 })]) {
  observed = await scenario([json(bad)]);
  assert.equal(observed.result.state, 'needs_review');
}
observed = await scenario([json(receipt({ total: 25 }))]);
assert.equal(observed.result.posReference, '91', 'Preserve confirmed POS identity when economics require review');
observed = await scenario([json({}, 404), json({}, 429), json({}, 404)]);
assert.equal(observed.result.errorCode, 'POS_ORDER_HTTP_429', 'Preserve exact retry classification');
observed = await scenario([json({}, 404), json({ queued: true }, 202), json({}, 404)]);
assert.notEqual(observed.result.state, 'accepted', 'HTTP 202 alone is not POS acceptance');
for (const patch of [{ external_order_id: 'other' }, { items: [{ product_id: 7, quantity: 0 }] }, { items: [{ product_id: 7, quantity: 2, unit_price: 1 }] }, { tax_exempt: true }, { external_payment_reference: undefined }]) {
  const row = input(); Object.assign(row.payload, patch);
  observed = await scenario([], row);
  assert.equal(observed.result.state, 'needs_review');
  assert.equal(observed.calls.length, 0, 'Invalid/unauthorized economics must fail before network');
}
const lastAttempt = input(); lastAttempt.attempts = 8;
observed = await scenario([json({}, 503)], lastAttempt);
assert.equal(observed.result.state, 'needs_review', 'Exhausted ambiguous delivery is not a definite failure');
const transitions = [];
const store = { claim: async () => input(), finish: async (row, result) => { transitions.push(result); return false; } };
const report = await runPosOrderDelivery(store, { ...config, fetchImpl: async () => json(receipt()) });
assert.equal(transitions[0].state, 'accepted');
assert.equal(report.status, 'lease_lost', 'Do not report accepted unless durable completion succeeded');
console.log('POS order delivery regression passed.');
const routePath = new URL('../api/pos-order-delivery.ts', import.meta.url);
assert.ok(fs.existsSync(routePath), 'Authenticated delivery trigger is missing');
const { createPosOrderDeliveryHandler } = await import(routePath.href);
let invoked = 0;
const handler = createPosOrderDeliveryHandler(async () => { invoked++; return { status: 'pending', id: 'out-1' }; });
async function invoke(method, authorization) {
  let body; const headers = {};
  const response = { statusCode: 0, setHeader: (k, v) => headers[k] = v, end: v => body = JSON.parse(v) };
  await handler({ method, headers: { authorization } }, response);
  return { status: response.statusCode, body, headers };
}
process.env.SMARTCOMMERCE_POS_DELIVERY_SECRET = 'test-delivery-secret-with-at-least-32-characters';
assert.equal((await invoke('POST', undefined)).status, 401);
assert.equal(invoked, 0);
assert.equal((await invoke('GET', `Bearer ${process.env.SMARTCOMMERCE_POS_DELIVERY_SECRET}`)).status, 405);
assert.equal(invoked, 0);
const response = await invoke('POST', `Bearer ${process.env.SMARTCOMMERCE_POS_DELIVERY_SECRET}`);
assert.equal(response.body.status, 'pending');
assert.equal(response.headers['Cache-Control'], 'no-store');
const errorHandler = createPosOrderDeliveryHandler(async () => { throw new Error('postgres://secret'); });
let errorBody;
await errorHandler({ method: 'POST', headers: { authorization: `Bearer ${process.env.SMARTCOMMERCE_POS_DELIVERY_SECRET}` } }, { setHeader() {}, end: value => errorBody = value });
assert.ok(!errorBody.includes('secret'));
delete process.env.SMARTCOMMERCE_POS_DELIVERY_SECRET;
assert.equal((await invoke('POST', 'Bearer anything')).status, 503);
console.log('POS order delivery trigger regression passed.');
const { enqueueWebsitePosOperation } = await import('../src/server/posCommerceSyncRepository.ts');
await assert.rejects(() => enqueueWebsitePosOperation({ id: 'new', operation: 'order.create', entityType: 'order', websiteEntityId: 'web-1', idempotencyKey: 'key', correlationId: 'cor', payload: {} }), /POS_ORDER_INVALID_PAYLOAD/);
const { classifyIncomingSyncEvent } = await import('../src/server/posSyncVersioning.ts');
assert.equal(classifyIncomingSyncEvent({ eventId: 'same', entityVersion: 1, payloadHash: 'a' }, { eventId: 'same', entityVersion: 1, payloadHash: 'b' }).action, 'conflict', 'Event identity cannot conceal payload conflict');
assert.equal(classifyIncomingSyncEvent({ eventId: 'same', entityVersion: 1, payloadHash: 'a' }, { eventId: 'same', entityVersion: 2, payloadHash: 'a' }).action, 'conflict', 'Event identity cannot be reused for a new version');
