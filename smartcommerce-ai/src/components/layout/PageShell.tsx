import type { ReactNode } from "react";
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
import CommerceToast from "./CommerceToast";
import Footer from "./Footer";
import Header from "./Header";
import MobileCommerceNav from "./MobileCommerceNav";
import PromoTicker from "./PromoTicker";
import UtilityBar from "./UtilityBar";

type PageShellProps = {
  children: ReactNode;
};

export default function PageShell({ children }: PageShellProps) {
  return (
    <div className="tt-app-shell">
      <a className="tt-skip-link" href="#main-content">Skip to main content</a>
      <UtilityBar />
      <Header />
      <PromoTicker />
      <main id="main-content" tabIndex={-1}>{children}</main>
      <Footer />
      <MobileCommerceNav />
      <CommerceToast />
    </div>
  );
}
