import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const load=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [api,reviewApi,engine,page,client,app,guardAdapter,runtime]=await Promise.all([
  load('api/catalog-integrity.ts'),
  load('api/catalog-integrity-reviews.ts'),
  load('src/server/catalogIntegrity.ts'),
  load('src/pages/CatalogIntegrityPage.tsx'),
  load('src/services/catalogIntegrityClient.ts'),
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
guard('finding fingerprint is server generated',api,/createHash\("sha256"\)[\s\S]*findingKey/);
guard('finding fingerprint sorts product ids',api,/productIds[\s\S]*sort\(\)[\s\S]*stableEvidence/);
guard('scan registers observed findings',api,/catalog_integrity_findings[\s\S]*registerFindings[\s\S]*last_seen_at=NOW/);
guard('duplicate SKU detection exists',engine,/duplicate_sku/);
guard('duplicate barcode detection exists',engine,/duplicate_barcode/);
guard('probable duplicate detection exists',engine,/probable_duplicate_product/);
guard('missing price detection exists',engine,/missing_price/);
guard('invalid price detection exists',engine,/invalid_price/);
guard('stale record detection exists',engine,/stale_record/);
guard('inactive purchasable contradiction exists',engine,/inactive_but_purchasable/);
guard('operations route mounted',app,/\/operations\/catalog-integrity[\s\S]*CatalogIntegrityPage/);
guard('workspace declares controlled non-destructive behavior',page,/cannot delete, merge, archive or rewrite provider inventory/i);
guard('workspace warns when timestamp evidence is incomplete',page,/Staleness checks had timestamp evidence[\s\S]*cannot be declared fresh or stale/);
guard('review API requires staff session',reviewApi,/readStaffSession[\s\S]*STAFF_AUTH_REQUIRED/);
guard('review API requires inventory permission',reviewApi,/canStaff\(session,\s*"inventory"\)[\s\S]*INVENTORY_PERMISSION_REQUIRED/);
guard('review API accepts only GET and POST',reviewApi,/\["GET", "POST"\][\s\S]*METHOD_NOT_ALLOWED/);
guard('review classifications are allowlisted',reviewApi,/CLASSIFICATIONS\s*=\s*new Set[\s\S]*confirmed_duplicate[\s\S]*cleanup_candidate[\s\S]*false_positive/);
guard('review issue key must be fingerprint shape',reviewApi,/\^\[a-f0-9\]\{64\}\$/);
guard('review resolves finding from server registry',reviewApi,/FROM catalog_integrity_findings WHERE issue_key=\$\{issueKey\}/);
guard('unregistered findings fail closed',reviewApi,/FINDING_NOT_REGISTERED/);
guard('review uses registry issue metadata',reviewApi,/finding\.issue_type[\s\S]*finding\.severity[\s\S]*finding\.product_ids/);
guard('review note required for actionable decisions',reviewApi,/classification !== "false_positive"[\s\S]*REVIEW_NOTE_REQUIRED/);
guard('review ledger keeps immutable event table',reviewApi,/catalog_integrity_review_events[\s\S]*created_at TIMESTAMPTZ NOT NULL DEFAULT NOW/);
guard('current review and event write share one SQL statement',reviewApi,/WITH current_review AS[\s\S]*event_write AS[\s\S]*SELECT current_review/);
guard('review records staff identity',reviewApi,/reviewer_employee_id[\s\S]*reviewer_username[\s\S]*session\.employeeId[\s\S]*session\.username/);
guard('client posts server finding key',client,/issueKey:input\.issue\.issueKey/);
reject('client cannot submit authoritative issue metadata',client,/issueType:input|severity:input|productIds:input/);
guard('workspace shows prior reviewer and state',page,/Last reviewed by[\s\S]*reviewer_username[\s\S]*review_state/);
guard('workspace provides evidence reference',page,/Evidence \/ provider reference[\s\S]*evidenceReference/);
guard('normal product search filters inactive rows',guardAdapter,/query\?\.includeInactive[\s\S]*product\.active\s*!==\s*false/);
guard('explicit integrity scans may include inactive rows',guardAdapter,/query\?\.includeInactive\) return result/);
guard('direct inactive product reads fail closed',guardAdapter,/PRODUCT_INACTIVE[\s\S]*getProductById/);
guard('inactive products cannot pass availability checks',guardAdapter,/getInventoryAvailability[\s\S]*product\.data\.active\s*===\s*false/);
guard('configured Total Tools adapter is wrapped',runtime,/withActiveCatalogGuard\(createTotalToolsPosWriteAdapter/);
reject('diagnostic endpoint cannot mutate products',api,/createProduct|updateProduct|deleteProduct/);
reject('review endpoint cannot mutate provider products',reviewApi,/createProduct|updateProduct|deleteProduct|\/api\/products/);
reject('workspace has no destructive cleanup action',page,/delete product|merge products|auto[- ]?merge|auto[- ]?delete|archive product/i);

console.log(`Catalog integrity regression gate passed (${checks.length} invariants).`);
