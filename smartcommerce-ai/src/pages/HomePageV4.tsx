import {
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  Camera,
  ChevronRight,
  Grid3X3,
  HardHat,
  PackageSearch,
  Search,
  ShoppingBag,
  Sparkles,
  Wrench,
} from "lucide-react";
import { FormEvent, useState } from "react";
import heroImage from "../assets/smartcommerce-tools-optimized.jpg";
import rentalImage from "../assets/services/equipment-rentals.jpg";
import repairImage from "../assets/services/repairs-service.jpg";
import Container from "../components/shared/Container";
import { getCategories, getProducts } from "../data/products";
import { getCommerceDataMode } from "../data/providerMode";
import { getRentals } from "../data/rentals";
import { money, slugify } from "../lib/format";
import { go, routeHref } from "../lib/router";
import type { Product, RentalItem } from "../types";
import "../styles/storefront-2026.css";

type Props = {
  wishlist: string[];
  compared: string[];
  onWishlist: (id: string) => void;
  onCompare: (id: string) => void;
  onAdd: (id: string) => void;
};

const servicePaths = [
  { label: "Shop", detail: "Products & tools", href: "/products", icon: ShoppingBag },
  { label: "Parts", detail: "Find by machine", href: "/parts", icon: PackageSearch },
  { label: "Rent", detail: "Equipment & access", href: "/rentals", icon: HardHat },
  { label: "Repair", detail: "Service & support", href: "/repairs", icon: Wrench },
  { label: "Commercial", detail: "Projects & accounts", href: "/commercial", icon: BriefcaseBusiness },
] as const;

function connectedPrice(product: Product) {
  if (!(product.price > 0)) return "Price unavailable";
  try {
    return new Intl.NumberFormat("en-JM", {
      style: "currency",
      currency: product.currency || "JMD",
      maximumFractionDigits: 0,
    }).format(product.price);
  } catch {
    return `${product.currency || "JMD"} ${product.price.toLocaleString("en-JM")}`;
  }
}

function ProductPreview({ product, onAdd }: { product: Product; onAdd: (id: string) => void }) {
  const connected = getCommerceDataMode() === "connected";
  const blocked = connected ? product.purchaseBlockedReason || (product.purchasable === false ? "Unavailable" : "") : "";
  return (
    <article className="sc26-product">
      <a className="sc26-product__media" href={routeHref(`/product/${product.id}`)}>
        <img src={product.image} alt={product.name} loading="lazy" decoding="async" />
      </a>
      <div className="sc26-product__body">
        <span>{product.category}</span>
        <a href={routeHref(`/product/${product.id}`)}><h3>{product.name}</h3></a>
        <div className="sc26-product__meta">
          <strong>{connected ? connectedPrice(product) : product.price > 0 ? money(product.price) : "Verify price"}</strong>
          <small>{connected ? product.stockStatus || "Availability unavailable" : "Live availability verified before checkout"}</small>
        </div>
        <button type="button" disabled={Boolean(blocked)} onClick={() => { if (!blocked) onAdd(product.id); }}>
          {blocked || "Add to cart"}
        </button>
      </div>
    </article>
  );
}

function RentalPreview({ rental }: { rental: RentalItem }) {
  const hasRate = rental.dailyRate > 0;
  return (
    <a className="sc26-rental" href={routeHref(`/rental/${rental.id}`)}>
      <img src={rental.image} alt="" loading="lazy" decoding="async" />
      <div>
        <span>{rental.category}</span>
        <h3>{rental.name}</h3>
        <p>{rental.availability}</p>
        <strong>{hasRate ? `${money(rental.dailyRate)} / day` : "Check rate & availability"}</strong>
      </div>
      <ChevronRight size={20} aria-hidden="true" />
    </a>
  );
}

