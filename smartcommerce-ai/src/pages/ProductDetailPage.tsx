import { CheckCircle2, Heart, MapPin, Minus, Plus, ShoppingCart, Star } from "lucide-react";
import { useState } from "react";
import Container from "../components/shared/Container";
import { getProductById } from "../data/products";
import { getCommerceDataMode } from "../data/providerMode";
import { money } from "../lib/format";
import { routeHref } from "../lib/router";
import { company } from "../styles/theme";

const SHOPPING_BRANCH_KEY = "smartcommerce_shopping_branch_v1";

type Props = { id: string; wished: boolean; onWishlist: (id: string) => void; onAdd: (id: string, quantity?: number) => void };

function currentShoppingBranch() {
  try {
    const value = window.localStorage.getItem(SHOPPING_BRANCH_KEY);
    return value && ["Ocho Rios", "Drax Hall", "Kingston", "Online"].includes(value) ? value : "Online";
  } catch {
    return "Online";
  }
}

export default function ProductDetailPage({ id, wished, onWishlist, onAdd }: Props) {
  const product = getProductById(id);
  const connected = getCommerceDataMode() === "connected";
  const [quantity, setQuantity] = useState(1);
  const branch = currentShoppingBranch();
  if (!product) return <div className="demo-empty"><h1>Product not found</h1><a href={routeHref("/products")}>Return to products</a></div>;

  return (
    <div className="demo-page sc-product-detail">
      <Container className="demo-detail">
        <nav className="sc-detail-breadcrumbs"><a href={routeHref("/products")}>Products</a><span>/</span><a href={routeHref(`/category/${product.category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`)}>{product.category}</a><span>/</span><span>{product.name}</span></nav>
        <div className="demo-detail__gallery"><img src={product.image} alt={product.name} />{connected && product.badge ? <span>{product.badge}</span> : null}</div>
        <div className="demo-detail__content">
          <small>{product.category} · SKU {product.sku}</small>
          <h1>{product.name}</h1>
          {connected && product.rating > 0 && product.reviews > 0 ? <div className="demo-rating"><Star size={16} fill="currentColor" /> {product.rating} <span>{product.reviews} reviews</span></div> : null}
          <p>{product.description}</p>
          <div className="sc-detail-branch-context"><MapPin size={16} aria-hidden="true" /><span><small>Shopping from</small><strong>{branch}</strong></span><a href="#" onClick={(event) => { event.preventDefault(); document.querySelector<HTMLButtonElement>(".v2-branch-selector__trigger")?.click(); }}>Change</a></div>
          {connected ? <><strong className="demo-detail__price">{product.price > 0 ? money(product.price) : "Price unavailable"}</strong><p className="demo-available"><CheckCircle2 size={17} /> {product.stockStatus || "Availability unavailable"}</p></> : <div className="sc-detail-preview"><strong>Demo catalogue</strong><p>Live price, stock, and branch availability are verified before checkout.</p></div>}
          <div className="sc-detail-purchase-row">
            <div className="sc-detail-quantity" aria-label="Quantity">
              <button type="button" aria-label="Decrease quantity" disabled={quantity <= 1} onClick={() => setQuantity((value) => Math.max(1, value - 1))}><Minus size={16} /></button>
              <label><span className="tt-sr-only">Quantity</span><input inputMode="numeric" value={quantity} onChange={(event) => { const value = Number(event.target.value.replace(/[^0-9]/g, "")); setQuantity(Number.isFinite(value) ? Math.max(1, Math.min(999, value || 1)) : 1); }} /></label>
              <button type="button" aria-label="Increase quantity" disabled={quantity >= 999} onClick={() => setQuantity((value) => Math.min(999, value + 1))}><Plus size={16} /></button>
            </div>
            <button className="sc-detail-add" onClick={() => onAdd(product.id, quantity)}><ShoppingCart size={18} /> Add {quantity > 1 ? `${quantity} to Cart` : "to Cart"}</button>
            <button className="sc-detail-save" onClick={() => onWishlist(product.id)} aria-pressed={wished}><Heart size={18} fill={wished ? "currentColor" : "none"} /><span className="tt-sr-only">{wished ? "Remove from saved items" : "Save item"}</span></button>
          </div>
          <div className="sc-detail-mode-actions">
            {product.rentable ? <a href={routeHref(`/rentals?q=${encodeURIComponent(product.name)}`)}>Rent instead</a> : null}
            <a href={routeHref(`/repairs?equipment=${encodeURIComponent(product.name)}`)}>Already own it? Start a repair</a>
            <a href={routeHref(`/commercial?mode=quote&item=${encodeURIComponent(product.name)}`)}>Need volume pricing? Commercial enquiry</a>
            <a href={routeHref(`/assistant?prompt=${encodeURIComponent(`Help me decide if ${product.name} is right for my job`)}`)}>Ask SmartCommerce AI</a>
          </div>
        </div>
        <section className="demo-detail__specs"><h2>Specifications</h2>{Object.entries(product.specs).length ? Object.entries(product.specs).map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>) : <p>Specifications have not been supplied for this product.</p>}</section>
        <section className="demo-detail__services sc-detail-support">
          <div><MapPin /><strong>{company.branches.length} branch locations</strong><span>{company.branches.map((branchItem) => branchItem.name).join(" · ")}</span></div>
          <div><CheckCircle2 /><strong>Verified before checkout</strong><span>Price and availability are rechecked before you place the order.</span></div>
          <div><Heart /><strong>Buy, rent, repair, or ask</strong><span>SmartCommerce keeps alternative paths close to the decision.</span></div>
        </section>
      </Container>
    </div>
  );
}
