import {
  Boxes,
  ClipboardList,
  Gauge,
  PackageSearch,
  ReceiptText,
  ShoppingCart,
  UsersRound,
  Wrench,
} from "lucide-react";
import type { ReactNode } from "react";
import "../../styles/operations-workspace.css";

type OperationsSection =
  | "overview"
  | "pos"
  | "repairs"
  | "technicians"
  | "inventory"
  | "purchasing"
  | "quotes"
  | "reports";

type OperationsWorkspaceProps = {
  section: OperationsSection;
  title: string;
  description?: string;
  branchLabel?: string;
  employeeLabel?: string;
  children: ReactNode;
  onNavigate?: (section: OperationsSection) => void;
};

const sections: Array<{
  id: OperationsSection;
  label: string;
  icon: typeof Gauge;
}> = [
  { id: "overview", label: "Operations", icon: Gauge },
  { id: "pos", label: "Point of sale", icon: ShoppingCart },
  { id: "repairs", label: "Repairs", icon: Wrench },
  { id: "technicians", label: "Technicians", icon: UsersRound },
  { id: "inventory", label: "Inventory", icon: Boxes },
  { id: "purchasing", label: "Purchasing", icon: PackageSearch },
  { id: "quotes", label: "Quotes", icon: ClipboardList },
  { id: "reports", label: "Reports", icon: ReceiptText },
];

export default function OperationsWorkspace({
  section,
  title,
  description,
  branchLabel,
  employeeLabel,
  children,
  onNavigate,
}: OperationsWorkspaceProps) {
  return (
    <div className="sc-ops-shell">
      <aside className="sc-ops-sidebar" aria-label="POS and service navigation">
        <div className="sc-ops-sidebar__brand">
          <span>Total Tools</span>
          <strong>Operations</strong>
        </div>
        <nav>
          {sections.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={item.id === section ? "is-active" : undefined}
                aria-current={item.id === section ? "page" : undefined}
                onClick={() => onNavigate?.(item.id)}
                data-guide-id={`operations-${item.id}`}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="sc-ops-main">
        <header className="sc-ops-topbar">
          <div>
            <span className="sc-ops-eyebrow">Total Tools Jamaica</span>
            <h1>{title}</h1>
            {description ? <p>{description}</p> : null}
          </div>
          <div className="sc-ops-context" aria-label="Current operations context">
            {branchLabel ? <span><small>Branch</small><strong>{branchLabel}</strong></span> : null}
            {employeeLabel ? <span><small>Signed in</small><strong>{employeeLabel}</strong></span> : null}
          </div>
        </header>

        <main className="sc-ops-content" id="operations-main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
