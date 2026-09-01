import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Boxes, RefreshCw, ShieldCheck } from 'lucide-react';
import Container from '../components/shared/Container';
import { loadCatalogIntegrity, type CatalogIntegrityIssue, type CatalogIntegrityResponse } from '../services/catalogIntegrityClient';

const label=(value:string)=>value.replace(/_/g,' ').replace(/\b\w/g,(m)=>m.toUpperCase());

export default function CatalogIntegrityPage(){
 const [data,setData]=useState<CatalogIntegrityResponse|null>(null);const [loading,setLoading]=useState(true);const [message,setMessage]=useState('');const [staleDays,setStaleDays]=useState(180);
 async function load(){setLoading(true);setMessage('');try{setData(await loadCatalogIntegrity(staleDays))}catch(e){setMessage(e instanceof Error?e.message:'Catalog integrity could not be loaded.')}finally{setLoading(false)}}
 useEffect(()=>{void load()},[]);
 const ordered=useMemo(()=>[...(data?.report.issues||[])].sort((a,b)=>rank(a)-rank(b)),[data]);
 function rank(issue:CatalogIntegrityIssue){return issue.severity==='critical'?0:issue.severity==='warning'?1:2}
 const coverage=data?.source.stalenessEvidence.coveragePercent??0;
 return <div className="demo-page sc-operations-page"><Container>
  <header className="demo-page-heading"><span className="sc-flow-kicker">Inventory operations</span><h1>Catalog integrity</h1><p>Find duplicate, stale and contradictory product records before they affect search, quoting, stock decisions or checkout. This workspace is diagnostic only; it does not delete, merge or rewrite provider inventory.</p><div className="sc-form-actions"><label>Stale after<select value={staleDays} onChange={e=>setStaleDays(Number(e.target.value))}><option value={90}>90 days</option><option value={180}>180 days</option><option value={365}>365 days</option></select></label><button type="button" onClick={()=>void load()} disabled={loading}><RefreshCw size={16}/> Run scan</button></div></header>
  {message?<p className="sc-flow-status is-error" role="status">{message}</p>:null}
  {loading?<p>Scanning catalog integrity…</p>:null}
  {data?<><section className="demo-stats-grid"><article><strong>{data.report.scannedProducts}</strong><span>Products scanned</span></article><article><strong>{data.report.criticalCount}</strong><span>Critical conflicts</span></article><article><strong>{data.report.warningCount}</strong><span>Warnings</span></article><article><strong>{coverage}%</strong><span>Staleness evidence coverage</span></article></section>
  {data.source.truncated?<p className="sc-flow-status is-error"><AlertTriangle size={16}/> Scan reached the safety limit of {data.source.scanLimit} products. Review provider pagination before treating this as a complete catalog audit.</p>:null}
  {coverage<100?<p className="sc-flow-status is-warning"><AlertTriangle size={16}/> Staleness checks had timestamp evidence for {data.source.stalenessEvidence.timestampedActiveProducts} of {data.source.stalenessEvidence.activeProducts} active products ({coverage}%). A product without provider timestamp evidence cannot be declared fresh or stale.</p>:null}
  <section className="demo-flow-form"><div className="sc-commercial-review-heading"><ShieldCheck/><div><span className="sc-flow-kicker">Read-only diagnostic</span><h2>{data.report.issueCount?'Review required':'No detected integrity conflicts'}</h2><p>Provider: {data.source.providerId} · active {data.report.activeProducts} · inactive {data.report.inactiveProducts} · scanned {new Date(data.report.scannedAt).toLocaleString()}</p></div></div></section>
  <div className="sc-operations-stack">{ordered.length?ordered.map((issue,index)=><article className="demo-flow-form" key={`${issue.type}-${issue.productIds.join('-')}-${index}`}><div className="sc-commercial-review-heading"><Boxes/><div><span className={`sc-flow-kicker ${issue.severity==='critical'?'is-error':''}`}>{issue.severity} · {label(issue.type)}</span><h2>{issue.message}</h2><p>Product IDs: {issue.productIds.join(', ')}</p></div></div>{issue.evidence?<dl>{Object.entries(issue.evidence).map(([key,value])=><div key={key}><dt>{label(key)}</dt><dd>{String(value)}</dd></div>)}</dl>:null}</article>):<article className="demo-flow-form"><h2>No integrity findings</h2><p>No duplicate identifiers or contradictory pricing conditions were detected in the scanned catalog. Stale-record conclusions are limited by the timestamp coverage shown above.</p></article>}</div></>:null}
 </Container></div>
}
