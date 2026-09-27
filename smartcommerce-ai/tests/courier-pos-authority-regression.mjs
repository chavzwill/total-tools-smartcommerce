import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import ts from 'typescript';
const source=await readFile(new URL('../src/server/couriers/authority.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {courierAuthorityError}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
for(const action of ['approve','reject','suspend','reinstate','review_document','review_bank','payout_status'])assert.equal(courierAuthorityError(action),'COURIER_POS_AUTHORITY_REQUIRED');
for(const action of ['issue_pass','scan_pass','confirm_pickup','accept','assign','update_status','request_payout'])assert.equal(courierAuthorityError(action),'COURIER_POS_VERIFICATION_PENDING');
for(const action of ['create_application','save_application','submit_application','upload_document','save_bank','revoke_pass'])assert.equal(courierAuthorityError(action),null);
console.log('POS owns registration decisions; registration uploads remain available and unverified operational access is blocked.');
