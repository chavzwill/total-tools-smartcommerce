export type CatalogIntegrityIssue = {
  issueKey:string;
  type:string;
  severity:'info'|'warning'|'critical';
  productIds:string[];
  message:string;
  evidence?:Record<string,string|number|boolean|null>;
};
export type CatalogIntegrityReport = {
  scannedProducts:number;
  activeProducts:number;
  inactiveProducts:number;
  issueCount:number;
  criticalCount:number;
  warningCount:number;
  infoCount:number;
  issues:CatalogIntegrityIssue[];
  scannedAt:string;
};
export type CatalogIntegrityResponse = {
  report:CatalogIntegrityReport;
  source:{
    providerId:string;
    staleDays:number;
    truncated:boolean;
    scanLimit:number;
    stalenessEvidence:{
      activeProducts:number;
      timestampedActiveProducts:number;
      coveragePercent:number;
    };
  };
  error?:{code?:string;message?:string};
};
export type CatalogReviewClassification =
  |'confirmed_duplicate'
  |'obsolete_item'
  |'false_positive'
  |'provider_correction_required'
  |'cleanup_candidate'
  |'needs_investigation';
export type CatalogIntegrityReview={
  issue_key:string;
  issue_type:string;
  severity:string;
  product_ids:string[];
  classification:CatalogReviewClassification;
  review_state:string;
  note:string|null;
  evidence_reference:string|null;
  reviewer_employee_id:string;
  reviewer_username:string;
  first_reviewed_at:string;
  updated_at:string;
};

async function json<T>(res:Response,fallback:string){
  const payload=await res.json().catch(()=>({})) as T&{error?:{code?:string;message?:string}};
  if(!res.ok){const e=new Error(payload.error?.message||fallback) as Error&{status?:number;code?:string};e.status=res.status;e.code=payload.error?.code;throw e}
  return payload;
}
export async function loadCatalogIntegrity(staleDays=180){
  const res=await fetch(`/api/catalog-integrity?staleDays=${encodeURIComponent(String(staleDays))}`,{credentials:'same-origin',headers:{Accept:'application/json'}});
  return json<CatalogIntegrityResponse>(res,'Catalog integrity scan failed.');
}
export async function loadCatalogIntegrityReviews(){
  const res=await fetch('/api/catalog-integrity-reviews',{credentials:'same-origin',headers:{Accept:'application/json'}});
  return json<{reviews:CatalogIntegrityReview[]}>(res,'Catalog remediation reviews could not be loaded.');
}
export async function saveCatalogIntegrityReview(input:{issue:CatalogIntegrityIssue;classification:CatalogReviewClassification;note:string;evidenceReference?:string}){
  const res=await fetch('/api/catalog-integrity-reviews',{
    method:'POST',credentials:'same-origin',headers:{Accept:'application/json','Content-Type':'application/json'},
    body:JSON.stringify({
      issueKey:input.issue.issueKey,
      issueType:input.issue.type,
      severity:input.issue.severity,
      productIds:input.issue.productIds,
      classification:input.classification,
      note:input.note,
      evidenceReference:input.evidenceReference||undefined,
    }),
  });
  return json<{review:CatalogIntegrityReview}>(res,'Catalog remediation review could not be saved.');
}
