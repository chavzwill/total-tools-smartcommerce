import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const executable = process.env.POS_TEST_PSQL || 'psql';
const database = process.env.POS_TEST_DATABASE_URL;
assert.ok(database, 'POS_TEST_DATABASE_URL must point to a disposable local PostgreSQL database');
assert.ok(/^postgres(?:ql)?:\/\/[^/]*@?(localhost|127\.0\.0\.1)(:\d+)?\//.test(database), 'Database regression must use localhost');
const schema = 'pos_order_test_' + randomUUID().replaceAll('-', '');
const args = ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-d', database];
const run = sql => execFileSync(executable, args, { input: `SET search_path TO ${schema};\n${sql}`, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const parallel = sql => new Promise((resolve, reject) => {
  const child = spawn(executable, args, { stdio: ['pipe', 'pipe', 'pipe'] }); let out = '', err = '';
  child.stdout.on('data', chunk => out += chunk); child.stderr.on('data', chunk => err += chunk);
  child.on('error', reject); child.on('close', code => code ? reject(new Error(err)) : resolve(out.trim()));
  child.stdin.end(`SET search_path TO ${schema};\n${sql}`);
});
let created = false;
try {
  run(`CREATE SCHEMA ${schema};`);
  created = true;
  run(fs.readFileSync('migrations/20260915_pos_commerce_sync.sql', 'utf8'));
  const migration = 'migrations/20260916_pos_order_delivery.sql';
  if (fs.existsSync(migration)) run(fs.readFileSync(migration, 'utf8'));
  assert.equal(run("SELECT count(*) FROM pg_proc WHERE proname='claim_pos_order_delivery' AND pronamespace=current_schema()::regnamespace"), '1', 'Atomic order-delivery claim is missing');
  run(`INSERT INTO pos_sync_outbox(id,operation,entity_type,website_entity_id,idempotency_key,payload,correlation_id)
    VALUES ('one','order.create','order','web-1','key-1','{"external_order_id":"web-1"}','cor-1');`);
  const claims = await Promise.all([parallel("SELECT id FROM claim_pos_order_delivery('worker-a')"), parallel("SELECT id FROM claim_pos_order_delivery('worker-b')")]);
  assert.equal(claims.filter(Boolean).length, 1, 'Concurrent workers must not claim the same lease');
  assert.equal(run("SELECT state || ':' || attempts FROM pos_sync_outbox WHERE id='one'"), 'transferring:1');
  assert.equal(run("SELECT finish_pos_order_delivery('one','wrong','accepted','91',NULL,0)"), 'f');
  run("UPDATE pos_sync_outbox SET lease_expires_at=NOW()-INTERVAL '1 second' WHERE id='one'");
  assert.equal(run("SELECT id FROM claim_pos_order_delivery('worker-c')"), 'one');
  assert.equal(run("SELECT finish_pos_order_delivery('one','worker-a','failed',NULL,'POS_ORDER_HTTP_400',0)"), 'f');
  assert.equal(run("SELECT finish_pos_order_delivery('one','worker-c','pending',NULL,'POS_ORDER_OUTCOME_UNKNOWN',60)"), 't');
  assert.equal(run("SELECT count(*) FROM claim_pos_order_delivery('worker-d')"), '0', 'Backoff must prevent immediate retry');
  run("UPDATE pos_sync_outbox SET next_attempt_at=NOW()-INTERVAL '1 second' WHERE id='one'");
  run("SELECT id FROM claim_pos_order_delivery('worker-e')");
  assert.equal(run("SELECT finish_pos_order_delivery('one','worker-e','accepted','91',NULL,0)"), 't');
  assert.equal(run("SELECT count(*) FROM claim_pos_order_delivery('worker-f')"), '0', 'Accepted rows must never be reclaimed');
  assert.equal(run("SELECT state || ':' || pos_reference FROM pos_sync_outbox WHERE id='one'"), 'accepted:91');
  assert.equal(run("SELECT count(*) FROM pos_order_delivery_attempts WHERE outbox_id='one'"), '3');
  assert.throws(() => run("UPDATE pos_sync_outbox SET payload='{}' WHERE id='one'"), 'Delivery identity and payload must be immutable');
  assert.throws(() => run(`INSERT INTO pos_sync_outbox(id,operation,entity_type,website_entity_id,idempotency_key,payload,correlation_id) VALUES ('two','order.create','order','web-1','different-key','{}','cor-2')`), 'One website order cannot enqueue with a second key');
  assert.equal(run(`SELECT created FROM enqueue_pos_operation('three','order.create','order','web-3','key-3','{"x":1}','cor-3')`), 't');
  assert.equal(run(`SELECT created FROM enqueue_pos_operation('retry','order.create','order','web-3','key-3','{"x":1}','cor-retry')`), 'f');
  assert.throws(() => run(`SELECT * FROM enqueue_pos_operation('collision','order.create','order','web-3','key-3','{"x":2}','cor-3')`), 'Same key with different content must never silently reuse an order');
  const event = (id, entity, version, payload, type = 'product') => {
    const json = JSON.stringify(payload).replaceAll("'", "''");
    return `SELECT disposition FROM apply_pos_sync_event('${id}','total_tools_pos','${type}','${entity}',${version},md5('${json}'),'${json}'::jsonb,'[]'::jsonb,NOW(),'test-correlation')`;
  };
  assert.equal(run(event('p-1', 'p', 1, { name: 'A' })), 'applied');
  assert.equal(run(event('p-conflict', 'p', 1, { name: 'B' })), 'conflict');
  assert.equal(run(event('p-conflict', 'p', 1, { name: 'B' })), 'conflict', 'Conflict retry must remain rejected, never successful replay');
  assert.equal(run(event('self', 'self', 1, { parentId: 'self' }, 'category')), 'conflict');
  assert.equal(run(event('self', 'self', 1, { parentId: 'self' }, 'category')), 'conflict', 'Rejected new entity replay must return a result');
  assert.equal(run(event('p-stale', 'p', 0, {}, 'product')), 'stale');
  assert.equal(run(event('p-stale', 'p', 0, {}, 'product')), 'stale');
  run(event('a-1', 'a', 1, {}, 'category'));
  run(event('b-1', 'b', 1, {}, 'category'));
  const hierarchy = await Promise.all([
    parallel(`BEGIN; ${event('a-2','a',2,{parentId:'b'},'category')}; SELECT pg_sleep(1); COMMIT;`),
    parallel(`BEGIN; ${event('b-2','b',2,{parentId:'a'},'category')}; SELECT pg_sleep(1); COMMIT;`),
  ]);
  assert.deepEqual(hierarchy.sort(), ['applied', 'conflict'], 'Concurrent reparenting must not commit a category cycle');
  console.log('POS order outbox PostgreSQL regression passed.');
} finally { if (created) run(`DROP SCHEMA IF EXISTS ${schema} CASCADE;`); }
