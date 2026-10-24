import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source=fs.readFileSync(new URL("../src/integrations/ttAiAdvice.ts",import.meta.url),"utf8");
const output=ts.transpileModule(source,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,
}}).outputText;
const module={exports:{}};
const sandbox={
  module,exports:module.exports,process,Buffer,URL,
  require(specifier) {
    if(specifier==="node:crypto")return crypto;
    if(specifier.endsWith("hardenedOutboundFetch.js"))return{
      validateServerIntegrationBaseUrl:url=>new URL(url),
      createHardenedServerFetch:()=>{throw Error("mock fetch must be injected");},
    };
    throw Error("unexpected runtime import: "+specifier);
  },
};
vm.runInNewContext(output,sandbox,{filename:"ttAiAdvice.transpiled.js"});
const {requestTTAICatalogAdvisory}=module.exports;
const keypair=crypto.generateKeyPairSync("ed25519");
const privatePem=keypair.privateKey.export({format:"pem",type:"pkcs8"});
const previously={
  URL:process.env.SMARTCOMMERCE_TT_AI_URL,
  KEY:process.env.SMARTCOMMERCE_TT_AI_SIGNING_PRIVATE_KEY,
  TENANT:process.env.SMARTCOMMERCE_TT_AI_TENANT_ID,
};
function config(){
  process.env.SMARTCOMMERCE_TT_AI_URL="https://tt-ai.example.test";
  process.env.SMARTCOMMERCE_TT_AI_SIGNING_PRIVATE_KEY=privatePem;
  process.env.SMARTCOMMERCE_TT_AI_TENANT_ID="total-tools";
}
function restore(){
  for(const [env,val] of [
    ["SMARTCOMMERCE_TT_AI_URL",previously.URL],
    ["SMARTCOMMERCE_TT_AI_SIGNING_PRIVATE_KEY",previously.KEY],
    ["SMARTCOMMERCE_TT_AI_TENANT_ID",previously.TENANT],
  ])if(val===undefined)delete process.env[env];else process.env[env]=val;
}
const products=[{id:"P1",name:"ECHO Air Filter",brand:"ECHO",sku:"AF-1",
  price:100,stock_qty:55,supplierCost:20}];
config();
try {
  let called=false;
  const result=await requestTTAICatalogAdvisory({
    question:"ECHO air filter",products,requestId:"smartcommerce-test-1",
    fetchImpl:async(url,options)=>{
      called=true;
      assert.equal(url,"https://tt-ai.example.test/v1/service/advice");
      assert.equal(options.method,"POST");
      const [version,body,sig]=options.headers.authorization.slice(7).split(".");
      assert.equal(version,"v3");
      assert.ok(crypto.verify(null,Buffer.from(version+"."+body),
        keypair.publicKey,Buffer.from(sig,"base64url")));
      const claims=JSON.parse(Buffer.from(body,"base64url").toString("utf8"));
      assert.equal(claims.iss,"total-tools-smartcommerce");
      assert.equal(claims.scope,"public_catalog_advice");
      assert.equal(claims.tenant_id,"total-tools");
      assert.equal(claims.request_id,"smartcommerce-test-1");
      assert.equal(claims.body_sha256,
        crypto.createHash("sha256").update(options.body).digest("hex"));
      assert.equal(options.body.includes("supplierCost"),false);
      assert.equal(options.body.includes("stock_qty"),false);
      assert.equal(options.body.includes('"price"'),false);
      return {ok:true,json:async()=>({
        kind:"catalog_assist",tenant_id:"total-tools",provider:"total-tools-smartcommerce",
        request_id:"smartcommerce-test-1",status:"possible_catalog_matches",
        answer:"possible matches",candidates:[{id:"P1",name:"ECHO Air Filter"}],
        branchStockVerified:false,customerPricingVerified:false,
        compatibilityVerified:false,purchaseApproved:false,
      })};
    },
  });
  assert.equal(called,true);
  assert.equal(result?.candidates[0].id,"P1");

  const spoof=await requestTTAICatalogAdvisory({
    question:"ECHO air filter",products,requestId:"smartcommerce-test-2",
    fetchImpl:async()=>({ok:true,json:async()=>({
      kind:"catalog_assist",tenant_id:"other-tenant",provider:"total-tools-spendos",
      request_id:"fake",candidates:[],
      branchStockVerified:true,customerPricingVerified:true,compatibilityVerified:true,
      purchaseApproved:true,
    })}),
  });
  assert.equal(spoof,undefined);
  delete process.env.SMARTCOMMERCE_TT_AI_SIGNING_PRIVATE_KEY;
  const disabled=await requestTTAICatalogAdvisory({question:"ECHO air filter",products});
  assert.equal(disabled,undefined);
  console.log("TT AI customer-side service client regression passed: signed request, PII/price exclusion, spoof-denial, fail-open existing commerce.");
} finally {restore();}
