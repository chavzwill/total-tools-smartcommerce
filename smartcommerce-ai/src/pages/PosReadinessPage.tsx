import { AlertTriangle, CheckCircle2, Database, Loader2, RefreshCcw, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import Container from "../components/shared/Container";

type Readiness = {
  configured: Record<string, boolean>;
  connected: boolean;
  provider: string;
  checkedAt: string;
  branchCount: number;
  capabilities: Record<string, boolean>;
  blockers: string[];
};

function label(value: string) {
  return value.replace(/_/g, " ").toLowerCase().replace(/(^|\s)\w/g, (m) => m.toUpperCase());
}

export default function PosReadinessPage() {
  const [data, setData] = useState<Readiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/pos-readiness", { credentials: "include", headers: { Accept: "application/json" } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || "POS readiness could not be loaded.");
      setData(payload);
    } catch (err: any) { setError(err?.message || "POS readiness could not be loaded."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  return <div className="demo-page">
    <section className="demo-page-hero"><Container><span>Operations / Integrations</span><h1>POS integration readiness</h1><p>Live view of what SmartCommerce can currently trust from the Total Tools POS and what still blocks full two-way commerce.</p></Container></section>
    <Container className="demo-page-content">
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:16}}><button className="button-secondary" onClick={() => void load()} disabled={loading}><RefreshCcw size={16}/>{loading?"Checking…":"Refresh"}</button></div>
      {loading && !data ? <div className="demo-empty"><Loader2 className="sc-spin"/><h2>Checking POS integration…</h2></div> : null}
      {error ? <div className="demo-empty"><AlertTriangle/><h2>Readiness unavailable</h2><p>{error}</p></div> : null}
      {data ? <>
        <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:12,marginBottom:18}}>
          <article className="demo-card"><Database/><strong>{data.provider}</strong><span>{data.connected?"Connected":"Not connected"}</span></article>
          <article className="demo-card"><strong>{data.branchCount}</strong><span>Branches returned by POS</span></article>
          <article className="demo-card"><strong>{data.blockers.length}</strong><span>Production blockers</span></article>
        </section>
        <section className="demo-card" style={{marginBottom:18}}><h2>Configuration</h2><div style={{display:"grid",gap:10}}>{Object.entries(data.configured).map(([key,ok])=><div key={key} style={{display:"flex",alignItems:"center",gap:10}}>{ok?<CheckCircle2 size={18}/>:<XCircle size={18}/>}<span>{label(key)}</span></div>)}</div></section>
        <section className="demo-card" style={{marginBottom:18}}><h2>Capabilities</h2><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:10}}>{Object.entries(data.capabilities).map(([key,ok])=><div key={key} style={{display:"flex",alignItems:"center",gap:10}}>{ok?<CheckCircle2 size={18}/>:<XCircle size={18}/>}<span>{label(key)}</span></div>)}</div></section>
        <section className="demo-card"><h2>Remaining blockers</h2>{data.blockers.length?<div style={{display:"grid",gap:10}}>{data.blockers.map((item)=><div key={item} style={{display:"flex",alignItems:"center",gap:10}}><AlertTriangle size={18}/><span>{label(item)}</span></div>)}</div>:<div style={{display:"flex",alignItems:"center",gap:10}}><CheckCircle2 size={18}/><span>No POS readiness blockers reported.</span></div>}</section>
      </> : null}
    </Container>
  </div>;
}