export default function HomePageV4({ onAdd }: Props) {
  const [query, setQuery] = useState("");
  const products = getProducts().slice(0, 4);
  const rentals = getRentals().slice(0, 3);
  const categories = getCategories().slice(0, 10);
  const connected = getCommerceDataMode() === "connected";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    if (!value) return go("/products");
    const normalized = value.toLowerCase();
    if (/\b(part|parts|spare|spares|replacement)\b/.test(normalized)) return go(`/parts?q=${encodeURIComponent(value)}`);
    if (/\b(rent|rental|hire)\b/.test(normalized)) return go(`/rentals?q=${encodeURIComponent(value)}`);
    if (/\b(repair|service|fix)\b/.test(normalized)) return go(`/repairs?equipment=${encodeURIComponent(value)}`);
    go(`/search?q=${encodeURIComponent(value)}`);
  };

  return (
    <div className="sc26-home">
      <section className="sc26-hero">
        <Container size="wide" className="sc26-hero__inner">
          <div className="sc26-hero__copy">
            <span className="sc26-eyebrow">TOTAL TOOLS × SMARTCOMMERCE</span>
            <h1>Whatever the job takes.</h1>
            <p>Buy it. Rent it. Repair it. Find the exact part. Or tell SmartCommerce what you are working on and start from there.</p>

            <form className="sc26-command" role="search" onSubmit={submit}>
              <Search size={21} aria-hidden="true" />
              <label className="tt-sr-only" htmlFor="sc26-home-search">Search Total Tools</label>
              <input
                id="sc26-home-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Product, model, part number, machine, or job"
                autoComplete="off"
              />
              <button type="submit">Search</button>
              <button type="button" className="is-ai" onClick={() => go(`/assistant?prompt=${encodeURIComponent(query || "Help me choose what I need for this job")}`)}>
                <Sparkles size={16} aria-hidden="true" /> Ask AI
              </button>
            </form>

            <div className="sc26-hero__utilities">
              <a href={routeHref("/product-match")}><Camera size={16} /> Find from a photo</a>
              <a href={routeHref("/parts")}><PackageSearch size={16} /> Equipment & parts finder</a>
            </div>
          </div>

          <div className="sc26-hero__visual">
            <img src={heroImage} alt="Professional tools and jobsite equipment" fetchPriority="high" decoding="async" />
            <div className="sc26-hero__stamp">
              <span>ONE PLACE</span>
              <strong>Shop · Rent · Repair · Parts</strong>
            </div>
          </div>
        </Container>
      </section>

      <nav className="sc26-service-rail" aria-label="SmartCommerce services">
        <Container size="wide">
          {servicePaths.map(({ label, detail, href, icon: Icon }) => (
            <a href={routeHref(href)} key={href}>
              <Icon size={20} aria-hidden="true" />
              <span><strong>{label}</strong><small>{detail}</small></span>
              <ChevronRight size={16} aria-hidden="true" />
            </a>
          ))}
        </Container>
      </nav>

      <section className="sc26-category-section sc26-defer" aria-labelledby="sc26-categories">
        <Container size="wide">
          <div className="sc26-heading">
            <div><span>SHOP BY CATEGORY</span><h2 id="sc26-categories">Get to the right aisle faster.</h2></div>
            <a href={routeHref("/categories")}>All categories <ArrowRight size={16} /></a>
          </div>
          <div className="sc26-category-list">
            {categories.map((category, index) => (
              <a href={routeHref(`/category/${slugify(category.name)}`)} key={category.name}>
                <b>{String(index + 1).padStart(2, "0")}</b>
                <strong>{category.name}</strong>
                <ArrowRight size={18} aria-hidden="true" />
              </a>
            ))}
          </div>
        </Container>
      </section>

      <section className="sc26-merch sc26-defer" aria-labelledby="sc26-products">
        <Container size="wide">
          <div className="sc26-heading">
            <div>
              <span>{connected ? "CONNECTED CATALOGUE" : "CATALOGUE PREVIEW"}</span>
              <h2 id="sc26-products">Tools worth getting straight to.</h2>
            </div>
            <a href={routeHref("/products")}>Shop all products <ArrowRight size={16} /></a>
          </div>
          {products.length ? <div className="sc26-products">{products.map((product) => <ProductPreview key={product.id} product={product} onAdd={onAdd} />)}</div> : (
            <div className="sc26-empty">No products have been returned by the connected provider yet.</div>
          )}
        </Container>
      </section>

      <section className="sc26-parts-feature sc26-defer">
        <Container size="wide">
          <div className="sc26-parts-feature__copy">
            <span>NEW IN SMARTCOMMERCE</span>
            <h2>Start with the machine. End with the right part.</h2>
            <p>Choose the brand, equipment family and exact model, then move through assemblies, parts and subparts using governed compatibility data.</p>
            <div>
              <a className="is-primary" href={routeHref("/parts")}><PackageSearch size={18} /> Open Parts Finder</a>
              <a href={routeHref("/assistant?prompt=Help%20me%20identify%20the%20right%20equipment%20part")}><Bot size={18} /> Ask AI for help</a>
            </div>
          </div>
          <div className="sc26-parts-feature__path" aria-label="Parts finder path">
            <span><b>01</b> Brand</span>
            <i aria-hidden="true" />
            <span><b>02</b> Equipment</span>
            <i aria-hidden="true" />
            <span><b>03</b> Model</span>
            <i aria-hidden="true" />
            <span><b>04</b> Assembly</span>
            <i aria-hidden="true" />
            <span><b>05</b> Part</span>
          </div>
        </Container>
      </section>

      <section className="sc26-rentals sc26-defer" aria-labelledby="sc26-rentals">
        <Container size="wide">
          <div className="sc26-rentals__intro">
            <span>RENTALS</span>
            <h2 id="sc26-rentals">Use the machine. Keep the capital.</h2>
            <p>Choose around the job, branch and dates. SmartCommerce keeps availability and rates tied to provider truth where connected.</p>
            <a href={routeHref("/rentals")}>Plan a rental <ArrowRight size={16} /></a>
          </div>
          <div className="sc26-rental-list">
            {rentals.length ? rentals.map((rental) => <RentalPreview key={rental.id} rental={rental} />) : <div className="sc26-empty">Rental inventory will appear when the provider returns it.</div>}
          </div>
        </Container>
      </section>

      <section className="sc26-service-split sc26-defer">
        <Container size="wide">
          <article className="sc26-repair">
            <img src={repairImage} alt="Technician servicing professional equipment" loading="lazy" decoding="async" />
            <div><span>REPAIR & SERVICE</span><h2>Keep good equipment working.</h2><p>Start with the machine and the symptoms. SmartCommerce carries the request into the connected service workflow.</p><a href={routeHref("/repairs")}>Start a repair <ArrowRight size={16} /></a></div>
          </article>
          <article className="sc26-commercial">
            <img src={rentalImage} alt="" loading="lazy" decoding="async" />
            <div><span>COMMERCIAL</span><h2>Built around the job, not the checkout.</h2><p>Quotes, project support, fleet needs and commercial accounts stay connected to the same commerce platform.</p><a href={routeHref("/commercial")}>Commercial support <ArrowRight size={16} /></a></div>
          </article>
        </Container>
      </section>

      <section className="sc26-ai sc26-defer">
        <Container size="wide">
          <div><span>SMARTCOMMERCE AI</span><h2>Don’t know where to start? Start with the job.</h2></div>
          <p>Describe what you need to accomplish. SmartCommerce can route you toward products, rentals, parts, repairs or commercial support without inventing provider facts.</p>
          <a href={routeHref("/assistant")}><Sparkles size={18} /> Ask SmartCommerce</a>
          <a href={routeHref("/product-match")}><Camera size={18} /> Use a photo</a>
          <a href={routeHref("/categories")}><Grid3X3 size={18} /> Browse categories</a>
        </Container>
      </section>
    </div>
  );
}
