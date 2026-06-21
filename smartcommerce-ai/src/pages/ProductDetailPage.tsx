import { CheckCircle2, Heart, ShieldCheck, Star, Truck } from "lucide-react";
import Container from "../components/shared/Container";
import { findProduct } from "../data/products";
import { money } from "../lib/format";
import { routeHref } from "../lib/router";

type Props = { id: string; wished: boolean; onWishlist: (id: string) => void; onAdd: (id: string) => void };

export default function ProductDetailPage({ id, wished, onWishlist, onAdd }: Props) {
  const product = findProduct(id);
  if (!product) return <div className="demo-empty"><h1>Product not found</h1><a href={routeHref("/products")}>Return to products</a></div>;
  return (
    <div className="demo-page"><Container className="demo-detail">
      <div className="demo-detail__gallery"><img src={product.image} alt={product.name} /><span>{product.badge}</span></div>
      <div className="demo-detail__content"><small>{product.category} | SKU {product.sku}</small><h1>{product.name}</h1><div className="demo-rating"><Star size={16} fill="currentColor" /> {product.rating} <span>{product.reviews} verified reviews</span></div><p>{product.description}</p><strong className="demo-detail__price">{money(product.price)}</strong><p className="demo-available"><CheckCircle2 size={17} /> {product.stockStatus}</p><div className="demo-detail__actions"><button onClick={() => onAdd(product.id)}>Add to Cart</button><button onClick={() => onWishlist(product.id)}><Heart size={18} fill={wished ? "currentColor" : "none"} /> {wished ? "Saved" : "Add to Wishlist"}</button></div>{product.rentable && <a className="demo-detail__rental" href={routeHref("/rentals")}>This product type is also available to rent</a>}</div>
      <section className="demo-detail__specs"><h2>Specifications</h2>{Object.entries(product.specs).map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</section>
      <section className="demo-detail__services"><div><Truck /><strong>Islandwide delivery</strong><span>Coordinated from your closest branch</span></div><div><ShieldCheck /><strong>Total Tools support</strong><span>Product advice, repairs, and parts</span></div><div><CheckCircle2 /><strong>Branch availability</strong><span>Ocho Rios, Kingston, Drax Hall</span></div></section>
    </Container></div>
  );
}
