import crypto from "node:crypto";
import { createHardenedServerFetch, validateServerIntegrationBaseUrl } from "../server/hardenedOutboundFetch.js";

export type TTAICatalogAdvisory = {
  kind: "catalog_assist";
  status: "possible_catalog_matches" | "needs_clarification";
  answer: string;
  candidates: Array<{ id:string; name:string; brand:string|null; sku:string|null; category:string|null }>;
  evidence: { source:"smartcommerce_supplied_catalog"; independentlyVerified:false };
  branchStockVerified:false;
  compatibilityVerified:false;
  customerPricingVerified:false;
  purchaseApproved:false;
  request_id:string;
  tenant_id:string;
  provider:"total-tools-smartcommerce";
};

export async function requestTTAICatalogAdvisory({
  question,products,requestId=crypto.randomUUID(),fetchImpl,
}:{
  question:string;
  products:Array<{id:string;name:string;brand?:string;sku?:string;category?:string}>;
  requestId?:string;
  fetchImpl?:typeof fetch;
}):Promise<TTAICatalogAdvisory|undefined> {
  const raw=process.env.SMARTCOMMERCE_TT_AI_URL?.trim();
  const privatePem=process.env.SMARTCOMMERCE_TT_AI_SIGNING_PRIVATE_KEY?.replace(/\\n/g,"\n");
  const tenant=process.env.SMARTCOMMERCE_TT_AI_TENANT_ID?.trim();
  if(!raw || !privatePem || !tenant) return undefined;
  let base:URL,key:crypto.KeyObject;
  try {
    base=validateServerIntegrationBaseUrl(raw);
    key=crypto.createPrivateKey(privatePem);
  } catch {return undefined;}
  if(key.asymmetricKeyType!=="ed25519"||base.username||base.password||base.hash||base.search) return undefined;
  // No customer ID, email, order history, unit cost, margin or financial
  // information crosses this boundary. Catalog grounding stays with the
  // existing SmartCommerce/POS adapter and checkout workflows.
  const body={
    kind:"catalog_assist",
    question:String(question||"").trim().slice(0,500),
    products:products.slice(0,12).map(product=>({
      id:String(product.id).slice(0,80),
      name:String(product.name).slice(0,120),
      brand:String(product.brand||"").slice(0,80),
      sku:String(product.sku||"").slice(0,80),
      category:String(product.category||"").slice(0,80),
    })),
  };
  if(body.question.length<2) return undefined;
  const json=JSON.stringify(body);
  const now=Math.floor(Date.now()/1000),nonce=crypto.randomUUID();
  const claim={
    iss:"total-tools-smartcommerce",aud:"total-tools-ai-service",
    sub:"backend",tenant_id:tenant,scope:"public_catalog_advice",purpose:"catalog_assist",
    request_id:requestId,nonce,iat:now,exp:now+45,
    body_sha256:crypto.createHash("sha256").update(json).digest("hex"),
  };
  const input="v3."+Buffer.from(JSON.stringify(claim)).toString("base64url");
  const token=input+"."+crypto.sign(null,Buffer.from(input),key).toString("base64url");
  const transport=fetchImpl||createHardenedServerFetch({
    timeoutMs:4000,maxResponseBytes:64000,
  });
  try {
    const response=await transport(new URL("/v1/service/advice",base).toString(),{
      method:"POST",redirect:"error",
      headers:{"content-type":"application/json",accept:"application/json",
        authorization:"Bearer "+token},body:json,
    });
    if(!response.ok)return undefined;
    const result=await response.json() as Partial<TTAICatalogAdvisory>;
    if(result.kind!=="catalog_assist"||result.provider!=="total-tools-smartcommerce"
        ||result.tenant_id!==tenant||result.request_id!==requestId
        ||result.branchStockVerified!==false||result.customerPricingVerified!==false
        ||result.compatibilityVerified!==false||result.purchaseApproved!==false
        ||!Array.isArray(result.candidates)) return undefined;
    return result as TTAICatalogAdvisory;
  } catch {
    // Fail to existing grounded SmartCommerce recommendation flow; TT AI
    // does not govern or block checkout on an advisory network outage.
    return undefined;
  }
}
