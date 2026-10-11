'use strict';

const fs = require('fs');
const path = require('path');

const posRoot = path.resolve(process.env.POS_ACCEPTANCE_POS_ROOT || '');
if (!posRoot) throw new Error('POS_ACCEPTANCE_POS_ROOT is required');
const { db, ensureReady } = require(path.join(posRoot, 'database.js'));
const { hashKey } = require(path.join(posRoot, 'lib', 'apiKeyAuth.js'));

const apiKey = 'pos_acceptance_0123456789abcdef0123456789abcdef';
const fixturePath = process.env.POS_ACCEPTANCE_FIXTURE_PATH || path.join(posRoot, 'smartcommerce-acceptance-fixture.json');

const definitions = [
  { key: 'replay', sku: 'SC-ACCEPT-REPLAY', name: 'SmartCommerce acceptance replay', price: 100, stock: 5 },
  { key: 'lost', sku: 'SC-ACCEPT-LOST', name: 'SmartCommerce acceptance lost response', price: 120, stock: 5 },
  { key: 'concurrent', sku: 'SC-ACCEPT-CONCURRENT', name: 'SmartCommerce acceptance concurrency', price: 80, stock: 5 },
  { key: 'stock', sku: 'SC-ACCEPT-STOCK', name: 'SmartCommerce acceptance stock rejection', price: 40, stock: 1 },
  { key: 'price', sku: 'SC-ACCEPT-PRICE', name: 'SmartCommerce acceptance price drift', price: 50, stock: 5 },
];

async function seed() {
  await ensureReady();
  const { rows: [branch] } = await db.execute({
    sql: 'SELECT id FROM branches WHERE active = 1 ORDER BY id LIMIT 1',
    args: [],
  });
  if (!branch) throw new Error('Acceptance fixture requires one active branch');

  await db.execute({
    sql: 'DELETE FROM api_keys WHERE name = ?',
    args: ['SmartCommerce pair acceptance'],
  });
  await db.execute({
    sql: 'INSERT INTO api_keys(name,key_prefix,key_hash,scopes,is_active) VALUES(?,?,?,?,1)',
    args: [
      'SmartCommerce pair acceptance',
      apiKey.slice(0, 12),
      hashKey(apiKey),
      JSON.stringify(['orders:read', 'orders:write', 'products:read']),
    ],
  });

  const products = {};
  for (const definition of definitions) {
    const { rows: [existing] } = await db.execute({
      sql: 'SELECT id FROM products WHERE sku = ? LIMIT 1',
      args: [definition.sku],
    });
    let productId;
    if (existing) {
      productId = Number(existing.id);
      await db.execute({
        sql: 'UPDATE products SET name=?,price=?,cost=?,tax_rate=0,stock_qty=?,min_stock=0,active=1,online_available=1 WHERE id=?',
        args: [definition.name, definition.price, Math.max(1, definition.price / 2), definition.stock, productId],
      });
    } else {
      const result = await db.execute({
        sql: 'INSERT INTO products(sku,name,price,cost,tax_rate,stock_qty,min_stock,active,online_available) VALUES(?,?,?,?,0,?,0,1,1)',
        args: [definition.sku, definition.name, definition.price, Math.max(1, definition.price / 2), definition.stock],
      });
      productId = Number(result.lastInsertRowid);
    }
    await db.execute({
      sql: 'INSERT INTO branch_inventory(product_id,branch_id,stock_qty,min_stock) VALUES(?,?,?,0) ON CONFLICT(product_id,branch_id) DO UPDATE SET stock_qty=excluded.stock_qty,min_stock=0,updated_at=CURRENT_TIMESTAMP',
      args: [productId, Number(branch.id), definition.stock],
    });
    products[definition.key] = { id: productId, price: definition.price, stock: definition.stock };
  }

  const fixture = { branchId: Number(branch.id), apiKey, products };
  fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2));
  process.stdout.write(JSON.stringify({ branchId: fixture.branchId, productIds: Object.fromEntries(Object.entries(products).map(([key, value]) => [key, value.id])) }));
}

async function setPrice(productId, price) {
  await ensureReady();
  const id = Number(productId);
  const amount = Number(price);
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isFinite(amount) || amount < 0) throw new Error('Invalid set-price arguments');
  await db.execute({ sql: 'UPDATE products SET price=? WHERE id=?', args: [amount, id] });
  process.stdout.write(JSON.stringify({ id, price: amount }));
}

async function inspect(productId, externalOrderId) {
  await ensureReady();
  const id = Number(productId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid product id');
  const { rows: [stock] } = await db.execute({
    sql: 'SELECT stock_qty FROM branch_inventory WHERE product_id=? ORDER BY branch_id LIMIT 1',
    args: [id],
  });
  const { rows: [orders] } = await db.execute({
    sql: 'SELECT COUNT(*) AS count FROM transactions WHERE external_order_id=?',
    args: [String(externalOrderId)],
  });
  const { rows: [payments] } = await db.execute({
    sql: 'SELECT COUNT(*) AS count FROM transaction_payments p JOIN transactions t ON t.id=p.transaction_id WHERE t.external_order_id=?',
    args: [String(externalOrderId)],
  });
  process.stdout.write(JSON.stringify({
    stock: Number(stock?.stock_qty ?? -1),
    orders: Number(orders?.count ?? 0),
    payments: Number(payments?.count ?? 0),
  }));
}

const [command, ...args] = process.argv.slice(2);
const task =
  command === 'seed' ? seed() :
  command === 'set-price' ? setPrice(args[0], args[1]) :
  command === 'inspect' ? inspect(args[0], args[1]) :
  Promise.reject(new Error('Expected seed, set-price, or inspect command'));

task.then(() => process.exit(0)).catch((error) => {
  console.error(error && (error.stack || error.message || error));
  process.exit(1);
});
