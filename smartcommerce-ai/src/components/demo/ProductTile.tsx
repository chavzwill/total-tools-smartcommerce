import { Eye, Heart, Scale, ShoppingCart, Star } from "lucide-react";
import { getCommerceDataMode } from "../../data/providerMode";
import { money } from "../../lib/format";
import { routeHref } from "../../lib/router";
import type { Product } from "../../types";

type Props = {
  product: Product;
  wished: boolean;
  compared: boolean;
  onWishlist: (id: string) => void;
  onCompare: (id: string) => void;
  onAdd: (id: string) => void;
};

export default function ProductTile({ product, wished, compared, onWishlist, onCompare, onAdd }: Props) {
  const connected = getCommerceDataMode() === "connected";
  const keySpec = Object.entries(product.specs || {}).find(([, value]) => value?.trim());
  return (
    <article className="demo-product-card sc-product-card">
      <a className="demo-product-card__image" href={routeHref(`/product/${product.id}`)}>
        <img src={product.image} alt={product.name} loading="lazy" decoding="async" />
        <span>{connected ? product.badge : "Preview item"}</span>
        {product.rentable ? <b>Rental path</b> : null}
      </a>
      <div className="demo-product-card__body">
        <small>{product.category} · SKU {product.sku}</small>
        <a href={routeHref(`/product/${product.id}`)}><h3>{product.name}</h3></a>
        {keySpec ? <p className="sc-product-card__spec"><strong>{keySpec[0]}:</strong> {keySpec[1]}</p> : null}
        {connected && product.rating > 0 && product.reviews > 0 ? <div className="demo-rating"><Star size={14} fill="currentColor" /> {product.rating} <span>({product.reviews})</span></div> : null}
        {connected ? <><strong className="demo-price">{product.price > 0 ? money(product.price) : "Price unavailable"}</strong><p className="demo-stock">{product.stockStatus || "Availability unavailable"}</p></> : <p className="sc-product-card__preview-note">Catalogue preview · connect the provider to verify live price and availability.</p>}
        <div className="demo-card-tools">
          <button className={compared ? "active" : ""} onClick={() => onCompare(product.id)} type="button"><Scale size={15} /> {compared ? "Compared" : "Compare"}</button>
          <button onClick={() => onWishlist(product.id)} type="button"><Heart size={15} fill={wished ? "currentColor" : "none"} /> {wished ? "Saved" : "Save"}</button>
          <a href={routeHref(`/product/${product.id}`)}><Eye size={15} /> Details</a>
        </div>
        {connected ? <button className="demo-add-button" onClick={() => onAdd(product.id)} type="button"><ShoppingCart size={17} /> Add to Cart</button> : <a className="demo-add-button sc-preview-action" href={routeHref(`/product/${product.id}`)}>View preview</a>}
      </div>
    </article>
  );
}
