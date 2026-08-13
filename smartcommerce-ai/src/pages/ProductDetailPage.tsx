import { CheckCircle2, Heart, MapPin, Star } from "lucide-react";
import Container from "../components/shared/Container";
import { getProductById } from "../data/products";
import { getCommerceDataMode } from "../data/providerMode";
import { money } from "../lib/format";
import { routeHref } from "../lib/router";
import { company } from "../styles/theme";

type Props = { id: string; wished: boolean; onWishlist: (id: string) => void; onAdd: (id: string) => void };

export default function ProductDetailPage({ id, wished, onWishlist, onAdd }: Props) {
  const product = getProductById(id);
  const connected = getCommerceDataMode() === "connected";
  if (!product) return <div className="demo-empty"><h1>Product not found</h1><a href={routeHref("/products")}>Return to products</a></div>;

  return (
    <div className="demo-page sc-product-detail">
      <Container className="demo-detail">
        <nav className="sc-detail-breadcrumbs"><a href={routeHref("/products")}>Products</a><span>/</span><a href={routeHref(`/category/${product.category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`)}>{product.category}</a><span>/</span><span>{product.name}</span></nav>
        <div className="demo-detail__gallery"><img src={product.image} alt={product.name} /><span>{connected ? product.badge : "Catalogue preview"}</span></div>
        <div className="demo-detail__content">
          <small>{product.category} · SKU {product.sku}</small>
          <h1>{product.name}</h1>
          {connected && product.rating > 0 && product.reviews > 0 ? <div className="demo-rating"><Star size={16} fill="currentColor" /> {product.rating} <span>{product.reviews} reviews</span></div> : null}
          <p>{product.description}</p>
          {connected ? <><strong className="demo-detail__price">{product.price > 0 ? money(product.price) : "Price unavailable"}</strong><p className="demo-available"><CheckCircle2 size={17} /> {product.stockStatus || "Availability unavailable"}</p></> : <div className="sc-detail-preview"><strong>Catalogue preview</strong><p>Live price, stock, reviews, and branch availability are intentionally withheld until a provider is connected.</p></div>}
          <div className="demo-detail__actions">
            {connected ? <button onClick={() => onAdd(product.id)}>Add to Cart</button> : <a href={routeHref(`/assistant?prompt=${encodeURIComponent(`Help me with ${product.name}`)}`)}>Ask about this product</a>}
            <button onClick={() => onWishlist(product.id)}><Heart size={18} fill={wished ? "currentColor" : "none"} /> {wished ? "Saved" : "Save"}</button>
          </div>
          <div className="sc-detail-mode-actions">
            {product.rentable ? <a href={routeHref(`/rentals?q=${encodeURIComponent(product.name)}`)}>Explore rental path</a> : null}
            <a href={routeHref(`/repairs?equipment=${encodeURIComponent(product.name)}`)}>I already own this · repair it</a>
            <a href={routeHref(`/commercial?mode=quote&item=${encodeURIComponent(product.name)}`)}>Commercial enquiry</a>
          </div>
        </div>
        <section className="demo-detail__specs"><h2>Specifications</h2>{Object.entries(product.specs).length ? Object.entries(product.specs).map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>) : <p>Specifications have not been supplied for this product.</p>}</section>
        <section className="demo-detail__services sc-detail-support">
          <div><MapPin /><strong>{company.branches.length} branch locations</strong><span>{company.branches.map((branch) => branch.name).join(" · ")}</span></div>
          <div><CheckCircle2 /><strong>Buy / rent / repair pathways</strong><span>SmartCommerce exposes only the actions supported by the current experience and data.</span></div>
          <div><Heart /><strong>Save and compare</strong><span>Keep useful products visible while you make the decision.</span></div>
        </section>
      </Container>
    </div>
  );
}
