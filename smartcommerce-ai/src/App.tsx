import { useEffect, useMemo, useState } from "react";
import PageShell from "./components/layout/PageShell";
import { addPersistentCartItem, type GuestCheckoutItem } from "./lib/customerCommerce";
import { getRoute, go } from "./lib/router";
import HomePageV3 from "./pages/HomePageV3";
import AssistantPage from "./pages/AssistantPage";
import CommercialPage from "./pages/CommercialPage";
import ComparePage from "./pages/ComparePage";
import { CategoriesPage, CategoryPage, ProductsPage, SearchPage } from "./pages/CatalogPages";
import DealsPage from "./pages/DealsPage";
import ProductDetailPage from "./pages/ProductDetailPage";
import RepairPage from "./pages/RepairPage";
import ProductMatchPage from "./pages/ProductMatchPage";
import { RentalsPage } from "./pages/RentalPages";
import OperationalRentalDetailPage from "./pages/OperationalRentalDetailPage";
import { AccountPage, CartPage, CheckoutPage, ConfirmationPage, WishlistPage } from "./pages/UtilityPages";

const GUEST_CART_KEY = "smartcommerce_guest_cart_v1";
export const GUEST_CART_CHANGED_EVENT = "smartcommerce:guest-cart-changed";

function loadGuestCart(): GuestCheckoutItem[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(GUEST_CART_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({ productId: String(item?.productId || ""), quantity: Number(item?.quantity || 0) }))
      .filter((item) => item.productId && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 999);
  } catch {
    return [];
  }
}

export default function App() {
  const [route, setRoute] = useState(getRoute());
  const [cart, setCart] = useState<GuestCheckoutItem[]>(loadGuestCart);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [compared, setCompared] = useState<string[]>([]);

  useEffect(() => {
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";

    const update = () => {
      setRoute(getRoute());
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      });
    };

    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify(cart));
    window.dispatchEvent(new CustomEvent(GUEST_CART_CHANGED_EVENT, { detail: { count: cart.reduce((sum, item) => sum + item.quantity, 0) } }));
  }, [cart]);

  const toggle = (setter: React.Dispatch<React.SetStateAction<string[]>>, id: string) => setter((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  const actions = useMemo(() => ({
    wishlist,
    compared,
    onWishlist: (id: string) => toggle(setWishlist, id),
    onCompare: (id: string) => toggle(setCompared, id),
    onAdd: (id: string) => {
      void addPersistentCartItem(id, 1)
        .then(() => go("/cart"))
        .catch((error: any) => {
          if (error?.status === 401) {
            setCart((items) => {
              const existing = items.find((item) => item.productId === id);
              if (existing) return items.map((item) => item.productId === id ? { ...item, quantity: Math.min(999, item.quantity + 1) } : item);
              return [...items, { productId: id, quantity: 1 }];
            });
            go("/cart");
            return;
          }
          go("/cart");
        });
    }
  }), [wishlist, compared]);

  const path = route.path;
  let page = <HomePageV3 {...actions} />;
  if (path === "/products") page = <ProductsPage actions={actions} />;
  else if (path === "/categories") page = <CategoriesPage />;
  else if (path.startsWith("/category/")) page = <CategoryPage slug={path.split("/")[2]} subcategory={route.query.get("sub") || undefined} actions={actions} />;
  else if (path.startsWith("/product/")) { const id = path.split("/")[2]; page = <ProductDetailPage id={id} wished={wishlist.includes(id)} onWishlist={actions.onWishlist} onAdd={actions.onAdd} />; }
  else if (path === "/compare") page = <ComparePage compared={compared} onCompare={actions.onCompare} onAdd={actions.onAdd} />;
  else if (path === "/rentals") page = <RentalsPage />;
  else if (path.startsWith("/rental/")) page = <OperationalRentalDetailPage id={path.split("/")[2]} />;
  else if (path === "/repairs") page = <RepairPage />;
  else if (path === "/commercial") page = <CommercialPage quote={route.query.get("mode") === "quote"} />;
  else if (path === "/deals") page = <DealsPage />;
  else if (path === "/assistant") page = <AssistantPage initialPrompt={route.query.get("prompt") || ""} />;
  else if (path === "/product-match") page = <ProductMatchPage onAdd={actions.onAdd} />;
  else if (path === "/search") page = <SearchPage query={route.query.get("q") || ""} actions={actions} />;
  else if (path === "/cart") page = <CartPage guestCart={cart} setGuestQuantity={(id, quantity) => setCart((items) => quantity <= 0 ? items.filter((item) => item.productId !== id) : items.map((item) => item.productId === id ? { ...item, quantity: Math.min(999, quantity) } : item))} removeGuest={(id) => setCart((items) => items.filter((item) => item.productId !== id))} />;
  else if (path === "/wishlist") page = <WishlistPage actions={actions} />;
  else if (path === "/account") page = <AccountPage />;
  else if (path === "/checkout") page = <CheckoutPage guestCart={cart} />;
  else if (path === "/order-success") page = <ConfirmationPage type="order" reference={route.query.get("ref") || undefined} status={route.query.get("status") || undefined} />;
  else if (path === "/rental-confirmation") page = <ConfirmationPage type="rental" item={route.query.get("item") || ""} reference={route.query.get("ref") || undefined} status={route.query.get("status") || undefined} />;
  else if (path === "/repair-confirmation") page = <ConfirmationPage type="repair" reference={route.query.get("ref") || undefined} status={route.query.get("status") || undefined} />;
  else if (path === "/commercial-confirmation") page = <ConfirmationPage type="commercial" reference={route.query.get("ref") || undefined} status={route.query.get("status") || undefined} />;

  return <PageShell>{page}</PageShell>;
}
