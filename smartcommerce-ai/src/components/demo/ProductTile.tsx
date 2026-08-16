import { Eye, Heart, Scale, ShoppingCart, Star } from "lucide-react";
import { getCommerceDataMode } from "../../data/providerMode";
import { money } from "../../lib/format";
import { go, routeHref } from "../../lib/router";
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

  const handleCompare = () => {
    if (!compared) onCompare(product.id);
    go("/compare");
  };

  return (
    <article className="demo-product-card sc-product-card">
      <a className="demo-product-card__image" href={routeHref(`/product/${product.id}`)}>
        <img src={product.image} alt={product.name} loading="lazy" decoding="async" />
        {connected && product.badge ? <span>{product.badge}</span> : null}
        {product.rentable ? <b>Rentable</b> : null}
      </a>
      <div className="demo-product-card__body">
        <small className="sc-product-card__category">{product.category}<span aria-hidden="true"> · </span><span>SKU {product.sku}</span></small>
        <a className="sc-product-card__title" href={routeHref(`/product/${product.id}`)}><h3>{product.name}</h3></a>
        {keySpec ? <p className="sc-product-card__spec"><strong>{keySpec[0]}:</strong> {keySpec[1]}</p> : null}
        {connected && product.rating > 0 && product.reviews > 0 ? <div className="demo-rating"><Star size={14} fill="currentColor" /> {product.rating} <span>({product.reviews})</span></div> : null}
        <div className="sc-product-card__commerce">
          {connected ? <><strong className="demo-price">{product.price > 0 ? money(product.price) : "Price unavailable"}</strong><p className="demo-stock">{product.stockStatus || "Availability unavailable"}</p></> : <><strong className="demo-price">{product.price > 0 ? money(product.price) : "Price verified at checkout"}</strong><p className="sc-product-card__preview-note">Demo catalogue · live price and stock are verified before checkout.</p></>}
        </div>
        <button className="demo-add-button" onClick={() => onAdd(product.id)} type="button"><ShoppingCart size={17} /> Add to Cart</button>
        <div className="demo-card-tools" aria-label={`More actions for ${product.name}`}>
          <button className={compared ? "active" : ""} onClick={handleCompare} type="button"><Scale size={15} /> {compared ? "Compare" : "Compare"}</button>
          <button className={wished ? "active" : ""} onClick={() => onWishlist(product.id)} type="button"><Heart size={15} fill={wished ? "currentColor" : "none"} /> {wished ? "Saved" : "Save"}</button>
          <a href={routeHref(`/product/${product.id}`)}><Eye size={15} /> Details</a>
        </div>
      </div>
    </article>
  );
}
