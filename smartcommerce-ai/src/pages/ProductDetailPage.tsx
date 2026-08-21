import { CheckCircle2, Heart, MapPin, Minus, Plus, ShoppingCart, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { createApiClient } from "../apiClient";
import Container from "../components/shared/Container";
import { getProductById } from "../data/products";
import { getCommerceDataMode } from "../data/providerMode";
import { routeHref } from "../lib/router";
import {
  SHOPPING_BRANCH_CHANGED_EVENT,
  getShoppingBranch,
  isShoppingBranch,
  type ShoppingBranch,
} from "../lib/shoppingBranch";
import type { Branch, CommerceProduct, InventoryAvailability, ProductPricing } from "../platform";
import { company } from "../styles/theme";

const api = createApiClient();

type Props = { id: string; wished: boolean; onWishlist: (id: string) => void; onAdd: (id: string, quantity?: number) => void };

type DetailAvailability = {
  lookupStatus: "idle" | "loading" | "confirmed" | "unavailable";
  branchId?: string;
  branchName?: string;
  record?: InventoryAvailability;
};

type PriceLookupStatus = "idle" | "loading" | "confirmed" | "unavailable";

function providerRecordIsVerified(record: InventoryAvailability | undefined) {
  return Boolean(record) && record?.metadata?.liveVerified !== false && record?.metadata?.source !== "preview_catalogue";
}

function availabilityText(availability: DetailAvailability, branch: ShoppingBranch) {
  if (branch === "Online") return "Choose a branch to confirm live pickup stock";
  if (availability.lookupStatus === "loading") return `Checking ${branch} availability…`;
  if (availability.lookupStatus === "unavailable") return `${branch}: availability not confirmed`;
  const record = availability.record;
  if (!record) return `${branch}: no inventory status returned`;
  if (!providerRecordIsVerified(record) || record.status === "unknown") return `${branch}: live stock not verified`;
  const quantity = typeof record.quantityAvailable === "number" && Number.isFinite(record.quantityAvailable)
    ? ` · ${record.quantityAvailable} provider-listed available`
    : "";
  switch (record.status) {
    case "in_stock": return `${branch}: in stock${quantity}`;
    case "low_stock": return `${branch}: low stock${quantity}`;
    case "out_of_stock": return `${branch}: out of stock`;
    case "reserved": return `${branch}: currently reserved${quantity}`;
    case "backordered": return `${branch}: backordered`;
    default: return `${branch}: ${String(record.status).replace(/_/g, " ")}${quantity}`;
  }
}

function purchaseBlockReason(availability: DetailAvailability, branch: ShoppingBranch, quantity: number) {
  if (branch === "Online" || availability.lookupStatus !== "confirmed") return undefined;
  const record = availability.record;
  if (!record || !providerRecordIsVerified(record)) return undefined;
  if (record.status === "out_of_stock") return `Out of stock at ${branch}`;
  if (
    typeof record.quantityAvailable === "number" &&
    Number.isFinite(record.quantityAvailable) &&
    record.quantityAvailable >= 0 &&
    quantity > record.quantityAvailable
  ) {
    return record.quantityAvailable === 0
      ? `No provider-listed stock at ${branch}`
      : `Only ${record.quantityAvailable} provider-listed at ${branch}`;
  }
  return undefined;
}

function pricingBranchId(price: ProductPricing) {
  const value = price.metadata?.branchId;
  return typeof value === "string" && value ? value : undefined;
}

function selectedProviderPrice(product: CommerceProduct | undefined, branchId?: string) {
  const pricing = product?.pricing || [];
  const branchPrice = branchId ? pricing.find((price) => pricingBranchId(price) === branchId) : undefined;
  const unboundPrice = pricing.find((price) => pricingBranchId(price) === undefined);
  const selected = branchPrice || unboundPrice;
  if (!selected) return undefined;
  const amount = selected.salePrice ?? selected.listPrice;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) return undefined;
  return { amount, currency: selected.currency || "JMD" };
}

function formatProviderPrice(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-JM", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("en-JM")}`;
  }
}

function providerPriceText(product: CommerceProduct | undefined, status: PriceLookupStatus, branchId?: string) {
  if (status === "loading") return "Checking price…";
  if (status !== "confirmed") return "Price unavailable";
  const selected = selectedProviderPrice(product, branchId);
  return selected ? formatProviderPrice(selected.amount, selected.currency) : "Price unavailable";
}

