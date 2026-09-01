import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Boxes, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import Container from '../components/shared/Container';
import {
  approveCatalogCleanupPlan,
  loadCatalogCleanupPlans,
  loadCatalogIntegrity,
  loadCatalogIntegrityReviews,
  prepareCatalogCleanupPlan,
  saveCatalogIntegrityReview,
  type CatalogCleanupPlan,
  type CatalogIntegrityIssue,
  type CatalogIntegrityResponse,
  type CatalogIntegrityReview,
  type CatalogReviewClassification,
} from '../services/catalogIntegrityClient';

const label=(value:string)=>value.replace(/_/g,' ').replace(/\b\w/g,(m)=>m.toUpperCase());
const CLASSIFICATIONS:CatalogReviewClassification[]=['needs_investigation','confirmed_duplicate','obsolete_item','provider_correction_required','cleanup_candidate','false_positive'];

type Draft={classification:CatalogReviewClassification;note:string;evidenceReference:string};
type CleanupDraft={actionType:'archive'|'merge';targetProductId:string;note:string};
const emptyDraft=():Draft=>({classification:'needs_investigation',note:'',evidenceReference:''});
const emptyCleanupDraft=():CleanupDraft=>({actionType:'archive',targetProductId:'',note:''});

export default function CatalogIntegrityPage(){
 const [data,setData]=useState<CatalogIntegrityResponse|null>(null);
 const [reviews,setReviews]=useState<Record<string,CatalogIntegrityReview>>({});
 const [plans,setPlans]=useState<Record<string,CatalogCleanupPlan>>({});
 const [drafts,setDrafts]=useState<Record<string,Draft>>({});
 const [cleanupDrafts,setCleanupDrafts]=useState<Record<string,CleanupDraft>>({});
 const [approvalNotes,setApprovalNotes]=useState<Record<string,string>>({});
 const [saving,setSaving]=useState<string>('');
 const [planning,setPlanning]=useState<string>('');
 const [loading,setLoading]=useState(true);
 const [message,setMessage]=useState('');
 const [staleDays,setStaleDays]=useState(180);

 async function load(){
  setLoading(true);setMessage('');
  try{
   const [scan,reviewData,planData]=await Promise.all([loadCatalogIntegrity(staleDays),loadCatalogIntegrityReviews(),loadCatalogCleanupPlans()]);
   setData(scan);
   const nextReviews:Record<string,CatalogIntegrityReview>={};
   for(const review of reviewData.reviews||[])nextReviews[review.issue_key]=review;
   setReviews(nextReviews);
   const nextPlans:Record<string,CatalogCleanupPlan>={};
   for(const plan of planData.plans||[])nextPlans[plan.issue_key]=plan;
   setPlans(nextPlans);
  }catch(e){setMessage(e instanceof Error?e.message:'Catalog integrity could not be loaded.')}finally{setLoading(false)}
 }
 useEffect(()=>{void load()},[]);
 const ordered=useMemo(()=>[...(data?.report.issues||[])].sort((a,b)=>rank(a)-rank(b)),[data]);
 function rank(issue:CatalogIntegrityIssue){return issue.severity==='critical'?0:issue.severity==='warning'?1:2}
 const coverage=data?.source.stalenessEvidence.coveragePercent??0;
 function draftFor(issue:CatalogIntegrityIssue):Draft{
  const existing=drafts[issue.issueKey];if(existing)return existing;
  const review=reviews[issue.issueKey];
  return review?{classification:review.classification,note:review.note||'',evidenceReference:review.evidence_reference||''}:emptyDraft();
 }
 function cleanupDraftFor(issue:CatalogIntegrityIssue):CleanupDraft{
  const existing=cleanupDrafts[issue.issueKey];if(existing)return existing;
  return {...emptyCleanupDraft(),targetProductId:issue.productIds[0]||''};
 }
 function patchDraft(issue:CatalogIntegrityIssue,patch:Partial<Draft>){setDrafts(current=>({...current,[issue.issueKey]:{...draftFor(issue),...patch}}))}
 function patchCleanupDraft(issue:CatalogIntegrityIssue,patch:Partial<CleanupDraft>){setCleanupDrafts(current=>({...current,[issue.issueKey]:{...cleanupDraftFor(issue),...patch}}))}
 async function save(issue:CatalogIntegrityIssue){
  const draft=draftFor(issue);setSaving(issue.issueKey);setMessage('');
  try{
   const result=await saveCatalogIntegrityReview({issue,classification:draft.classification,note:draft.note,evidenceReference:draft.evidenceReference});
   setReviews(current=>({...current,[issue.issueKey]:result.review}));
   setMessage(`Review saved for ${issue.productIds.join(', ')}.`);
  }catch(e){setMessage(e instanceof Error?e.message:'Review could not be saved.')}finally{setSaving('')}
 }
 async function preparePlan(issue:CatalogIntegrityIssue){
  const draft=cleanupDraftFor(issue);setPlanning(issue.issueKey);setMessage('');
  try{
   const result=await prepareCatalogCleanupPlan({issueKey:issue.issueKey,actionType:draft.actionType,targetProductId:draft.actionType==='merge'?draft.targetProductId:undefined,note:draft.note});
   setPlans(current=>({...current,[issue.issueKey]:result.plan}));
   setMessage(`Cleanup plan prepared for ${issue.productIds.join(', ')}. Independent approval is still required.`);
  }catch(e){setMessage(e instanceof Error?e.message:'Cleanup plan could not be prepared.')}finally{setPlanning('')}
 }
 async function approvePlan(plan:CatalogCleanupPlan){
  const note=approvalNotes[plan.id]||'';setPlanning(plan.id);setMessage('');
  try{
   const result=await approveCatalogCleanupPlan({planId:plan.id,note});
   setPlans(current=>({...current,[plan.issue_key]:result.plan}));
   setMessage('Second approval recorded. The plan remains non-executable.');
  }catch(e){setMessage(e instanceof Error?e.message:'Cleanup plan could not be approved.')}finally{setPlanning('')}
 }

 return <div className="demo-page sc-operations-page"><Container>
  <header className="demo-page-heading"><span className="sc-flow-kicker">Inventory operations</span><h1>Catalog integrity</h1><p>Find duplicate, stale and contradictory product records before they affect search, quoting, stock decisions or checkout. Staff can classify findings, inspect dependencies and prepare two-stage cleanup plans here, but this workspace still cannot delete, merge, archive or rewrite provider inventory.</p><div className="sc-form-actions"><label>Stale after<select value={staleDays} onChange={e=>setStaleDays(Number(e.target.value))}><option value={90}>90 days</option><option value={180}>180 days</option><option value={365}>365 days</option></select></label><button type="button" onClick={()=>void load()} disabled={loading}><RefreshCw size={16}/> Run scan</button></div></header>
  {message?<p className="sc-flow-status" role="status">{message}</p>:null}
  {loading?<p>Scanning catalog integrity…</p>:null}
  {data?<><section className="demo-stats-grid"><article><strong>{data.report.scannedProducts}</strong><span>Products scanned</span></article><article><strong>{data.report.criticalCount}</strong><span>Critical conflicts</span></article><article><strong>{Object.keys(reviews).length}</strong><span>Reviewed findings</span></article><article><strong>{coverage}%</strong><span>Staleness evidence coverage</span></article></section>
  {data.source.truncated?<p className="sc-flow-status is-error"><AlertTriangle size={16}/> Scan reached the safety limit of {data.source.scanLimit} products. Review provider pagination before treating this as a complete catalog audit.</p>:null}
  {coverage<100?<p className="sc-flow-status is-warning"><AlertTriangle size={16}/> Staleness checks had timestamp evidence for {data.source.stalenessEvidence.timestampedActiveProducts} of {data.source.stalenessEvidence.activeProducts} active products ({coverage}%). A product without provider timestamp evidence cannot be declared fresh or stale.</p>:null}
  <section className="demo-flow-form"><div className="sc-commercial-review-heading"><ShieldCheck/><div><span className="sc-flow-kicker">Controlled remediation review</span><h2>{data.report.issueCount?'Review required':'No detected integrity conflicts'}</h2><p>Provider: {data.source.providerId} · active {data.report.activeProducts} · inactive {data.report.inactiveProducts} · scanned {new Date(data.report.scannedAt).toLocaleString()}</p></div></div></section>
  <div className="sc-operations-stack">{ordered.length?ordered.map((issue)=>{
   const review=reviews[issue.issueKey];const draft=draftFor(issue);const plan=plans[issue.issueKey];const cleanup=cleanupDraftFor(issue);
   const cleanupCandidate=review?.classification==='cleanup_candidate'&&review.review_state==='approved_for_cleanup';
   return <article className="demo-flow-form" key={issue.issueKey}>
    <div className="sc-commercial-review-heading"><Boxes/><div><span className={`sc-flow-kicker ${issue.severity==='critical'?'is-error':''}`}>{issue.severity} · {label(issue.type)}</span><h2>{issue.message}</h2><p>Product IDs: {issue.productIds.join(', ')}</p>{review?<p>Last reviewed by {review.reviewer_username} · {label(review.review_state)} · {new Date(review.updated_at).toLocaleString()}</p>:<p>Not yet reviewed.</p>}</div></div>
    {issue.evidence?<dl>{Object.entries(issue.evidence).map(([key,value])=><div key={key}><dt>{label(key)}</dt><dd>{String(value)}</dd></div>)}</dl>:null}
    <div className="sc-form-grid">
     <label>Classification<select value={draft.classification} onChange={e=>patchDraft(issue,{classification:e.target.value as CatalogReviewClassification})}>{CLASSIFICATIONS.map(value=><option key={value} value={value}>{label(value)}</option>)}</select></label>
     <label>Evidence / provider reference<input value={draft.evidenceReference} maxLength={300} onChange={e=>patchDraft(issue,{evidenceReference:e.target.value})} placeholder="Ticket, count sheet, supplier note, POS reference…"/></label>
     <label className="sc-form-field-wide">Review note<textarea value={draft.note} maxLength={1000} rows={3} onChange={e=>patchDraft(issue,{note:e.target.value})} placeholder="Explain what was checked and why this classification is appropriate."/></label>
    </div>
    <div className="sc-form-actions"><button type="button" onClick={()=>void save(issue)} disabled={saving===issue.issueKey}><Save size={16}/>{saving===issue.issueKey?' Saving…':review?' Update review':' Save review'}</button></div>
    {cleanupCandidate?<section className="sc-commercial-review-panel"><span className="sc-flow-kicker">Cleanup planning</span>{plan?<><h3>{label(plan.status)}</h3><p>{label(plan.action_type)} plan prepared by {plan.prepared_by_username}. Execution enabled: {plan.execution_enabled?'Yes':'No'}.</p>{plan.status==='awaiting_second_approval'?<><label>Independent approval note<textarea rows={2} maxLength={1200} value={approvalNotes[plan.id]||''} onChange={e=>setApprovalNotes(current=>({...current,[plan.id]:e.target.value}))}/></label><div className="sc-form-actions"><button type="button" onClick={()=>void approvePlan(plan)} disabled={planning===plan.id}>Second approve plan</button></div></>:<p>Second approval recorded by {plan.approved_by_username||'authorized reviewer'}. This plan is intentionally not executable.</p>}</>:<><div className="sc-form-grid"><label>Proposed action<select value={cleanup.actionType} onChange={e=>patchCleanupDraft(issue,{actionType:e.target.value as 'archive'|'merge'})}><option value="archive">Archive plan</option><option value="merge">Merge plan</option></select></label>{cleanup.actionType==='merge'?<label>Surviving product<select value={cleanup.targetProductId} onChange={e=>patchCleanupDraft(issue,{targetProductId:e.target.value})}>{issue.productIds.map(id=><option key={id} value={id}>{id}</option>)}</select></label>:null}<label className="sc-form-field-wide">Preparation note<textarea rows={3} maxLength={1200} value={cleanup.note} onChange={e=>patchCleanupDraft(issue,{note:e.target.value})} placeholder="Explain the proposed cleanup and why dependency inspection should be performed."/></label></div><div className="sc-form-actions"><button type="button" onClick={()=>void preparePlan(issue)} disabled={planning===issue.issueKey}>Prepare dependency-checked plan</button></div></>}</section>:null}
   </article>
  }):<article className="demo-flow-form"><h2>No integrity findings</h2><p>No duplicate identifiers or contradictory pricing conditions were detected in the scanned catalog. Stale-record conclusions are limited by the timestamp coverage shown above.</p></article>}</div></>:null}
 </Container></div>
}
