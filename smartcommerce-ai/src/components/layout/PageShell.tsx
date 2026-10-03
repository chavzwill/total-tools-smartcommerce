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
import RentalDueAlert from "../rentals/RentalDueAlert";

type PageShellProps = {
  children: ReactNode;
};

export default function PageShell({ children }: PageShellProps) {
  return (
    <div className="tt-app-shell">
      <a className="tt-skip-link" href="#main-content">Skip to main content</a>
      <Header />
      <RentalDueAlert />
      <main id="main-content" tabIndex={-1}>{children}</main>
      <Footer />
      <MobileCommerceNav />
      <CommerceToast />
      <GuidedMode />
    </div>
  );
}
