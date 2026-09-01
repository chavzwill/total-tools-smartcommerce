import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const load=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [api,engine,page,app,guardAdapter,runtime]=await Promise.all([
  load('api/catalog-integrity.ts'),
  load('src/server/catalogIntegrity.ts'),
  load('src/pages/CatalogIntegrityPage.tsx'),
  load('src/App.tsx'),
  load('src/integrations/activeCatalogGuardAdapter.ts'),
  load('src/integrations/totalToolsPlatformRuntime.ts'),
]);

const checks=[];
function guard(name,source,pattern){checks.push(name);assert.match(source,pattern,`${name} invariant missing`)}
function reject(name,source,pattern){checks.push(name);assert.doesNotMatch(source,pattern,`${name} forbidden behavior present`)}

guard('GET-only diagnostic endpoint',api,/method[^\n]*GET[\s\S]*METHOD_NOT_ALLOWED/);
guard('staff session required',api,/readStaffSession[\s\S]*STAFF_AUTH_REQUIRED/);
guard('inventory permission required',api,/canStaff\(session,\s*"inventory"\)[\s\S]*INVENTORY_PERMISSION_REQUIRED/);
guard('inactive products included in scan',api,/includeInactive:\s*true/);
guard('scan is bounded by max pages',api,/MAX_PAGES\s*=\s*20[\s\S]*MAX_PRODUCTS/);
guard('stale threshold is bounded',api,/Math\.max\(30,\s*Math\.min\(730/);
guard('staleness evidence coverage is calculated',api,/timestampedActiveProducts[\s\S]*coveragePercent/);
guard('duplicate SKU detection exists',engine,/duplicate_sku/);
guard('duplicate barcode detection exists',engine,/duplicate_barcode/);
guard('probable duplicate detection exists',engine,/probable_duplicate_product/);
guard('missing price detection exists',engine,/missing_price/);
guard('invalid price detection exists',engine,/invalid_price/);
guard('stale record detection exists',engine,/stale_record/);
guard('inactive purchasable contradiction exists',engine,/inactive_but_purchasable/);
guard('operations route mounted',app,/\/operations\/catalog-integrity[\s\S]*CatalogIntegrityPage/);
guard('workspace declares diagnostic-only behavior',page,/diagnostic only[\s\S]*does not delete, merge or rewrite provider inventory/i);
guard('workspace warns when timestamp evidence is incomplete',page,/Staleness checks had timestamp evidence[\s\S]*cannot be declared fresh or stale/);
guard('normal product search filters inactive rows',guardAdapter,/query\?\.includeInactive[\s\S]*product\.active\s*!==\s*false/);
guard('explicit integrity scans may include inactive rows',guardAdapter,/query\?\.includeInactive\) return result/);
guard('direct inactive product reads fail closed',guardAdapter,/PRODUCT_INACTIVE[\s\S]*getProductById/);
guard('inactive products cannot pass availability checks',guardAdapter,/getInventoryAvailability[\s\S]*product\.data\.active\s*===\s*false/);
guard('configured Total Tools adapter is wrapped',runtime,/withActiveCatalogGuard\(createTotalToolsPosWriteAdapter/);
reject('endpoint cannot mutate products',api,/createProduct|updateProduct|deleteProduct/);
reject('workspace has no destructive cleanup action',page,/delete product|merge products|auto[- ]?merge|auto[- ]?delete/i);

console.log(`Catalog integrity regression gate passed (${checks.length} invariants).`);
