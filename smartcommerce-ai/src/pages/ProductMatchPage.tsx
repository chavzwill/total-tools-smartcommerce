import { Camera, CheckCircle2, ImageUp, ScanSearch, Sparkles, Store, UserCheck } from "lucide-react";
import { ChangeEvent, useRef, useState } from "react";
import Container from "../components/shared/Container";
import toolsImage from "../assets/smartcommerce-tools-optimized.jpg";
import { getProducts } from "../data/products";
import { money } from "../lib/format";
import { go, routeHref } from "../lib/router";

type Props = { onAdd: (id: string) => void };
type MatchState = "idle" | "scanning" | "results";

export default function ProductMatchPage({ onAdd }: Props) {
  const products = getProducts();
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(toolsImage);
  const [state, setState] = useState<MatchState>("idle");
  const match = products.find((product) => product.id === "makita-dhp") || products[0];
  const alternatives = products.filter((product) => ["bosch-gbh", "milwaukee-impact"].includes(product.id));

  function scan() {
    setState("scanning");
    window.setTimeout(() => setState("results"), 1100);
  }
  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) setPreview(URL.createObjectURL(file));
    scan();
  }

  return (
    <div className="demo-page match-page">
      <section className="demo-page-hero match-hero"><Container><span>Signature AI Experience</span><h1>Product Match</h1><p>Upload a tool, part, label, or equipment photo. Total Tools AI finds the closest product, alternatives, accessories, availability, and pricing.</p></Container></section>
      <Container className="match-layout">
        <section className="match-upload">
          <div className="match-preview"><img src={preview} alt="Product Match preview" />{state === "scanning" && <div className="match-scanner"><ScanSearch size={38} /><strong>Scanning product details...</strong><span>Comparing shape, label, category, and local inventory</span></div>}</div>
          <h2>Show us what you need</h2><p>Use an existing photo or open your device camera.</p>
          <div className="match-upload__actions"><button onClick={() => uploadRef.current?.click()}><ImageUp size={18} /> Upload Photo</button><button onClick={() => cameraRef.current?.click()}><Camera size={18} /> Use Camera</button></div>
          <input ref={uploadRef} type="file" accept="image/*" onChange={choose} hidden /><input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={choose} hidden />
          {state === "idle" && <button className="match-demo-button" onClick={scan}><Sparkles size={17} /> Run sample match</button>}
        </section>
        <section className="match-results" aria-live="polite">
          {state !== "results" ? <div className="match-waiting"><ScanSearch size={36} /><h2>Your match results appear here</h2><p>Try the sample match to see the complete executive demo flow.</p></div> : <>
            <header><div><CheckCircle2 size={22} /><span>AI match complete</span></div><strong>94% confidence</strong></header>
            <article className="match-best"><img src={match.image} alt={match.name} /><div><span>Closest match</span><h2>{match.name}</h2><p>{match.stockStatus}</p><strong>{money(match.price)}</strong><div><button onClick={() => onAdd(match.id)}>Add to Cart</button><a href={routeHref(`/product/${match.id}`)}>Quick View</a></div></div></article>
            <div className="match-availability"><Store size={20} /><div><strong>Branch availability</strong><span>Ocho Rios, Kingston, Drax Hall</span></div></div>
            <h3>Similar alternatives</h3><div className="match-alternatives">{alternatives.map((product) => <a href={routeHref(`/product/${product.id}`)} key={product.id}><img src={product.image} alt={product.name} /><span>{product.name}</span><strong>{money(product.price)}</strong></a>)}</div>
            <h3>Recommended accessories</h3><div className="match-accessories"><span>5.0Ah Battery Twin Pack</span><span>Masonry Drill Bit Set</span><span>Trade Tool Case</span></div>
            <button className="match-verify" onClick={() => go(`/assistant?prompt=${encodeURIComponent(`Please verify this match: ${match.name}`)}`)}><UserCheck size={18} /> Ask staff to verify</button>
          </>}
        </section>
      </Container>
    </div>
  );
}
