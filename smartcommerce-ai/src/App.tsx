import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import PageShell from "./components/layout/PageShell";
import { CART_FEEDBACK_EVENT, GUEST_CART_CHANGED_EVENT } from "./lib/commerceEvents";
import { addPersistentCartItem, type GuestCheckoutItem } from "./lib/customerCommerce";
import { getRoute } from "./lib/router";
import {
  SHOPPING_BRANCH_CHANGED_EVENT,
  isShoppingBranch,
} from "./lib/shoppingBranch";
import HomePageV3 from "./pages/HomePageV3";

const AssistantPage = lazy(() => import("./pages/AssistantPage"));
const CommercialPage = lazy(() => import("./pages/CommercialPage"));
const CommercialAccountingPage = lazy(() => import("./pages/CommercialAccountingPage"));
const ComparePage = lazy(() => import("./pages/ComparePage"));
const CategoriesPage = lazy(() => import("./pages/CatalogPages").then((module) => ({ default: module.CategoriesPage })));
const CategoryPage = lazy(() => import("./pages/CatalogPages").then((module) => ({ default: module.CategoryPage })));
const ProductsPage = lazy(() => import("./pages/CatalogPages").then((module) => ({ default: module.ProductsPage })));
const SearchPage = lazy(() => import("./pages/CatalogPages").then((module) => ({ default: module.SearchPage })));
const DealsPage = lazy(() => import("./pages/DealsPage"));
const ProductDetailPage = lazy(() => import("./pages/ProductDetailPage"));
const RepairPage = lazy(() => import("./pages/RepairPage"));
const ProductMatchPage = lazy(() => import("./pages/ProductMatchPage"));
const RentalsPage = lazy(() => import("./pages/RentalPages").then((module) => ({ default: module.RentalsPage })));
const OperationalRentalDetailPage = lazy(() => import("./pages/OperationalRentalDetailPage"));
const AccountPage = lazy(() => import("./pages/UtilityPages").then((module) => ({ default: module.AccountPage })));
const CartPage = lazy(() => import("./pages/UtilityPages").then((module) => ({ default: module.CartPage })));
const CheckoutPage = lazy(() => import("./pages/CheckoutPage"));
const ConfirmationPage = lazy(() => import("./pages/UtilityPages").then((module) => ({ default: module.ConfirmationPage })));
const WishlistPage = lazy(() => import("./pages/UtilityPages").then((module) => ({ default: module.WishlistPage })));

const GUEST_CART_KEY = "smartcommerce_guest_cart_v1";
const WISHLIST_KEY = "smartcommerce_guest_wishlist_v1";
const COMPARE_KEY = "smartcommerce_guest_compare_v1";

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

function loadIdList(key: string): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
    if (!Array.isArray(parsed)) return [];
    return Array.from(new Set(parsed.map((value) => String(value || "").trim()).filter(Boolean))).slice(0, 100);
  } catch {
    return [];
  }
}

function announceCart(message: string, tone: "success" | "error" = "success") {
  window.dispatchEvent(new CustomEvent(CART_FEEDBACK_EVENT, { detail: { message, tone } }));
}

function RouteFallback() {
  return (
    <div className="sc-route-loading" role="status" aria-live="polite" aria-busy="true">
      <span aria-hidden="true" />
      <strong>Loading this part of SmartCommerce…</strong>
    </div>
  );
}

function branchScopedPath(path: string) {
  return path === "/products" || path === "/search" || path === "/rentals" || path.startsWith("/category/");
}

