import generatorImage from "../assets/generator-recommendation.png";
import toolsImage from "../assets/smartcommerce-tools.png";
import type { Product } from "../types";

type ProductCardProps = { product: Product };

export default function ProductCard({ product }: ProductCardProps) {
  const image = product.category === "Generators" ? generatorImage : toolsImage;
  return (
    <article className="product-card">
      <div className="product-visual">
        <img src={image} alt={product.name} />
        <span>{product.badge}</span>
        <button className="wishlist" aria-label={`Save ${product.name}`}>Save</button>
      </div>
      <div className="product-body">
        <small>{product.category}</small><h3>{product.name}</h3>
        <div className="product-rating" aria-label="AI recommended product">AI recommended</div>
        <div className="product-meta"><strong>${product.price.toLocaleString()}</strong><span>{product.stockStatus}</span></div>
        <div className="product-actions"><button className="add-button">Add to cart</button><button className="compare-button">Compare</button></div>
      </div>
    </article>
  );
}
