import { CheckCircle2, Heart, PackageCheck } from "lucide-react";
import ProductTile from "../components/demo/ProductTile";
import Container from "../components/shared/Container";
import { getProductById, getProducts } from "../data/products";
import { getRentalById } from "../data/rentals";
import { money } from "../lib/format";
import { go, routeHref } from "../lib/router";
import CustomerAccountPage from "./CustomerAccountPage";

type Actions = { wishlist: string[]; compared: string[]; onWishlist: (id: string) => void; onCompare: (id: string) => void; onAdd: (id: string) => void };

export function CartPage({ cart, remove }: { cart: string[]; remove: (id: string) => void }) {
  const items = cart.map(getProductById).filter(Boolean) as ReturnType<typeof getProducts>;
  const total = items.reduce((sum, item) => sum + item.price, 0);
  return <div className="demo-page"><section className="demo-page-hero"><Container><span>Shopping Cart</span><h1>Your project list</h1><p>Review selected products before continuing to the checkout demonstration.</p></Container></section><Container className="demo-cart-layout"><section>{items.length ? items.map((item) => <article className="demo-cart-item" key={item.id}><img src={item.image} alt={item.name} /><div><small>SKU {item.sku}</small><h2>{item.name}</h2><p>{item.stockStatus}</p></div><strong>{money(item.price)}</strong><button onClick={() => remove(item.id)}>Remove</button></article>) : <div className="demo-empty"><PackageCheck size={35} /><h2>Your cart is ready for a project</h2><a href={routeHref("/products")}>Browse products</a></div>}</section><aside><h2>Order summary</h2><div><span>Products</span><strong>{money(total)}</strong></div><div><span>Delivery</span><strong>Confirmed at checkout</strong></div><div className="demo-cart-total"><span>Estimated total</span><strong>{money(total)}</strong></div><button disabled={!items.length} onClick={() => go("/checkout")}>Checkout Demo</button><p>No payment details are collected.</p></aside></Container></div>;
}

export function CheckoutPage({ count }: { count: number }) {
  return <div className="demo-page"><Container className="demo-checkout"><section><span>Checkout Demo</span><h1>Delivery and contact details</h1><p>This flow demonstrates customer experience only. It does not process payment.</p></section><form className="demo-flow-form" onSubmit={(event) => { event.preventDefault(); go("/order-success"); }}><label>Full name<input required defaultValue="Jordan Williams" /></label><label>Email<input type="email" required defaultValue="jordan.williams@example.demo" /></label><label>Phone<input required defaultValue="876-555-0147" /></label><label>Delivery method<select><option>Islandwide delivery</option><option>Ocho Rios branch pickup</option><option>Kingston branch pickup</option><option>Drax Hall branch pickup</option></select></label><label>Delivery address<textarea required defaultValue="24 Hope Road, Kingston 6" /></label><button disabled={!count}>Place Demo Order ({count} items)</button></form></Container></div>;
}

export function WishlistPage({ actions }: { actions: Actions }) {
  const products = getProducts();
  const items = products.filter((product) => actions.wishlist.includes(product.id));
  return <div className="demo-page"><section className="demo-page-hero"><Container><span>Saved Items</span><h1>Wishlist</h1><p>Keep products together while planning the job.</p></Container></section><Container className="demo-page-content">{items.length ? <div className="demo-product-grid">{items.map((product) => <ProductTile product={product} wished compared={actions.compared.includes(product.id)} onWishlist={actions.onWishlist} onCompare={actions.onCompare} onAdd={actions.onAdd} key={product.id} />)}</div> : <div className="demo-empty"><Heart size={35} /><h2>No saved products yet</h2><a href={routeHref("/products")}>Explore products</a></div>}</Container></div>;
}

export function AccountPage() {
  return <CustomerAccountPage />;
}

export function ConfirmationPage({ type, item }: { type: "order" | "rental" | "repair" | "commercial"; item?: string }) {
  const content = { order: ["Order request received", "TTJ-260620-1842", "A demo confirmation has been created for your selected products."], rental: ["Equipment reserved", "RNT-88421", `${getRentalById(item || "")?.name || "Your equipment"} is held while the rental desk confirms delivery.`], repair: ["Repair booking submitted", "SRV-31982", "The selected branch will confirm inspection timing and intake details."], commercial: ["Commercial request received", "COM-10647", "A commercial account manager will review the business requirement and contact you."] }[type];
  return <div className="demo-page"><Container className="demo-confirmation"><CheckCircle2 size={58} /><span>Confirmation {content[1]}</span><h1>{content[0]}</h1><p>{content[2]}</p><div><strong>What happens next</strong><p>A Total Tools Jamaica team member follows up using the contact information supplied in the demo flow.</p></div><a href={routeHref("/")}>Return to Homepage</a></Container></div>;
}