export default function App() {
  const [route, setRoute] = useState(getRoute());
  const [cart, setCart] = useState<GuestCheckoutItem[]>(loadGuestCart);
  const [wishlist, setWishlist] = useState<string[]>(() => loadIdList(WISHLIST_KEY));
  const [compared, setCompared] = useState<string[]>(() => loadIdList(COMPARE_KEY));

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
    const syncActiveCommerceBranch = (event: Event) => {
      const branch = (event as CustomEvent<{ branch?: unknown }>).detail?.branch;
      if (!isShoppingBranch(branch)) return;
      const current = getRoute();
      if (!branchScopedPath(current.path)) return;

      const query = new URLSearchParams(current.query);
      if (branch === "Online") query.delete("branch");
      else query.set("branch", branch);
      const queryString = query.toString();
      const nextHash = `#${current.path}${queryString ? `?${queryString}` : ""}`;
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${nextHash}`);
      setRoute(getRoute());
    };

    window.addEventListener(SHOPPING_BRANCH_CHANGED_EVENT, syncActiveCommerceBranch);
    return () => window.removeEventListener(SHOPPING_BRANCH_CHANGED_EVENT, syncActiveCommerceBranch);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify(cart));
    window.dispatchEvent(new CustomEvent(GUEST_CART_CHANGED_EVENT, { detail: { count: cart.reduce((sum, item) => sum + item.quantity, 0) } }));
  }, [cart]);

  useEffect(() => {
    window.localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist));
  }, [wishlist]);

  useEffect(() => {
    window.localStorage.setItem(COMPARE_KEY, JSON.stringify(compared));
  }, [compared]);

  const toggle = (setter: React.Dispatch<React.SetStateAction<string[]>>, id: string) => setter((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  const actions = useMemo(() => ({
    wishlist,
    compared,
    onWishlist: (id: string) => toggle(setWishlist, id),
    onCompare: (id: string) => toggle(setCompared, id),
    onAdd: (id: string, requestedQuantity = 1) => {
      const quantity = Math.max(1, Math.min(999, Math.trunc(requestedQuantity || 1)));
      void addPersistentCartItem(id, quantity)
        .then(() => announceCart(`${quantity > 1 ? `${quantity} items` : "Item"} added to your cart.`))
        .catch((error: any) => {
          if (error?.status === 401) {
            setCart((items) => {
              const existing = items.find((item) => item.productId === id);
              if (existing) return items.map((item) => item.productId === id ? { ...item, quantity: Math.min(999, item.quantity + quantity) } : item);
              return [...items, { productId: id, quantity }];
            });
            announceCart(`${quantity > 1 ? `${quantity} items` : "Item"} added to your guest cart.`);
            return;
          }
          announceCart(error?.message || "We could not add that item. Please try again.", "error");
        });
    }
  }), [wishlist, compared]);

  const path = route.path;
  const branchRouteKey = route.query.get("branch") || "Online";
  let page = <HomePageV3 {...actions} />;
  if (path === "/products") page = <ProductsPage key={`products:${branchRouteKey}`} actions={actions} />;
  else if (path === "/categories") page = <CategoriesPage />;
  else if (path.startsWith("/category/")) page = <CategoryPage key={`category:${path}:${branchRouteKey}`} slug={path.split("/")[2]} subcategory={route.query.get("sub") || undefined} actions={actions} />;
  else if (path.startsWith("/product/")) { const id = path.split("/")[2]; page = <ProductDetailPage id={id} wished={wishlist.includes(id)} onWishlist={actions.onWishlist} onAdd={actions.onAdd} />; }
  else if (path === "/compare") page = <ComparePage compared={compared} onCompare={actions.onCompare} onAdd={actions.onAdd} />;
  else if (path === "/rentals") page = <RentalsPage key={`rentals:${branchRouteKey}`} />;
  else if (path.startsWith("/rental/")) page = <OperationalRentalDetailPage id={path.split("/")[2]} />;
  else if (path === "/repairs") page = <RepairPage />;
  else if (path === "/commercial") page = <CommercialPage quote={route.query.get("mode") === "quote"} />;
  else if (path === "/commercial/accounting") page = <CommercialAccountingPage />;
  else if (path === "/deals") page = <DealsPage />;
  else if (path === "/assistant") page = <AssistantPage initialPrompt={route.query.get("prompt") || ""} onAdd={actions.onAdd} />;
  else if (path === "/product-match") page = <ProductMatchPage onAdd={actions.onAdd} />;
  else if (path === "/search") page = <SearchPage key={`search:${branchRouteKey}`} query={route.query.get("q") || ""} actions={actions} />;
  else if (path === "/cart") page = <CartPage guestCart={cart} setGuestQuantity={(id, quantity) => setCart((items) => quantity <= 0 ? items.filter((item) => item.productId !== id) : items.map((item) => item.productId === id ? { ...item, quantity: Math.min(999, quantity) } : item))} removeGuest={(id) => setCart((items) => items.filter((item) => item.productId !== id))} />;
  else if (path === "/wishlist") page = <WishlistPage actions={actions} />;
  else if (path === "/account") page = <AccountPage />;
  else if (path === "/checkout") page = <CheckoutPage guestCart={cart} />;
  else if (path === "/order-success") page = <ConfirmationPage type="order" reference={route.query.get("ref") || undefined} status={route.query.get("status") || undefined} />;
  else if (path === "/rental-confirmation") page = <ConfirmationPage type="rental" item={route.query.get("item") || ""} reference={route.query.get("ref") || undefined} status={route.query.get("status") || undefined} />;
  else if (path === "/repair-confirmation") page = <ConfirmationPage type="repair" reference={route.query.get("ref") || undefined} status={route.query.get("status") || undefined} />;
  else if (path === "/commercial-confirmation") page = <ConfirmationPage type="commercial" reference={route.query.get("ref") || undefined} status={route.query.get("status") || undefined} />;

  return <PageShell><Suspense fallback={<RouteFallback />}>{page}</Suspense></PageShell>;
}
