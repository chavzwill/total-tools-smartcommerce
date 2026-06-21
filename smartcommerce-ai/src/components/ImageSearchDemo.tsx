import { useState } from "react";
import { products } from "../data/products";
import ProductCard from "./ProductCard";

const matches = products.filter((product) => product.tags.includes("fitting") || product.tags.includes("picture"));

export default function ImageSearchDemo() {
  const [showMatches, setShowMatches] = useState(false);

  return (
    <section className="section image-search" id="image-search">
      <div className="section-heading">
        <span className="eyebrow">Find products by picture</span>
        <h2>Identify fittings and parts from a demo upload</h2>
      </div>
      <div className="image-search-layout">
        <div className="fake-upload">
          <div className="upload-icon">IMG</div>
          <strong>Drop a fitting photo here</strong>
          <p>Demo mode uses local product matches only.</p>
          <button className="deal-button" onClick={() => setShowMatches(true)}>
            Show demo match
          </button>
        </div>
        <div className="matched-products">
          {showMatches ? (
            matches.map((product) => <ProductCard product={product} key={product.id} />)
          ) : (
            <div className="empty-match">Matched products will appear here after the demo click.</div>
          )}
        </div>
      </div>
    </section>
  );
}
