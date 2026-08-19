import { Scale, ShoppingCart, X } from "lucide-react";
import Container from "../components/shared/Container";
import { getProducts } from "../data/products";
import { getCommerceDataMode } from "../data/providerMode";
import { money } from "../lib/format";
import { routeHref } from "../lib/router";

type Props = {
  compared: string[];
  onCompare: (id: string) => void;
  onAdd: (id: string) => void;
};

export default function ComparePage({ compared, onCompare, onAdd }: Props) {
  const products = getProducts().filter((product) => compared.includes(product.id));
  const connected = getCommerceDataMode() === "connected";
  const specKeys = Array.from(new Set(products.flatMap((product) => Object.keys(product.specs || {})))).slice(0, 10);

  return (
    <div className="demo-page sc-compare-page">
      <section className="demo-page-hero">
        <Container>
          <span>Product comparison</span>
          <h1>Compare the details that change the decision.</h1>
          <p>Review specifications, pricing context, availability, and purchase actions side by side.</p>
        </Container>
      </section>
      <Container size="wide" className="demo-page-content">
        {!products.length ? (
          <div className="demo-empty">
            <Scale size={38} />
            <h2>No products selected for comparison</h2>
            <p>Add products from search, category, wishlist, or product discovery.</p>
            <a href={routeHref("/products")}>Browse products</a>
          </div>
        ) : (
          <div className="sc-compare-table-wrap">
            <table className="sc-compare-table">
              <thead>
                <tr>
                  <th scope="col">Detail</th>
                  {products.map((product) => (
                    <th scope="col" key={product.id}>
                      <a href={routeHref(`/product/${product.id}`)}>{product.name}</a>
                      <button type="button" onClick={() => onCompare(product.id)} aria-label={`Remove ${product.name} from comparison`}><X size={15} /> Remove</button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr><th scope="row">Category</th>{products.map((product) => <td key={product.id}>{product.category}</td>)}</tr>
                <tr><th scope="row">SKU</th>{products.map((product) => <td key={product.id}>{product.sku || "—"}</td>)}</tr>
                <tr><th scope="row">Price</th>{products.map((product) => <td key={product.id}>{connected && product.price > 0 ? money(product.price) : "Verified at checkout"}</td>)}</tr>
                <tr><th scope="row">Availability</th>{products.map((product) => <td key={product.id}>{connected ? product.stockStatus || "Check availability" : "Provider validation required"}</td>)}</tr>
                {specKeys.map((key) => <tr key={key}><th scope="row">{key}</th>{products.map((product) => <td key={product.id}>{product.specs?.[key] || "—"}</td>)}</tr>)}
                <tr>
                  <th scope="row">Action</th>
                  {products.map((product) => <td key={product.id}><button type="button" className="demo-add-button" onClick={() => onAdd(product.id)}><ShoppingCart size={16} /> Add to Cart</button></td>)}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Container>
    </div>
  );
}
