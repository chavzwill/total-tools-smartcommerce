import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../api/catalog-cleanup-plans.ts',import.meta.url),'utf8');
const checks=[];
function guard(name,pattern){checks.push(name);assert.match(source,pattern,`${name} invariant missing`)}
function reject(name,pattern){checks.push(name);assert.doesNotMatch(source,pattern,`${name} forbidden behavior present`)}
guard('inventory delete authority required',/canStaff\(session,"inventory_delete"\)/);
guard('cleanup candidate required',/classification!=="cleanup_candidate"[\s\S]*approved_for_cleanup/);
guard('fresh scan required',/24\*60\*60\*1000[\s\S]*FRESH_SCAN_REQUIRED/);
guard('dependency snapshot required before plan',/inspectDependencies\(productIds\)/);
guard('only archive or merge plans allowed',/\["archive","merge"\]/);
guard('merge target must be affected product',/MERGE_TARGET_REQUIRED/);
guard('second approval requires security management',/canStaff\(session,"security_manage"\)/);
guard('preparer cannot self approve',/INDEPENDENT_APPROVER_REQUIRED/);
guard('approved plan remains non executable',/approved_not_executable[\s\S]*execution_enabled=FALSE/);
guard('planning keeps immutable event ledger',/catalog_cleanup_plan_events[\s\S]*prepared[\s\S]*second_approved/);
guard('dependency calls are hardened',/createHardenedServerFetch[\s\S]*validateServerIntegrationBaseUrl/);
reject('no cleanup execution action exists',/action==="execute"|executeCleanup|archiveProduct|mergeProduct|DELETE FROM products|UPDATE products SET active/);
console.log(`Catalog cleanup planning regression gate passed (${checks.length} invariants).`);
