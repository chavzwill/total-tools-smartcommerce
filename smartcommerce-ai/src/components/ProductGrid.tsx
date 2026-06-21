import { products } from "../data/products";
import ProductCard from "./ProductCard";

export default function ProductGrid() {
  return (
    <section className="product-section" id="products" aria-labelledby="product-heading">
      <div className="section-intro split-intro">
        <div><span>Selected for the job</span><h2 id="product-heading">Featured products</h2></div>
        <p>Focused recommendations, useful context, and clear availability.</p>
      </div>
      <div className="product-grid">{products.slice(0, 6).map((product) => <ProductCard product={product} key={product.id} />)}</div>
    </section>
  );
}
