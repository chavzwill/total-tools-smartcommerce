import generatorImage from "../assets/generator-optimized.jpg";
import toolsImage from "../assets/smartcommerce-tools-optimized.jpg";
import type { Product } from "../types";

export default function PremiumProductCard({ product }: { product: Product }) {
  const image = product.category === "Generators" ? generatorImage : toolsImage;
  return (
    <article className="premium-product-card">
      <div className="premium-product-image">
        <img src={image} alt={product.name} loading="lazy" />
        <div className="product-badges"><span>Business pricing</span><span>AI recommended</span></div>
        <button aria-label={`Save ${product.name}`}>Save</button>
      </div>
      <div className="premium-product-copy">
        <small>{product.category}</small><h3>{product.name}</h3>
        <div className="premium-product-price"><strong>${product.price.toLocaleString()}</strong><span>{product.stockStatus}</span></div>
        <div className="product-links"><button>Accessories</button><button>Quick view</button></div>
        <div className="premium-product-actions"><button>Add to cart</button><button>Compare</button></div>
      </div>
    </article>
  );
}
