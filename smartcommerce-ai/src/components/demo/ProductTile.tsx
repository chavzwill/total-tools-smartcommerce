import { Eye, Heart, Scale, ShoppingCart, Star } from "lucide-react";
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
  return (
    <article className="demo-product-card">
      <a className="demo-product-card__image" href={routeHref(`/product/${product.id}`)}>
        <img src={product.image} alt={product.name} />
        <span>{product.badge}</span>
        {product.rentable && <b>Rental available</b>}
      </a>
      <div className="demo-product-card__body">
        <small>{product.category} | SKU {product.sku}</small>
        <a href={routeHref(`/product/${product.id}`)}><h3>{product.name}</h3></a>
        <div className="demo-rating"><Star size={14} fill="currentColor" /> {product.rating} <span>({product.reviews})</span></div>
        <strong className="demo-price">{money(product.price)}</strong>
        <p className="demo-stock">{product.stockStatus}</p>
        <div className="demo-card-tools">
          <button className={compared ? "active" : ""} onClick={() => onCompare(product.id)}><Scale size={15} /> {compared ? "Compared" : "Compare"}</button>
          <button onClick={() => onWishlist(product.id)}><Heart size={15} fill={wished ? "currentColor" : "none"} /> {wished ? "Saved" : "Wishlist"}</button>
          <a href={routeHref(`/product/${product.id}`)}><Eye size={15} /> Quick View</a>
        </div>
        <button className="demo-add-button" onClick={() => onAdd(product.id)}><ShoppingCart size={17} /> Add to Cart</button>
      </div>
    </article>
  );
}
