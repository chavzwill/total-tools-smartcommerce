import { Filter, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import CategoryCard from "../components/demo/CategoryCard";
import ProductTile from "../components/demo/ProductTile";
import Container from "../components/shared/Container";
import { getCategories, getProducts } from "../data/products";
import { getCommerceDataMode } from "../data/providerMode";
import { loadBranchCatalogue } from "../lib/branchCatalogue";
import { slugify } from "../lib/format";
import { routeHref } from "../lib/router";
import { getShoppingBranch } from "../lib/shoppingBranch";
import type { Category, Product } from "../types";

const subcategories: Record<string, string[]> = {
  generators: ["Portable Generators", "Diesel Generators", "Inverter Generators", "Commercial Generators", "Generator Accessories"],
  "power-tools": ["Drills", "Grinders", "Saws", "Sanders", "Impact Drivers", "Rotary Hammers"],
};

type Actions = {
  wishlist: string[];
  compared: string[];
  onWishlist: (id: string) => void;
  onCompare: (id: string) => void;
  onAdd: (id: string) => void;
};

type SortMode = "best" | "price-asc" | "price-desc" | "name" | "availability";
type CatalogueLoadStatus = "ready" | "loading" | "error";

type DiscoveryState = {
  query: string;
  categories: string[];
  brands: string[];
  branches: string[];
  availability: string;
  rentable: boolean;
  minPrice: string;
  maxPrice: string;
  sort: SortMode;
  attributes: Record<string, string[]>;
};

type GroundedCatalogueState = {
  products: Product[];
  categories: Category[];
  status: CatalogueLoadStatus;
  error: string;
};

const getHashParams = () => {
  const raw = window.location.hash.slice(1);
  const [, query = ""] = raw.split("?");
  return new URLSearchParams(query);
};

const splitList = (value: string | null) => value ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];

const readDiscoveryState = (initialQuery = ""): DiscoveryState => {
  const params = getHashParams();
  return {
    query: params.get("q") ?? initialQuery,
    categories: splitList(params.get("category")),
    brands: splitList(params.get("brand")),
    branches: splitList(params.get("branch")),
    availability: params.get("availability") || "",
    rentable: params.get("rentable") === "1",
    minPrice: params.get("minPrice") || "",
    maxPrice: params.get("maxPrice") || "",
    sort: (["price-asc", "price-desc", "name", "availability"].includes(params.get("sort") || "") ? params.get("sort") : "best") as SortMode,
    attributes: Object.fromEntries(
      Array.from(params.entries())
        .filter(([key]) => key.startsWith("attr."))
        .map(([key, value]) => [key.slice(5), splitList(value)])
    ),
  };
};

