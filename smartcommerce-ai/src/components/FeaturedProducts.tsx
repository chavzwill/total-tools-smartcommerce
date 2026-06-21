import { products } from "../data/products";
import PremiumProductCard from "./PremiumProductCard";

export default function FeaturedProducts() {
  return (
    <section className="featured-products" id="products" aria-labelledby="featured-products-title">
      <div className="section-intro split-intro"><div><span>Featured products</span><h2 id="featured-products-title">Chosen with purpose.</h2></div><p>Professional products with clear availability and intelligent recommendations.</p></div>
      <div className="premium-product-grid">{products.slice(0, 8).map((product) => <PremiumProductCard product={product} key={product.id} />)}</div>
    </section>
  );
}
