import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import CategoryCard from "../components/demo/CategoryCard";
import ProductTile from "../components/demo/ProductTile";
import Container from "../components/shared/Container";
import { getCategories, getProducts } from "../data/products";
import { slugify } from "../lib/format";
import { routeHref } from "../lib/router";
import type { Product } from "../types";

const subcategories: Record<string, string[]> = {
  generators: ["Portable Generators", "Diesel Generators", "Inverter Generators", "Commercial Generators", "Generator Accessories"],
  "power-tools": ["Drills", "Grinders", "Saws", "Sanders", "Impact Drivers", "Rotary Hammers"]
};

type Actions = {
  wishlist: string[];
  compared: string[];
  onWishlist: (id: string) => void;
  onCompare: (id: string) => void;
  onAdd: (id: string) => void;
};

function ProductResults({ items, title, description, actions }: { items: Product[]; title: string; description: string; actions: Actions }) {
  const [filter, setFilter] = useState("");
  const visible = useMemo(() => items.filter((product) => `${product.name} ${product.category} ${product.tags.join(" ")}`.toLowerCase().includes(filter.toLowerCase())), [filter, items]);
  return (
    <div className="demo-page">
      <section className="demo-page-hero"><Container><span>Shop Total Tools</span><h1>{title}</h1><p>{description}</p></Container></section>
      <Container className="demo-page-content">
        <label className="demo-inline-search"><Search size={20} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter this product range" /></label>
        <div className="demo-results-bar"><strong>{visible.length} results</strong><span>Prices shown in JMD. Demo stock updates by branch.</span></div>
        {visible.length ? <div className="demo-product-grid">{visible.map((product) => <ProductTile product={product} wished={actions.wishlist.includes(product.id)} compared={actions.compared.includes(product.id)} onWishlist={actions.onWishlist} onCompare={actions.onCompare} onAdd={actions.onAdd} key={product.id} />)}</div> : <div className="demo-empty"><h2>No exact products found</h2><p>Try generator, forklift, drill, pressure washer, or welding.</p></div>}
      </Container>
    </div>
  );
}

export function ProductsPage({ actions }: { actions: Actions }) {
  const products = getProducts();
  return <ProductResults items={products} title="Products" description="Professional products for construction, industrial, commercial, and home projects." actions={actions} />;
}

export function CategoryPage({ slug, subcategory, actions }: { slug: string; subcategory?: string; actions: Actions }) {
  const categories = getCategories();
  const products = getProducts();
  const category = categories.find((item) => slugify(item.name) === slug);
  const categoryProducts = products.filter((product) => category && (product.category === category.name || product.department === category.name || product.tags.includes(slug.split("-")[0])));
  const fallback = categoryProducts.length ? categoryProducts : products.filter((product) => product.tags.some((tag) => category?.name.toLowerCase().includes(tag)));
  const selected = subcategory ? fallback.filter((product) => slugify(product.subcategory || "") === subcategory || product.tags.includes(subcategory.split("-")[0])) : fallback;
  return <div className="category-page"><nav className="subcategory-nav">{(subcategories[slug] || []).map((item) => <a className={subcategory === slugify(item) ? "active" : ""} href={routeHref(`/category/${slug}?sub=${slugify(item)}`)} key={item}>{item}</a>)}</nav><ProductResults items={selected.length ? selected : fallback.length ? fallback : products.slice(0, 6)} title={category?.name || "Category"} description={category?.description || "Explore this Total Tools department."} actions={actions} /></div>;
}

export function CategoriesPage() {
  const categories = getCategories();
  return <div className="demo-page"><section className="demo-page-hero"><Container><span>Departments</span><h1>Shop by category</h1><p>Move from job requirement to the right range in a few confident clicks.</p></Container></section><Container className="demo-page-content"><div className="demo-category-grid">{categories.map((category) => <CategoryCard category={category} key={category.name} />)}</div></Container></div>;
}

export function SearchPage({ query, actions }: { query: string; actions: Actions }) {
  const products = getProducts();
  const normalized = query.toLowerCase();
  const matches = products.filter((product) => `${product.name} ${product.category} ${product.tags.join(" ")}`.toLowerCase().includes(normalized));
  return <ProductResults items={matches} title={`Search results for "${query}"`} description="Results are matched against the local executive demo catalog." actions={actions} />;
}
