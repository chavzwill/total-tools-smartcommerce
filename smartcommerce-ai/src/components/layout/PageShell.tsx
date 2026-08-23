import { useEffect, type ReactNode } from "react";
import { GUEST_CART_CHANGED_EVENT } from "../../lib/commerceEvents";
import { logChannelEvent } from "../../lib/channelTelemetry";
import "../../styles/shell.css";
import "../../styles/premium-experience.css";
import "../../styles/retail-joy.css";
import "../../styles/mobile-commerce.css";
import "../../styles/brand-correction.css";
import "../../styles/design-system.css";
import "../../styles/commerce-shell.css";
import "../../styles/shopping-experience.css";
import "../../styles/product-detail.css";
import "../../styles/home-experience.css";
import "../../styles/service-commercial.css";
import "../../styles/assistant-experience.css";
import "../../styles/product-match-experience.css";
import "../../styles/accessibility-responsive.css";
import "../../styles/guided-mode.css";
import GuidedMode from "../guidance/GuidedMode";
import CommerceToast from "./CommerceToast";
import Footer from "./Footer";
import Header from "./Header";
import MobileCommerceNav from "./MobileCommerceNav";
import PromoTicker from "./PromoTicker";
import UtilityBar from "./UtilityBar";
import RentalDueAlert from "../rentals/RentalDueAlert";

type PageShellProps = {
  children: ReactNode;
};

function safeRoute() {
  const raw = window.location.hash.replace(/^#/, "") || "/";
  const path = raw.split("?")[0] || "/";
  return path.slice(0, 180);
}

export default function PageShell({ children }: PageShellProps) {
  useEffect(() => {
    const recordPage = () => logChannelEvent("page_view", { path: safeRoute() }, { entityType: "page" });
    const recordCart = (event: Event) => {
      const count = Number((event as CustomEvent<{ count?: unknown }>).detail?.count || 0);
      logChannelEvent("cart_changed", { itemCount: Number.isFinite(count) ? Math.max(0, count) : 0 }, { entityType: "cart" });
    };
    recordPage();
    window.addEventListener("hashchange", recordPage);
    window.addEventListener(GUEST_CART_CHANGED_EVENT, recordCart);
    return () => {
      window.removeEventListener("hashchange", recordPage);
      window.removeEventListener(GUEST_CART_CHANGED_EVENT, recordCart);
    };
  }, []);

  return (
    <div className="tt-app-shell">
      <a className="tt-skip-link" href="#main-content">Skip to main content</a>
      <UtilityBar />
      <Header />
      <PromoTicker />
      <RentalDueAlert />
      <main id="main-content" tabIndex={-1}>{children}</main>
      <Footer />
      <MobileCommerceNav />
      <CommerceToast />
      <GuidedMode />
    </div>
  );
}
