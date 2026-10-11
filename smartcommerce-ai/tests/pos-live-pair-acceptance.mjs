import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
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
    if (url.endsWith('.ts')) {
      return {
        format: 'module',
        shortCircuit: true,
        source: ts.transpileModule(fs.readFileSync(fileURLToPath(url), 'utf8'), {
          compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        }).outputText,
      };
    }
    return next(url, context);
  },
});

const posRoot = process.env.POS_ACCEPTANCE_POS_ROOT;
const fixturePath = process.env.POS_ACCEPTANCE_FIXTURE_PATH;
const httpOrigin = process.env.POS_ACCEPTANCE_HTTP_ORIGIN || 'http://127.0.0.1:3001';
assert.ok(posRoot, 'POS_ACCEPTANCE_POS_ROOT is required');
assert.ok(fixturePath && fs.existsSync(fixturePath), 'POS acceptance fixture JSON is required');

const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const fixtureScript = fileURLToPath(new URL('./pos-live-pair-fixture.cjs', import.meta.url));
const exec = promisify(execFile);
const { deliverPosOrder } = await import('../src/server/posOrderDelivery.ts');

async function fixtureCommand(command, ...args) {
  const result = await exec(process.execPath, [fixtureScript, command, ...args.map(String)], {
    cwd: posRoot,
    env: { ...process.env, POS_ACCEPTANCE_POS_ROOT: posRoot, POS_ACCEPTANCE_FIXTURE_PATH: fixturePath },
    timeout: 20_000,
  });
  return JSON.parse(result.stdout.trim());
}

function localBridgeFetch(dropFirstPostResponse = false) {
  let drop = dropFirstPostResponse;
  return async (input, init = {}) => {
    const requested = new URL(input instanceof URL ? input.toString() : String(input));
    const local = new URL(requested.pathname + requested.search, httpOrigin);
    const response = await fetch(local, init);
    if (drop && String(init.method || 'GET').toUpperCase() === 'POST') {
      drop = false;
      await response.arrayBuffer();
      throw new Error('SIMULATED_LOST_POS_RESPONSE');
    }
    return response;
  };
}

function row(name, product, quantity, expectedTotal, attempts = 1) {
  const external = `sc-accept-${name}`;
  return {
    id: `out-${name}`,
    websiteEntityId: external,
    attempts,
    leaseToken: `lease-${name}`,
    payload: {
      external_order_id: external,
      branch_id: fixture.branchId,
      items: [{ product_id: product.id, quantity }],
      payment_method: 'online',
      external_payment_reference: `pay-${name}`,
      expected_pos_total: expectedTotal,
    },
  };
}

const config = (fetchImpl) => ({
  baseUrl: 'https://pos.acceptance.test',
  apiKey: fixture.apiKey,
  fetchImpl,
});

async function inspect(product, externalId) {
  return fixtureCommand('inspect', product.id, externalId);
}

// 1. Duplicate delivery must reconcile to one POS transaction and one stock decrement.
const replayRow = row('replay', fixture.products.replay, 1, 100);
const first = await deliverPosOrder(replayRow, config(localBridgeFetch()));
assert.equal(first.state, 'accepted');
const replay = await deliverPosOrder(replayRow, config(localBridgeFetch()));
assert.equal(replay.state, 'accepted');
assert.equal(replay.posReference, first.posReference);
let evidence = await inspect(fixture.products.replay, replayRow.websiteEntityId);
assert.deepEqual(evidence, { stock: 4, orders: 1, payments: 1 });

// Same external identity with changed intent must not create another transaction.
const changedReplay = structuredClone(replayRow);
changedReplay.payload.expected_pos_total = 200;
changedReplay.payload.items = [{ product_id: fixture.products.replay.id, quantity: 2 }];
const changed = await deliverPosOrder(changedReplay, config(localBridgeFetch()));
assert.equal(changed.state, 'needs_review');
evidence = await inspect(fixture.products.replay, replayRow.websiteEntityId);
assert.deepEqual(evidence, { stock: 4, orders: 1, payments: 1 });

// 2. Lost POST response must reconcile the committed POS order using the same external identity.
const lostRow = row('lost', fixture.products.lost, 1, 120);
const lost = await deliverPosOrder(lostRow, config(localBridgeFetch(true)));
assert.equal(lost.state, 'accepted');
evidence = await inspect(fixture.products.lost, lostRow.websiteEntityId);
assert.deepEqual(evidence, { stock: 4, orders: 1, payments: 1 });

// 3. Concurrent delivery of one logical order must still create one POS transaction.
const concurrentRow = row('concurrent', fixture.products.concurrent, 1, 80);
const concurrentResults = await Promise.all([
  deliverPosOrder(concurrentRow, config(localBridgeFetch())),
  deliverPosOrder(concurrentRow, config(localBridgeFetch())),
]);
assert.ok(concurrentResults.every((result) => result.state === 'accepted'), JSON.stringify(concurrentResults));
assert.equal(new Set(concurrentResults.map((result) => result.posReference)).size, 1);
evidence = await inspect(fixture.products.concurrent, concurrentRow.websiteEntityId);
assert.deepEqual(evidence, { stock: 4, orders: 1, payments: 1 });

// 4. Insufficient stock is a reviewable business rejection with no transaction side effects.
const stockRow = row('stock', fixture.products.stock, 2, 80);
const stockRejected = await deliverPosOrder(stockRow, config(localBridgeFetch()));
assert.equal(stockRejected.state, 'needs_review');
assert.equal(stockRejected.errorCode, 'POS_ORDER_HTTP_409');
evidence = await inspect(fixture.products.stock, stockRow.websiteEntityId);
assert.deepEqual(evidence, { stock: 1, orders: 0, payments: 0 });

// 5. A POS price change after website settlement must be rejected before stock/order mutation.
const priceRow = row('price', fixture.products.price, 1, 50);
await fixtureCommand('set-price', fixture.products.price.id, 60);
const priceRejected = await deliverPosOrder(priceRow, config(localBridgeFetch()));
assert.equal(priceRejected.state, 'needs_review');
assert.equal(priceRejected.errorCode, 'POS_ORDER_HTTP_409');
evidence = await inspect(fixture.products.price, priceRow.websiteEntityId);
assert.deepEqual(evidence, { stock: 5, orders: 0, payments: 0 });

console.log('Live SmartCommerce↔POS acceptance passed: replay, lost response reconciliation, concurrency, stock rejection, and price-drift rejection.');
