export type CatalogIntegrityIssue = {
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

export async function loadCatalogIntegrity(staleDays=180){
  const res=await fetch(`/api/catalog-integrity?staleDays=${encodeURIComponent(String(staleDays))}`,{credentials:'same-origin',headers:{Accept:'application/json'}});
  const payload=await res.json().catch(()=>({})) as CatalogIntegrityResponse;
  if(!res.ok){const e=new Error(payload.error?.message||'Catalog integrity scan failed.') as Error&{status?:number;code?:string};e.status=res.status;e.code=payload.error?.code;throw e}
  return payload;
}
