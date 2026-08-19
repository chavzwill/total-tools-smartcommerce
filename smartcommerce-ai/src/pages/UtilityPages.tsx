import { CheckCircle2, Heart, PackageCheck, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ProductTile from "../components/demo/ProductTile";
import Container from "../components/shared/Container";
import { getProductById, getProducts } from "../data/products";
import { getRentalById } from "../data/rentals";
import {
  createCheckoutQuote,
  createGuestCheckoutQuote,
  getPersistentCart,
  removePersistentCartItem,
  setPersistentCartQuantity,
  type CheckoutQuote,
  type CommerceCart,
  type GuestCheckoutItem,
} from "../lib/customerCommerce";
import { money } from "../lib/format";
import { go, routeHref } from "../lib/router";
import CustomerAccountPage from "./CustomerAccountPage";

type Actions = { wishlist: string[]; compared: string[]; onWishlist: (id: string) => void; onCompare: (id: string) => void; onAdd: (id: string) => void };

function formatMinor(value: number, currency = "JMD") {
  return new Intl.NumberFormat("en-JM", { style: "currency", currency }).format(value / 100);
}

export function CartPage({
  guestCart,
  setGuestQuantity,
  removeGuest,
}: {
  guestCart: GuestCheckoutItem[];
  setGuestQuantity: (id: string, quantity: number) => void;
  removeGuest: (id: string) => void;
}) {
  const [cart, setCart] = useState<CommerceCart | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(true);
  const [error, setError] = useState("");
  const guestItems = guestCart
    .map((entry) => ({ entry, product: getProductById(entry.productId) }))
    .filter((item): item is { entry: GuestCheckoutItem; product: NonNullable<ReturnType<typeof getProductById>> } => Boolean(item.product));
  const guestTotal = guestItems.reduce((sum, item) => sum + item.product.price * item.entry.quantity, 0);

  useEffect(() => {
    let active = true;
    getPersistentCart()
      .then((value) => { if (active) { setCart(value); setSignedIn(true); } })
      .catch((err: any) => { if (active) { setSignedIn(err?.status !== 401); setError(err?.status === 401 ? "" : err?.message || "Cart unavailable."); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function changeQuantity(itemId: string, quantity: number) {
    try { setCart(await setPersistentCartQuantity(itemId, quantity)); }
    catch (err: any) { setError(err?.message || "Could not update the cart."); }
  }

  async function removeItem(itemId: string) {
    try { setCart(await removePersistentCartItem(itemId)); }
    catch (err: any) { setError(err?.message || "Could not update the cart."); }
  }

  const verifiedItems = cart?.items.filter((item) => item.validation === "verified" && item.product) || [];
  const persistentTotal = verifiedItems.reduce((sum, item) => sum + (item.product?.unitPrice || 0) * item.quantity, 0);

  if (loading) return <div className="demo-page"><Container className="demo-page-content"><div className="demo-empty"><PackageCheck size={35} /><h2>Loading your cart…</h2><p>Checking whether you have a saved account cart.</p></div></Container></div>;

  if (!signedIn) {
    return (
      <div className="demo-page sc-cart-page">
        <section className="demo-page-hero sc-cart-hero">
          <Container>
            <span>Shopping Cart</span>
            <h1>Your cart. Your choice.</h1>
            <p>Checkout as a guest or sign in to keep this cart synced across devices. Either way, SmartCommerce revalidates the order against the connected provider before checkout.</p>
          </Container>
        </section>
        <Container className="demo-cart-layout sc-cart-premium">
          <section>
            {guestItems.length ? guestItems.map(({ entry, product }) => (
              <article className="demo-cart-item sc-cart-line-premium" key={product.id}>
                <img src={product.image} alt={product.name} />
                <div className="sc-cart-line-premium__copy">
                  <small>{product.category} · SKU {product.sku}</small>
                  <h2>{product.name}</h2>
                  <p>Final price and availability will be independently revalidated by the server.</p>
                  <div className="sc-cart-quantity" aria-label={`Quantity for ${product.name}`}>
                    <button type="button" disabled={entry.quantity <= 1} onClick={() => setGuestQuantity(product.id, entry.quantity - 1)}>−</button>
                    <strong>{entry.quantity}</strong>
                    <button type="button" disabled={entry.quantity >= 999} onClick={() => setGuestQuantity(product.id, entry.quantity + 1)}>+</button>
                  </div>
                </div>
                <strong>{money(product.price * entry.quantity)}</strong>
                <button className="sc-cart-remove" onClick={() => removeGuest(product.id)}>Remove</button>
              </article>
            )) : (
              <div className="demo-empty"><PackageCheck size={35} /><h2>Your cart is empty</h2><p>Build a project list and come back when you’re ready.</p><a href={routeHref("/products")}>Browse products</a></div>
            )}
          </section>
          <aside className="sc-order-summary">
            <span className="sc-order-summary__eyebrow">Order summary</span>
            <h2>Ready when you are.</h2>
            <div><span>Current catalogue estimate</span><strong>{money(guestTotal)}</strong></div>
            <div><span>Tax & delivery</span><strong>Verified next</strong></div>
            <button className="sc-checkout-primary" disabled={!guestItems.length} onClick={() => go("/checkout")}>Checkout as guest</button>
            <button className="sc-checkout-secondary" type="button" onClick={() => go("/account?intent=cart")}><UserRound size={17} /> Sign in instead</button>
            <p><ShieldCheck size={16} /> Guest checkout uses server-side provider validation. Local catalogue prices are never treated as authoritative.</p>
          </aside>
        </Container>
      </div>
    );
  }

  return (
    <div className="demo-page sc-cart-page">
      <section className="demo-page-hero sc-cart-hero"><Container><span>Shopping Cart</span><h1>Your saved cart</h1><p>Synced to your SmartCommerce account and checked against live provider data.</p></Container></section>
      <Container className="demo-cart-layout sc-cart-premium">
        <section>
          {cart?.items.length ? cart.items.map((item) => (
            <article className="demo-cart-item sc-cart-line-premium" key={item.id}>
              <div className="sc-cart-line-premium__copy">
                <small>{item.product?.sku ? `SKU ${item.product.sku}` : item.providerItemId}</small>
                <h2>{item.product?.name || "Item needs verification"}</h2>
                <p>{item.validation === "verified" ? "Live provider data verified" : "This item cannot currently be verified for checkout."}</p>
                <div className="sc-cart-quantity"><button type="button" disabled={item.quantity <= 1} onClick={() => changeQuantity(item.id, item.quantity - 1)}>−</button><strong>{item.quantity}</strong><button type="button" disabled={item.quantity >= 999} onClick={() => changeQuantity(item.id, item.quantity + 1)}>+</button></div>
              </div>
              <strong>{item.product?.unitPrice !== undefined ? new Intl.NumberFormat("en-JM", { style: "currency", currency: item.product.currency || cart.currency }).format(item.product.unitPrice * item.quantity) : "Recheck required"}</strong>
              <button className="sc-cart-remove" onClick={() => removeItem(item.id)}>Remove</button>
            </article>
          )) : <div className="demo-empty"><PackageCheck size={35} /><h2>Your cart is empty</h2><a href={routeHref("/products")}>Browse products</a></div>}
          {error ? <p className="sc-account-real__error">{error}</p> : null}
        </section>
        <aside className="sc-order-summary">
          <span className="sc-order-summary__eyebrow">Order summary</span><h2>Verified cart</h2>
          <div><span>Verified products</span><strong>{new Intl.NumberFormat("en-JM", { style: "currency", currency: cart?.currency || "JMD" }).format(persistentTotal)}</strong></div>
          <div><span>Delivery & tax</span><strong>Recalculated at checkout</strong></div>
          <button className="sc-checkout-primary" disabled={!verifiedItems.length || verifiedItems.length !== (cart?.items.length || 0)} onClick={() => go("/checkout")}>Continue to checkout</button>
          <p><ShieldCheck size={16} /> Checkout creates a short-lived quote from current provider pricing.</p>
        </aside>
      </Container>
    </div>
  );
}

export function CheckoutPage({ guestCart }: { guestCart: GuestCheckoutItem[] }) {
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [authRequired, setAuthRequired] = useState(false);

  useEffect(() => {
    let active = true;
    async function prepareCheckout() {
      try {
        const value = await createCheckoutQuote();
        if (active) setQuote(value);
      } catch (err: any) {
        if (err?.status === 401 && guestCart.length) {
          try {
            const guestQuote = await createGuestCheckoutQuote(guestCart);
            if (active) { setQuote(guestQuote); setAuthRequired(false); }
            return;
          } catch (guestError: any) {
            if (active) setError(guestError?.message || "Guest checkout could not be prepared.");
            return;
          }
        }
        if (active) { setError(err?.message || "Checkout could not be prepared."); setAuthRequired(err?.status === 401); }
      } finally {
        if (active) setLoading(false);
      }
    }
    void prepareCheckout();
    return () => { active = false; };
  }, [guestCart]);

  const expiresLabel = useMemo(() => quote ? new Date(quote.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "", [quote]);
  const guest = quote?.checkoutMode === "guest";

  if (loading) return <div className="demo-page sc-checkout-page"><Container className="demo-checkout"><section className="sc-checkout-intro"><span>Secure checkout</span><h1>Verifying every line.</h1><p>SmartCommerce is checking current provider pricing, product status and tax before showing your order.</p></section></Container></div>;

  if (!quote) return <div className="demo-page sc-checkout-page"><Container className="demo-checkout"><section className="sc-checkout-intro"><span>Checkout unavailable</span><h1>We couldn’t prepare this order.</h1><p>{authRequired ? "Sign in to continue with your saved cart. Your cart will still be here when you return." : error}</p>{authRequired ? <><button onClick={() => go("/account?intent=checkout")}>Sign in or create account</button><button onClick={() => go("/cart")}>Return to cart</button></> : <button onClick={() => go("/cart")}>Return to cart</button>}</section></Container></div>;

  return (
    <div className="demo-page sc-checkout-page">
      <Container className="demo-checkout sc-checkout-premium">
        <section className="sc-checkout-intro">
          <span>{guest ? "Guest checkout" : "Secure checkout"}</span>
          <h1>Review the order we just verified.</h1>
          <p>{guest ? "No account required. " : ""}This quote comes from current provider data and expires at {expiresLabel}. Prices are never trusted from browser state.</p>
          <div className="sc-checkout-assurance-grid">
            <div><ShieldCheck size={20} /><strong>Provider verified</strong><span>Products and pricing rechecked server-side.</span></div>
            <div><PackageCheck size={20} /><strong>Short-lived quote</strong><span>Stale prices cannot silently pass checkout.</span></div>
            <div><UserRound size={20} /><strong>{guest ? "No account required" : "Account synced"}</strong><span>{guest ? "Complete checkout without creating a profile." : "Your cart stays attached to your account."}</span></div>
          </div>
        </section>
        <section className="demo-flow-form sc-checkout-summary">
          <div className="sc-checkout-summary__head"><span>Order</span><strong>{quote.items.length} {quote.items.length === 1 ? "item" : "items"}</strong></div>
          {quote.items.map((item) => <div key={item.productId} className="sc-checkout-line"><span><small>{item.quantity} ×</small> {item.name}</span><strong>{new Intl.NumberFormat("en-JM", { style: "currency", currency: item.currency }).format(item.unitPrice * item.quantity)}</strong></div>)}
          <div className="sc-checkout-divider" />
          <div className="sc-checkout-line"><span>Subtotal</span><strong>{formatMinor(quote.subtotalMinor, quote.currency)}</strong></div>
          <div className="sc-checkout-line"><span>Tax</span><strong>{formatMinor(quote.taxMinor, quote.currency)}</strong></div>
          <div className="sc-checkout-line"><span>Delivery</span><strong>{quote.deliveryMinor ? formatMinor(quote.deliveryMinor, quote.currency) : "Calculated with fulfillment"}</strong></div>
          <div className="demo-cart-total"><span>Verified total</span><strong>{formatMinor(quote.totalMinor, quote.currency)}</strong></div>
          <div className="sc-checkout-trust"><ShieldCheck size={22} /><div><strong>Payment is the only disabled step.</strong><span>SmartCommerce will not collect card data or claim an order is paid until a real processor and webhook confirmation are connected.</span></div></div>
          <button disabled>Payment setup required</button>
          <button className="sc-checkout-back" type="button" onClick={() => go("/cart")}>Return to cart</button>
        </section>
      </Container>
    </div>
  );
}

export function WishlistPage({ actions }: { actions: Actions }) {
  const products = getProducts();
  const items = products.filter((product) => actions.wishlist.includes(product.id));
  return <div className="demo-page"><section className="demo-page-hero"><Container><span>Saved Items</span><h1>Wishlist</h1><p>Keep products together while planning the job.</p></Container></section><Container className="demo-page-content">{items.length ? <div className="demo-product-grid">{items.map((product) => <ProductTile product={product} wished compared={actions.compared.includes(product.id)} onWishlist={actions.onWishlist} onCompare={actions.onCompare} onAdd={actions.onAdd} key={product.id} />)}</div> : <div className="demo-empty"><Heart size={35} /><h2>No saved products yet</h2><a href={routeHref("/products")}>Explore products</a></div>}</Container></div>;
}

export function AccountPage() { return <CustomerAccountPage />; }

export function ConfirmationPage({ type, item, reference, status }: { type: "order" | "rental" | "repair" | "commercial"; item?: string; reference?: string; status?: string }) {
  const content = {
    order: ["Order received", "Your order has been accepted by the server workflow."],
    rental: ["Rental request submitted", `${getRentalById(item || "")?.name || "Your equipment"} was submitted to the connected rental provider.`],
    repair: ["Repair request submitted", "The connected service provider accepted your repair request."],
    commercial: ["Commercial request submitted", "The connected commercial workflow accepted your request."],
  }[type];
  const statusText = status ? status.replace(/_/g, " ") : "submitted";
  return <div className="demo-page"><Container className="demo-confirmation"><CheckCircle2 size={58} /><span>{reference ? `Confirmation ${reference}` : "Confirmation"}</span><h1>{content[0]}</h1><p>{content[1]}</p><p><strong>Status:</strong> {statusText}</p><a href={routeHref("/")}>Return to Homepage</a></Container></div>;
}
