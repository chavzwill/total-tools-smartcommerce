import { useEffect, useMemo, useState } from "react";
import PageShell from "./components/layout/PageShell";
import { addPersistentCartItem } from "./lib/customerCommerce";
import { getRoute, go } from "./lib/router";
import HomePageV3 from "./pages/HomePageV3";
import AssistantPage from "./pages/AssistantPage";
import CommercialPage from "./pages/CommercialPage";
import { CategoriesPage, CategoryPage, ProductsPage, SearchPage } from "./pages/CatalogPages";
import DealsPage from "./pages/DealsPage";
import ProductDetailPage from "./pages/ProductDetailPage";
import RepairPage from "./pages/RepairPage";
import ProductMatchPage from "./pages/ProductMatchPage";
import { RentalDetailPage, RentalsPage } from "./pages/RentalPages";
import { AccountPage, CartPage, CheckoutPage, ConfirmationPage, WishlistPage } from "./pages/UtilityPages";

export default function App() {
  const [route, setRoute] = useState(getRoute());
  const [cart, setCart] = useState<string[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [compared, setCompared] = useState<string[]>([]);

  useEffect(() => {
    const update = () => setRoute(getRoute());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

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
            setCart((items) => items.includes(id) ? items : [...items, id]);
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
  else if (path === "/rentals") page = <RentalsPage />;
  else if (path.startsWith("/rental/")) page = <RentalDetailPage id={path.split("/")[2]} />;
  else if (path === "/repairs") page = <RepairPage />;
  else if (path === "/commercial") page = <CommercialPage quote={route.query.get("mode") === "quote"} />;
  else if (path === "/deals") page = <DealsPage />;
  else if (path === "/assistant") page = <AssistantPage initialPrompt={route.query.get("prompt") || ""} />;
  else if (path === "/product-match") page = <ProductMatchPage onAdd={actions.onAdd} />;
  else if (path === "/search") page = <SearchPage query={route.query.get("q") || ""} actions={actions} />;
  else if (path === "/cart") page = <CartPage guestCart={cart} removeGuest={(id) => setCart((items) => items.filter((item) => item !== id))} />;
  else if (path === "/wishlist") page = <WishlistPage actions={actions} />;
  else if (path === "/account") page = <AccountPage />;
  else if (path === "/checkout") page = <CheckoutPage />;
  else if (path === "/order-success") page = <ConfirmationPage type="order" />;
  else if (path === "/rental-confirmation") page = <ConfirmationPage type="rental" item={route.query.get("item") || ""} />;
  else if (path === "/repair-confirmation") page = <ConfirmationPage type="repair" />;
  else if (path === "/commercial-confirmation") page = <ConfirmationPage type="commercial" />;

  return <PageShell>{page}</PageShell>;
}
