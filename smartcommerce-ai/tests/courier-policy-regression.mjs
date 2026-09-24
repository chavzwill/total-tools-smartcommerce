import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const code = ts.transpileModule(await readFile(new URL('../src/server/couriers/policy.ts', import.meta.url), 'utf8'), {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {normalizeApplication,canReviewCouriers,nextApplicationStatus} = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
assert.equal(canReviewCouriers(null), false);
assert.equal(canReviewCouriers({permissions:{reports:true}}), false);
assert.equal(canReviewCouriers({permissions:{couriers_manage:true}}), true);
assert.equal(canReviewCouriers({permissions:{couriers_manage:'true'}}), false);
const transitions = {draft:{submit:'submitted'},rejected:{submit:'submitted'},submitted:{approve:'approved',reject:'rejected'},approved:{suspend:'suspended'},suspended:{reinstate:'approved'}};
for(const state of Object.keys(transitions)) for(const action of ['submit','approve','reject','suspend','reinstate']) {
  const expected=transitions[state][action];
  if(expected) assert.equal(nextApplicationStatus(state,action),expected);
  else assert.throws(()=>nextApplicationStatus(state,action));
}
const valid={businessName:' Courier business ',contactName:'Courier owner',email:'owner@example.test',phone:'+18765551234',description:'Deliveries'};
assert.equal(normalizeApplication(valid).businessName,'Courier business');
for(const bad of [null,[],{}, {...valid,status:'approved'},{...valid,ownerCustomerId:'another'},{...valid,email:'invalid'},{...valid,phone:'12'},{...valid,businessName:'x'.repeat(121)}]) assert.throws(()=>normalizeApplication(bad));
console.log('Courier application validation and complete transition matrix passed.');