const writeDiscoveryState = (state: DiscoveryState) => {
  const raw = window.location.hash.slice(1) || "/products";
  const [path] = raw.split("?");
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  if (state.categories.length) params.set("category", state.categories.join(","));
  if (state.brands.length) params.set("brand", state.brands.join(","));
  if (state.branches.length) params.set("branch", state.branches.join(","));
  if (state.availability) params.set("availability", state.availability);
  if (state.rentable) params.set("rentable", "1");
  if (state.minPrice) params.set("minPrice", state.minPrice);
  if (state.maxPrice) params.set("maxPrice", state.maxPrice);
  if (state.sort !== "best") params.set("sort", state.sort);
  Object.entries(state.attributes).forEach(([key, values]) => {
    if (values.length) params.set(`attr.${key}`, values.join(","));
  });
  const query = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${path}${query ? `?${query}` : ""}`);
};

const getBrand = (product: Product) => product.specs?.Brand?.trim() || "";

const getAvailabilityGroup = (product: Product) => {
  const value = product.stockStatus.toLowerCase();
  if (/out of stock|no provider-listed stock/.test(value)) return "out";
  if (/low stock|limited/.test(value)) return "limited";
  if (/in stock/.test(value)) return "available";
  return "unknown";
};

const toggled = (items: string[], value: string) => items.includes(value) ? items.filter((item) => item !== value) : [...items, value];

function useGroundedCatalogue(): GroundedCatalogueState {
  const connected = getCommerceDataMode() === "connected";
  const branch = getShoppingBranch();
  const [catalogue, setCatalogue] = useState<GroundedCatalogueState>(() => ({
    products: connected ? [] : getProducts(),
    categories: getCategories(),
    status: connected ? "loading" : "ready",
    error: "",
  }));

  useEffect(() => {
    let active = true;
    if (!connected) {
      setCatalogue({ products: getProducts(), categories: getCategories(), status: "ready", error: "" });
      return () => { active = false; };
    }

    setCatalogue((current) => ({ ...current, products: [], status: "loading", error: "" }));
    void loadBranchCatalogue(branch).then((result) => {
      if (!active) return;
      if (!result.success) {
        setCatalogue({ products: [], categories: getCategories(), status: "error", error: result.message });
        return;
      }
      setCatalogue({
        products: result.data.products,
        categories: result.data.categories.length ? result.data.categories : getCategories(),
        status: "ready",
        error: "",
      });
    }).catch(() => {
      if (active) setCatalogue({ products: [], categories: getCategories(), status: "error", error: "The connected provider catalogue could not be loaded." });
    });

    return () => { active = false; };
  }, [branch, connected]);

  return catalogue;
}

function ProductResults({
  items,
  title,
  description,
  actions,
  initialQuery = "",
  loadStatus = "ready",
  loadError = "",
}: {
  items: Product[];
  title: string;
  description: string;
  actions: Actions;
  initialQuery?: string;
  loadStatus?: CatalogueLoadStatus;
  loadError?: string;
}) {
  const [state, setState] = useState<DiscoveryState>(() => readDiscoveryState(initialQuery));
  const [draftQuery, setDraftQuery] = useState(state.query);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const connected = getCommerceDataMode() === "connected";

  useEffect(() => {
    writeDiscoveryState(state);
  }, [state]);

  useEffect(() => {
    if (!filtersOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFiltersOpen(false);
        filterTriggerRef.current?.focus();
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [filtersOpen]);

  const categoryOptions = useMemo(() => Array.from(new Set(items.map((product) => product.category).filter(Boolean))).sort(), [items]);
  const brandOptions = useMemo(() => Array.from(new Set(items.map(getBrand).filter(Boolean))).sort(), [items]);
  const pricedCurrencies = useMemo(() => Array.from(new Set(
    items
      .filter((product) => product.price > 0 && Boolean(product.currency))
      .map((product) => String(product.currency).toUpperCase()),
  )), [items]);
  const comparableCurrency = connected && pricedCurrencies.length === 1 ? pricedCurrencies[0] : undefined;
  const mixedCurrencies = connected && pricedCurrencies.length > 1;

  useEffect(() => {
    if (!connected || loadStatus !== "ready" || comparableCurrency) return;
    setState((previous) => {
      const invalidSort = previous.sort === "price-asc" || previous.sort === "price-desc";
      if (!invalidSort && !previous.minPrice && !previous.maxPrice) return previous;
      return {
        ...previous,
        minPrice: "",
        maxPrice: "",
        sort: invalidSort ? "best" : previous.sort,
      };
    });
  }, [comparableCurrency, connected, loadStatus]);

  const attributeOptions = useMemo(() => {
    const counts = new Map<string, Set<string>>();
    items.forEach((product) => {
      Object.entries(product.specs || {}).forEach(([key, value]) => {
        if (!value?.trim() || key === "Brand") return;
        if (!counts.has(key)) counts.set(key, new Set());
        counts.get(key)?.add(value.trim());
      });
    });
    return Array.from(counts.entries())
      .filter(([, values]) => values.size >= 2 && values.size <= 12)
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, 4)
      .map(([key, values]) => ({ key, values: Array.from(values).sort() }));
  }, [items]);

  const visible = useMemo(() => {
    const term = state.query.trim().toLowerCase();
    const min = state.minPrice === "" ? undefined : Number(state.minPrice);
    const max = state.maxPrice === "" ? undefined : Number(state.maxPrice);
    const result = items.filter((product) => {
      if (term) {
        const searchable = `${product.name} ${product.sku} ${product.category} ${product.department} ${product.description} ${product.tags.join(" ")} ${Object.entries(product.specs).flat().join(" ")}`.toLowerCase();
        if (!searchable.includes(term)) return false;
      }
      if (state.categories.length && !state.categories.includes(product.category)) return false;
      if (state.brands.length && !state.brands.includes(getBrand(product))) return false;
      if (state.availability && getAvailabilityGroup(product) !== state.availability) return false;
      if (state.rentable && !product.rentable) return false;
      if (connected && comparableCurrency && min !== undefined && Number.isFinite(min) && (product.price <= 0 || String(product.currency || "").toUpperCase() !== comparableCurrency || product.price < min)) return false;
      if (connected && comparableCurrency && max !== undefined && Number.isFinite(max) && (product.price <= 0 || String(product.currency || "").toUpperCase() !== comparableCurrency || product.price > max)) return false;
      for (const [key, selections] of Object.entries(state.attributes)) {
        if (selections.length && !selections.includes(product.specs?.[key] || "")) return false;
      }
      return true;
    });

    if (comparableCurrency && state.sort === "price-asc") result.sort((a, b) => (a.price || Number.MAX_SAFE_INTEGER) - (b.price || Number.MAX_SAFE_INTEGER));
    else if (comparableCurrency && state.sort === "price-desc") result.sort((a, b) => (b.price || 0) - (a.price || 0));
    else if (state.sort === "name") result.sort((a, b) => a.name.localeCompare(b.name));
    else if (state.sort === "availability") result.sort((a, b) => getAvailabilityGroup(a).localeCompare(getAvailabilityGroup(b)));
    return result;
  }, [comparableCurrency, connected, items, state]);

  const activeFilters = [
    ...state.categories.map((value) => ["Category", value] as const),
    ...state.brands.map((value) => ["Brand", value] as const),
    ...(state.availability ? [["Availability", state.availability] as const] : []),
    ...(state.rentable ? [["Type", "Rentable"] as const] : []),
    ...(state.minPrice ? [["Min price", state.minPrice] as const] : []),
    ...(state.maxPrice ? [["Max price", state.maxPrice] as const] : []),
    ...Object.entries(state.attributes).flatMap(([key, values]) => values.map((value) => [key, value] as const)),
  ];

  const clearAll = () => {
    setDraftQuery("");
    setState((previous) => ({ query: "", categories: [], brands: [], branches: previous.branches, availability: "", rentable: false, minPrice: "", maxPrice: "", sort: "best", attributes: {} }));
  };

  const removeFilter = (label: string, value: string) => {
    setState((previous) => {
      if (label === "Category") return { ...previous, categories: previous.categories.filter((item) => item !== value) };
      if (label === "Brand") return { ...previous, brands: previous.brands.filter((item) => item !== value) };
      if (label === "Availability") return { ...previous, availability: "" };
      if (label === "Type") return { ...previous, rentable: false };
      if (label === "Min price") return { ...previous, minPrice: "" };
      if (label === "Max price") return { ...previous, maxPrice: "" };
      return { ...previous, attributes: { ...previous.attributes, [label]: (previous.attributes[label] || []).filter((item) => item !== value) } };
    });
  };

  const filterPanel = (
    <div className="sc-filter-panel__body">
      {connected && comparableCurrency ? (
        <fieldset><legend>Price range ({comparableCurrency})</legend><div className="sc-price-filter"><label>Minimum<input inputMode="decimal" value={state.minPrice} onChange={(event) => setState((previous) => ({ ...previous, minPrice: event.target.value.replace(/[^0-9.]/g, "") }))} placeholder="No minimum" /></label><label>Maximum<input inputMode="decimal" value={state.maxPrice} onChange={(event) => setState((previous) => ({ ...previous, maxPrice: event.target.value.replace(/[^0-9.]/g, "") }))} placeholder="No maximum" /></label></div></fieldset>
      ) : null}
      {mixedCurrencies ? <p>Price sorting and range filters are unavailable across mixed provider currencies.</p> : null}
      {categoryOptions.length > 1 ? <fieldset><legend>Category</legend>{categoryOptions.map((value) => <label className="sc-filter-check" key={value}><input type="checkbox" checked={state.categories.includes(value)} onChange={() => setState((previous) => ({ ...previous, categories: toggled(previous.categories, value) }))} /><span>{value}</span></label>)}</fieldset> : null}
      {brandOptions.length ? <fieldset><legend>Brand</legend>{brandOptions.map((value) => <label className="sc-filter-check" key={value}><input type="checkbox" checked={state.brands.includes(value)} onChange={() => setState((previous) => ({ ...previous, brands: toggled(previous.brands, value) }))} /><span>{value}</span></label>)}</fieldset> : null}
      {connected ? <fieldset><legend>Availability</legend>{[["available", "Available"], ["limited", "Limited"], ["out", "Out of stock"]].map(([value, label]) => <label className="sc-filter-radio" key={value}><input type="radio" name="availability" checked={state.availability === value} onChange={() => setState((previous) => ({ ...previous, availability: previous.availability === value ? "" : value }))} /><span>{label}</span></label>)}</fieldset> : null}
      <fieldset><legend>Commerce mode</legend><label className="sc-filter-check"><input type="checkbox" checked={state.rentable} onChange={(event) => setState((previous) => ({ ...previous, rentable: event.target.checked }))} /><span>Rental path available</span></label></fieldset>
      {attributeOptions.map(({ key, values }) => <fieldset key={key}><legend>{key}</legend>{values.map((value) => <label className="sc-filter-check" key={value}><input type="checkbox" checked={(state.attributes[key] || []).includes(value)} onChange={() => setState((previous) => ({ ...previous, attributes: { ...previous.attributes, [key]: toggled(previous.attributes[key] || [], value) } }))} /><span>{value}</span></label>)}</fieldset>)}
    </div>
  );

  const resultBody = loadStatus === "loading"
    ? <div className="demo-empty sc-results-empty"><h2>Checking the connected catalogue…</h2><p>Loading provider products, pricing, and branch availability for your current shopping context.</p></div>
    : loadStatus === "error"
      ? <div className="demo-empty sc-results-empty"><h2>Connected catalogue could not be loaded.</h2><p>{loadError || "The provider did not return catalogue data for this shopping context."}</p><div><a href={routeHref(`/assistant?prompt=${encodeURIComponent(`Help me find ${state.query || title}`)}`)}>Ask AI for help</a></div></div>
      : visible.length
        ? <div className="demo-product-grid">{visible.map((product) => <ProductTile product={product} wished={actions.wishlist.includes(product.id)} compared={actions.compared.includes(product.id)} onWishlist={actions.onWishlist} onCompare={actions.onCompare} onAdd={actions.onAdd} key={product.id} />)}</div>
        : <div className="demo-empty sc-results-empty"><h2>No products match this combination</h2><p>Remove one filter, broaden the search, or ask SmartCommerce for a different route to the job.</p><div><button onClick={clearAll}>Clear filters</button><a href={routeHref(`/assistant?prompt=${encodeURIComponent(`Help me find an alternative for ${state.query || title}`)}`)}>Ask AI for alternatives</a></div></div>;

  return (
    <div className="demo-page sc-product-discovery">
      <section className="demo-page-hero sc-product-discovery__hero"><Container><span>SmartCommerce product discovery</span><h1>{title}</h1><p>{description}</p><div className={`sc-data-mode ${connected ? "is-connected" : "is-preview"}`}><span aria-hidden="true" /><strong>{connected ? "Connected provider mode" : "Catalogue preview mode"}</strong><small>{connected ? "Price and availability are sourced through the configured provider path." : "Preview records are for interface evaluation; live price and branch stock are not represented as verified."}</small></div></Container></section>
      <Container size="wide" className="sc-product-discovery__workspace">
        <div className="sc-product-discovery__search-row">
          <form onSubmit={(event) => { event.preventDefault(); setState((previous) => ({ ...previous, query: draftQuery.trim() })); }}>
            <Search size={20} /><label className="tt-sr-only" htmlFor="catalog-search">Search products</label><input id="catalog-search" value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} placeholder="Search name, model, SKU, specification, or job term" /><button>Search</button>
          </form>
          <a href={routeHref(`/assistant?prompt=${encodeURIComponent(draftQuery || "Help me choose a product for my job")}`)}><Sparkles size={17} /> Ask AI</a>
        </div>
        <div className="sc-product-discovery__toolbar">
          <button ref={filterTriggerRef} type="button" onClick={() => setFiltersOpen(true)}><Filter size={17} /> Filters {activeFilters.length ? `(${activeFilters.length})` : ""}</button>
          <strong aria-live="polite">{loadStatus === "loading" ? "Checking connected catalogue…" : `${visible.length} results`}</strong>
          <label>Sort<select value={state.sort} onChange={(event) => setState((previous) => ({ ...previous, sort: event.target.value as SortMode }))}><option value="best">Best match</option>{connected && comparableCurrency ? <><option value="price-asc">Price: low to high ({comparableCurrency})</option><option value="price-desc">Price: high to low ({comparableCurrency})</option></> : null}{connected ? <option value="availability">Availability</option> : null}<option value="name">Name A–Z</option></select></label>
        </div>
        {activeFilters.length ? <div className="sc-active-filters" aria-label="Active filters">{activeFilters.map(([label, value]) => <button key={`${label}-${value}`} onClick={() => removeFilter(label, value)} type="button"><span>{label}: {value}</span><X size={13} /></button>)}<button className="is-clear" onClick={clearAll} type="button">Clear all</button></div> : null}
        <div className="sc-product-discovery__layout">
          <aside className="sc-filter-panel" aria-label="Product filters"><div className="sc-filter-panel__title"><SlidersHorizontal size={18} /><strong>Refine results</strong></div>{filterPanel}</aside>
          <div className="sc-product-discovery__results">{resultBody}</div>
        </div>
      </Container>
      {filtersOpen ? <div className="sc-filter-overlay" role="presentation" onClick={() => setFiltersOpen(false)}><section className="sc-mobile-filter-sheet" role="dialog" aria-modal="true" aria-label="Product filters" onClick={(event) => event.stopPropagation()}><header><div><Filter size={18} /><h2>Filters</h2></div><button type="button" onClick={() => { setFiltersOpen(false); filterTriggerRef.current?.focus(); }} aria-label="Close filters"><X size={20} /></button></header>{filterPanel}<footer><button type="button" onClick={clearAll}>Clear all</button><button type="button" onClick={() => { setFiltersOpen(false); filterTriggerRef.current?.focus(); }}>Show {loadStatus === "ready" ? visible.length : 0} results</button></footer></section></div> : null}
    </div>
  );
}

export function ProductsPage({ actions }: { actions: Actions }) {
  const catalogue = useGroundedCatalogue();
  return <ProductResults items={catalogue.products} title="Products" description="Search, filter, compare, and move between buying, rental, repair, and guided assistance where the data supports it." actions={actions} loadStatus={catalogue.status} loadError={catalogue.error} />;
}

export function CategoryPage({ slug, subcategory, actions }: { slug: string; subcategory?: string; actions: Actions }) {
  const catalogue = useGroundedCatalogue();
  const categories = catalogue.categories.length ? catalogue.categories : getCategories();
  const products = catalogue.products;
  const category = categories.find((item) => slugify(item.name) === slug);
  const categoryProducts = products.filter((product) => category && (product.category === category.name || product.department === category.name || product.tags.includes(slug.split("-")[0])));
  const fallback = categoryProducts.length ? categoryProducts : products.filter((product) => product.tags.some((tag) => category?.name.toLowerCase().includes(tag)));
  const selected = subcategory ? fallback.filter((product) => slugify(product.subcategory || "") === subcategory || product.tags.includes(subcategory.split("-")[0])) : fallback;
  return <div className="category-page">{(subcategories[slug] || []).length ? <nav className="subcategory-nav" aria-label="Subcategories">{(subcategories[slug] || []).map((item) => <a className={subcategory === slugify(item) ? "active" : ""} href={routeHref(`/category/${slug}?sub=${slugify(item)}`)} key={item}>{item}</a>)}</nav> : null}<ProductResults items={selected.length ? selected : fallback} title={category?.name || "Category"} description={category?.description || "Explore this Total Tools department."} actions={actions} loadStatus={catalogue.status} loadError={catalogue.error} /></div>;
}

export function CategoriesPage() {
  const categories = getCategories();
  return <div className="demo-page"><section className="demo-page-hero"><Container><span>Departments</span><h1>Shop by category</h1><p>Move from the job requirement to the relevant department without digging through a giant menu.</p></Container></section><Container className="demo-page-content">{categories.length ? <div className="demo-category-grid">{categories.map((category) => <CategoryCard category={category} key={category.name} />)}</div> : <div className="demo-empty"><h2>No categories returned</h2><p>The connected provider has not supplied category data yet.</p></div>}</Container></div>;
}

export function SearchPage({ query, actions }: { query: string; actions: Actions }) {
  const catalogue = useGroundedCatalogue();
  return <ProductResults items={catalogue.products} title={query ? `Search results for “${query}”` : "Search products"} description="Search the current catalogue and refine the result with compatible filters." actions={actions} initialQuery={query} loadStatus={catalogue.status} loadError={catalogue.error} />;
}