export default function ProductDetailPage({ id, wished, onWishlist, onAdd }: Props) {
  const product = getProductById(id);
  const connected = getCommerceDataMode() === "connected";
  const [quantity, setQuantity] = useState(1);
  const [branch, setBranch] = useState<ShoppingBranch>(() => getShoppingBranch());
  const [availability, setAvailability] = useState<DetailAvailability>({ lookupStatus: "idle" });
  const [providerProduct, setProviderProduct] = useState<CommerceProduct | undefined>();
  const [priceLookupStatus, setPriceLookupStatus] = useState<PriceLookupStatus>("idle");

  useEffect(() => {
    const syncBranch = (event: Event) => {
      const next = (event as CustomEvent<{ branch?: unknown }>).detail?.branch;
      setBranch(isShoppingBranch(next) ? next : getShoppingBranch());
    };
    window.addEventListener(SHOPPING_BRANCH_CHANGED_EVENT, syncBranch);
    return () => window.removeEventListener(SHOPPING_BRANCH_CHANGED_EVENT, syncBranch);
  }, []);

  useEffect(() => {
    let active = true;
    if (!connected || !product) {
      setAvailability({ lookupStatus: "idle" });
      setProviderProduct(undefined);
      setPriceLookupStatus("idle");
      return () => { active = false; };
    }

    setProviderProduct(undefined);
    setPriceLookupStatus("loading");

    if (branch === "Online") {
      setAvailability({ lookupStatus: "idle" });
      void api.get<CommerceProduct>(`/platform/products/${encodeURIComponent(product.id)}`).then((result) => {
        if (!active) return;
        if (!result.success) {
          setPriceLookupStatus("unavailable");
          return;
        }
        setProviderProduct(result.data);
        setPriceLookupStatus("confirmed");
      }).catch(() => {
        if (active) setPriceLookupStatus("unavailable");
      });
      return () => { active = false; };
    }

    setAvailability({ lookupStatus: "loading", branchName: branch });
    void Promise.all([
      api.get<Branch[]>("/platform/branches"),
      api.get<CommerceProduct>(`/platform/products/${encodeURIComponent(product.id)}`),
    ]).then(async ([branches, productResult]) => {
      if (!active) return;
      if (productResult.success) {
        setProviderProduct(productResult.data);
        setPriceLookupStatus("confirmed");
      } else {
        setPriceLookupStatus("unavailable");
      }
      if (!branches.success) {
        setAvailability({ lookupStatus: "unavailable", branchName: branch });
        return;
      }
      const selected = branches.data.find((item) => item.active && item.name.trim().toLowerCase() === branch.toLowerCase());
      if (!selected) {
        setAvailability({ lookupStatus: "unavailable", branchName: branch });
        return;
      }
      const branchId = String(selected.id);
      const result = await api.get<InventoryAvailability[]>(
        `/platform/inventory/availability?productId=${encodeURIComponent(product.id)}&branchId=${encodeURIComponent(branchId)}&quantity=1`,
      );
      if (!active) return;
      if (!result.success) {
        setAvailability({ lookupStatus: "unavailable", branchId, branchName: selected.name });
        return;
      }
      const record = result.data.find((item) => String(item.branchId || "") === branchId) || result.data[0];
      setAvailability({ lookupStatus: "confirmed", branchId, branchName: selected.name, record });
    }).catch(() => {
      if (active) {
        setAvailability({ lookupStatus: "unavailable", branchName: branch });
        setPriceLookupStatus("unavailable");
      }
    });

    return () => { active = false; };
  }, [branch, connected, product?.id]);

  if (!product) return <div className="demo-empty"><h1>Product not found</h1><a href={routeHref("/products")}>Return to products</a></div>;

  const blockReason = connected ? purchaseBlockReason(availability, branch, quantity) : undefined;
  const displayPrice = connected
    ? providerPriceText(providerProduct, priceLookupStatus, availability.branchId)
    : product.price > 0
      ? formatProviderPrice(product.price, "JMD")
      : "Price unavailable";

  return (
    <div className="demo-page sc-product-detail">
      <Container className="demo-detail">
        <nav className="sc-detail-breadcrumbs"><a href={routeHref("/products")}>Products</a><span>/</span><a href={routeHref(`/category/${product.category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`)}>{product.category}</a><span>/</span><span>{product.name}</span></nav>
        <div className="demo-detail__gallery"><img src={product.image} alt={product.name} />{connected && product.badge ? <span>{product.badge}</span> : null}</div>
        <div className="demo-detail__content">
          <small>{product.category} · SKU {product.sku}</small>
          <h1>{product.name}</h1>
          {connected && product.rating > 0 && product.reviews > 0 ? <div className="demo-rating"><Star size={16} fill="currentColor" /> {product.rating} <span>{product.reviews} reviews</span></div> : null}
          <p>{product.description}</p>
          <div className="sc-detail-branch-context"><MapPin size={16} aria-hidden="true" /><span><small>Shopping from</small><strong>{branch}</strong></span><a href="#" onClick={(event) => { event.preventDefault(); document.querySelector<HTMLButtonElement>(".v2-branch-selector__trigger")?.click(); }}>Change</a></div>
          {connected ? <><strong className="demo-detail__price">{displayPrice}</strong><p className="demo-available"><CheckCircle2 size={17} /> {availabilityText(availability, branch)}</p></> : <div className="sc-detail-preview"><strong>Demo catalogue</strong><p>Live price, stock, and branch availability are verified before checkout.</p></div>}
          <div className="sc-detail-purchase-row">
            <div className="sc-detail-quantity" aria-label="Quantity">
              <button type="button" aria-label="Decrease quantity" disabled={quantity <= 1} onClick={() => setQuantity((value) => Math.max(1, value - 1))}><Minus size={16} /></button>
              <label><span className="tt-sr-only">Quantity</span><input inputMode="numeric" value={quantity} onChange={(event) => { const value = Number(event.target.value.replace(/[^0-9]/g, "")); setQuantity(Number.isFinite(value) ? Math.max(1, Math.min(999, value || 1)) : 1); }} /></label>
              <button type="button" aria-label="Increase quantity" disabled={quantity >= 999} onClick={() => setQuantity((value) => Math.min(999, value + 1))}><Plus size={16} /></button>
            </div>
            <button className="sc-detail-add" disabled={Boolean(blockReason)} onClick={() => { if (!blockReason) onAdd(product.id, quantity); }}><ShoppingCart size={18} /> {blockReason || `Add ${quantity > 1 ? `${quantity} to Cart` : "to Cart"}`}</button>
            <button className="sc-detail-save" onClick={() => onWishlist(product.id)} aria-pressed={wished}><Heart size={18} fill={wished ? "currentColor" : "none"} /><span className="tt-sr-only">{wished ? "Remove from saved items" : "Save item"}</span></button>
          </div>
          <div className="sc-detail-mode-actions">
            {product.rentable ? <a href={routeHref(`/rentals?q=${encodeURIComponent(product.name)}`)}>Rent instead</a> : null}
            <a href={routeHref(`/repairs?equipment=${encodeURIComponent(product.name)}`)}>Already own it? Start a repair</a>
            <a href={routeHref(`/commercial?mode=quote&item=${encodeURIComponent(product.name)}`)}>Need volume pricing? Commercial enquiry</a>
            <a href={routeHref(`/assistant?prompt=${encodeURIComponent(`Help me decide if ${product.name} is right for my job`)}`)}>Ask SmartCommerce AI</a>
          </div>
        </div>
        <section className="demo-detail__specs"><h2>Specifications</h2>{Object.entries(product.specs).length ? Object.entries(product.specs).map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>) : <p>Specifications have not been supplied for this product.</p>}</section>
        <section className="demo-detail__services sc-detail-support">
          <div><MapPin /><strong>{company.branches.length} branch locations</strong><span>{company.branches.map((branchItem) => branchItem.name).join(" · ")}</span></div>
          <div><CheckCircle2 /><strong>Verified before checkout</strong><span>Price and availability are rechecked before you place the order.</span></div>
          <div><Heart /><strong>Buy, rent, repair, or ask</strong><span>SmartCommerce keeps alternative paths close to the decision.</span></div>
        </section>
      </Container>
    </div>
  );
}