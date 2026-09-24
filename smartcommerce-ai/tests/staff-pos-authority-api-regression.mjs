import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
const nativeRequire=createRequire(import.meta.url);
const queries=[];let outbound=0;
const session={employeeId:'staff-test',role:'admin',permissions:{work_orders:true,wo_assess:true}};
function load(path){
 const exports={};const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const require=(name)=>{
  if(name.includes('staffApprovalAuthority'))return load('src/server/staffApprovalAuthority.ts');
  if(name==='@neondatabase/serverless')return {neon:()=>async(strings)=>{queries.push(strings.join('?'));return [];}};
  if(name.includes('staffSession'))return {parseCookie:()=>({staff:'test'}),readStaffSession:()=>session,STAFF_COOKIE_NAME:'staff',canStaff:()=>true};
  if(name.includes('securityInfrastructure'))return {firstHeader:v=>v,recordSecurityEvent:async()=>{}};
  if(name.includes('hardenedOutboundFetch'))return {validateServerIntegrationBaseUrl:()=>new URL('https://pos.invalid'),createHardenedServerFetch:()=>async()=>{outbound++;throw Error('unexpected outbound');}};
  if(name.includes('technicianCompensation'))return {};
  return nativeRequire(name);
 };
 vm.runInNewContext(code,{exports,require,Buffer,URL,console,process:{env:{SMARTCOMMERCE_DATABASE_URL:'test-only'}},Date});return exports;
}
for(const [path,actions] of [['api/technician-compensation.ts',['approve_period','finalize_period']],['api/repair-authorizations.ts',['record_decision']]]){
 const handler=load(path).default;
 for(const action of actions){queries.length=0;let result;const req={method:'POST',headers:{},query:{workOrderId:'test'},async *[Symbol.asyncIterator](){yield JSON.stringify({action,decision:'approved',periodId:'test'});}};const res={setHeader(){},end(v){result=JSON.parse(v);}};
 await handler(req,res);assert.equal(res.statusCode,409);assert.equal(result.error.code,'STAFF_POS_AUTHORITY_REQUIRED');assert.ok(!queries.some(q=>/^\s*(INSERT|UPDATE|DELETE)\b/i.test(q)));
 }
}
const gateway=load('api/operations/[...path].ts').default;
for(const method of ['POST','PUT','PATCH','DELETE']){const res={setHeader(){},end(v){this.payload=JSON.parse(v);}};await gateway({method,headers:{},query:{path:['purchase-orders','test']},body:{status:'approved'}},res);assert.equal(res.statusCode,409);assert.equal(res.payload.error.code,'STAFF_POS_AUTHORITY_REQUIRED');}
assert.equal(outbound,0);
console.log('Authenticated staff approval requests blocked before data mutation or upstream dispatch.');
