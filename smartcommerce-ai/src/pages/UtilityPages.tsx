import { CheckCircle2, Heart, PackageCheck, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ProductTile from "../components/demo/ProductTile";
import Container from "../components/shared/Container";
import { getProductById, getProducts } from "../data/products";
import { getRentalById } from "../data/rentals";
import {
  createCheckoutQuote,
  getPersistentCart,
  removePersistentCartItem,
  setPersistentCartQuantity,
  type CheckoutQuote,
  type CommerceCart,
} from "../lib/customerCommerce";
import { money } from "../lib/format";
import { go, routeHref } from "../lib/router";
import CustomerAccountPage from "./CustomerAccountPage";

type Actions = { wishlist: string[]; compared: string[]; onWishlist: (id: string) => void; onCompare: (id: string) => void; onAdd: (id: string) => void };

function formatMinor(value: number, currency = "JMD") {
  return new Intl.NumberFormat("en-JM", { style: "currency", currency }).format(value / 100);
}

export function CartPage({ guestCart, removeGuest }: { guestCart: string[]; removeGuest: (id: string) => void }) {
  const [cart, setCart] = useState<CommerceCart | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(true);
  const [error, setError] = useState("");
  const guestItems = guestCart.map(getProductById).filter(Boolean) as ReturnType<typeof getProducts>;
  const guestTotal = guestItems.reduce((sum, item) => sum + item.price, 0);

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

  if (loading) return <div className="demo-page"><Container className="demo-page-content"><div className="demo-empty"><PackageCheck size={35} /><h2>Loading your cart…</h2><p>Checking your saved items against the connected commerce provider.</p></div></Container></div>;

  if (!signedIn) {
    return <div className="demo-page"><section className="demo-page-hero"><Container><span>Shopping Cart</span><h1>Your project list</h1><p>Sign in to keep your cart across devices and use server-verified checkout.</p></Container></section><Container className="demo-cart-layout"><section>{guestItems.length ? guestItems.map((item) => <article className="demo-cart-item" key={item.id}><img src={item.image} alt={item.name} /><div><small>SKU {item.sku}</small><h2>{item.name}</h2><p>Guest cart — live provider validation happens after sign in.</p></div><strong>{money(item.price)}</strong><button onClick={() => removeGuest(item.id)}>Remove</button></article>) : <div className="demo-empty"><PackageCheck size={35} /><h2>Your cart is empty</h2><a href={routeHref("/products")}>Browse products</a></div>}</section><aside><h2>Guest summary</h2><div><span>Local estimate</span><strong>{money(guestTotal)}</strong></div><button disabled={!guestItems.length} onClick={() => go("/account")}>Sign in to continue</button><p>Prices and availability are revalidated by the server before checkout.</p></aside></Container></div>;
  }

  return <div className="demo-page"><section className="demo-page-hero"><Container><span>Shopping Cart</span><h1>Your saved cart</h1><p>Items are stored with your SmartCommerce account and checked against live provider data.</p></Container></section><Container className="demo-cart-layout"><section>{cart?.items.length ? cart.items.map((item) => <article className="demo-cart-item" key={item.id}><div><small>{item.product?.sku ? `SKU ${item.product.sku}` : item.providerItemId}</small><h2>{item.product?.name || "Item needs verification"}</h2><p>{item.validation === "verified" ? "Live provider data verified" : "This item cannot currently be verified for checkout."}</p><div className="sc-cart-quantity"><button type="button" disabled={item.quantity <= 1} onClick={() => changeQuantity(item.id, item.quantity - 1)}>−</button><strong>{item.quantity}</strong><button type="button" disabled={item.quantity >= 999} onClick={() => changeQuantity(item.id, item.quantity + 1)}>+</button></div></div><strong>{item.product?.unitPrice !== undefined ? new Intl.NumberFormat("en-JM", { style: "currency", currency: item.product.currency || cart.currency }).format(item.product.unitPrice * item.quantity) : "Recheck required"}</strong><button onClick={() => removeItem(item.id)}>Remove</button></article>) : <div className="demo-empty"><PackageCheck size={35} /><h2>Your cart is empty</h2><a href={routeHref("/products")}>Browse products</a></div>}{error ? <p className="sc-account-real__error">{error}</p> : null}</section><aside><h2>Order summary</h2><div><span>Verified products</span><strong>{new Intl.NumberFormat("en-JM", { style: "currency", currency: cart?.currency || "JMD" }).format(persistentTotal)}</strong></div><div><span>Delivery & tax</span><strong>Recalculated at checkout</strong></div><button disabled={!verifiedItems.length || verifiedItems.length !== (cart?.items.length || 0)} onClick={() => go("/checkout")}>Continue to checkout</button><p>Checkout will create a short-lived server quote from current provider pricing.</p></aside></Container></div>;
}

export function CheckoutPage() {
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [authRequired, setAuthRequired] = useState(false);

  useEffect(() => {
    let active = true;
    createCheckoutQuote()
      .then((value) => { if (active) setQuote(value); })
      .catch((err: any) => { if (active) { setError(err?.message || "Checkout could not be prepared."); setAuthRequired(err?.status === 401); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const expiresLabel = useMemo(() => quote ? new Date(quote.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "", [quote]);

  if (loading) return <div className="demo-page"><Container className="demo-checkout"><section><span>Secure checkout</span><h1>Verifying your order</h1><p>SmartCommerce is rechecking current provider pricing before creating the checkout quote.</p></section></Container></div>;

  if (!quote) return <div className="demo-page"><Container className="demo-checkout"><section><span>Checkout unavailable</span><h1>We couldn’t prepare this order.</h1><p>{error}</p>{authRequired ? <button onClick={() => go("/account")}>Sign in</button> : <button onClick={() => go("/cart")}>Return to cart</button>}</section></Container></div>;

  return <div className="demo-page"><Container className="demo-checkout"><section><span>Secure checkout</span><h1>Review your verified order</h1><p>This quote is based on current provider data and expires at {expiresLabel}. Prices are not taken from browser state.</p><div className="sc-checkout-trust"><ShieldCheck size={22} /><div><strong>No card data is collected by SmartCommerce yet.</strong><span>Payment capture stays disabled until a real payment processor is connected and webhook verification is live.</span></div></div></section><section className="demo-flow-form">{quote.items.map((item) => <div key={item.productId} className="sc-checkout-line"><span>{item.quantity} × {item.name}</span><strong>{new Intl.NumberFormat("en-JM", { style: "currency", currency: item.currency }).format(item.unitPrice * item.quantity)}</strong></div>)}<div className="sc-checkout-line"><span>Subtotal</span><strong>{formatMinor(quote.subtotalMinor, quote.currency)}</strong></div><div className="sc-checkout-line"><span>Tax</span><strong>{formatMinor(quote.taxMinor, quote.currency)}</strong></div><div className="sc-checkout-line"><span>Delivery</span><strong>{quote.deliveryMinor ? formatMinor(quote.deliveryMinor, quote.currency) : "Not yet configured"}</strong></div><div className="demo-cart-total"><span>Verified total</span><strong>{formatMinor(quote.totalMinor, quote.currency)}</strong></div><button disabled>Payment setup required</button><p>Next implementation step: connect the payment provider, create an idempotent payment attempt, and confirm payment server-side before an order is marked paid.</p></section></Container></div>;
}

export function WishlistPage({ actions }: { actions: Actions }) {
  const products = getProducts();
  const items = products.filter((product) => actions.wishlist.includes(product.id));
  return <div className="demo-page"><section className="demo-page-hero"><Container><span>Saved Items</span><h1>Wishlist</h1><p>Keep products together while planning the job.</p></Container></section><Container className="demo-page-content">{items.length ? <div className="demo-product-grid">{items.map((product) => <ProductTile product={product} wished compared={actions.compared.includes(product.id)} onWishlist={actions.onWishlist} onCompare={actions.onCompare} onAdd={actions.onAdd} key={product.id} />)}</div> : <div className="demo-empty"><Heart size={35} /><h2>No saved products yet</h2><a href={routeHref("/products")}>Explore products</a></div>}</Container></div>;
}

export function AccountPage() { return <CustomerAccountPage />; }

export function ConfirmationPage({ type, item }: { type: "order" | "rental" | "repair" | "commercial"; item?: string }) {
  const content = { order: ["Order received", "", "Your order status will be shown after server-confirmed payment and provider synchronization."], rental: ["Equipment reserved", "RNT-88421", `${getRentalById(item || "")?.name || "Your equipment"} is held while the rental desk confirms delivery.`], repair: ["Repair booking submitted", "SRV-31982", "The selected branch will confirm inspection timing and intake details."], commercial: ["Commercial request received", "COM-10647", "A commercial account manager will review the business requirement and contact you."] }[type];
  return <div className="demo-page"><Container className="demo-confirmation"><CheckCircle2 size={58} /><span>{content[1] ? `Confirmation ${content[1]}` : "Confirmation"}</span><h1>{content[0]}</h1><p>{content[2]}</p><a href={routeHref("/")}>Return to Homepage</a></Container></div>;
}
