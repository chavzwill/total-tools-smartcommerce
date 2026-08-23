import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleHelp, MousePointer2, Search, Sparkles, X } from "lucide-react";
import { go } from "../../lib/router";

type Target = { selector?: string; text?: string; ariaLabel?: string };
type GuideStep = {
  id: string;
  title: string;
  instruction: string;
  target?: Target;
  route?: string;
  advanceOnClick?: boolean;
  optional?: boolean;
  missingMessage?: string;
};
type GuideFlow = {
  id: string;
  title: string;
  description: string;
  keywords: string[];
  context?: "storefront" | "operations" | "any";
  steps: GuideStep[];
};
type HighlightRect = { top: number; left: number; width: number; height: number };

const OPEN_GUIDED_MODE_EVENT = "smartcommerce:guided-mode-open";
const opsNav = (section: string): Target => ({ selector: `[data-guide-id="operations-${section}"]` });
const workspace = (text?: string): Target => text ? ({ selector: "#operations-main-content button, #operations-main-content a, #operations-main-content input, #operations-main-content select, #operations-main-content textarea", text }) : ({ selector: "#operations-main-content" });
const opsStep = (id: string, section: string, title: string, instruction: string): GuideStep => ({ id, title, instruction, target: opsNav(section), advanceOnClick: true, missingMessage: "This workspace is not available with your current staff permissions. Ask an administrator if you need access." });

const flows: GuideFlow[] = [
  {
    id: "ops-sale", title: "Complete a POS sale", context: "operations",
    description: "Open checkout, build a stock-aware cart and complete payment through the live POS.",
    keywords: ["sale", "sell item", "checkout customer", "cash sale", "card sale", "pos sale", "ring up", "take payment", "split payment"],
    steps: [
      opsStep("pos-nav", "pos", "Open Point of sale", "Click Point of sale in Operations."),
      { id: "pos-product", title: "Find or scan the product", instruction: "Use the product search or barcode control to find the exact stocked item. Select the correct variation where applicable.", target: workspace("Search"), missingMessage: "The checkout search is not visible yet. Confirm a drawer session is open and the Point of sale workspace has loaded." },
      { id: "pos-customer", title: "Choose the customer when needed", instruction: "Use customer search for a registered customer, commercial account or Charge Account sale. Leave the transaction as walk-in when appropriate.", target: workspace("Customer"), optional: true },
      { id: "pos-cart", title: "Review the cart", instruction: "Confirm product, variation, quantity, live price, tax and any authorized discount before payment.", target: { selector: "#operations-main-content" } },
      { id: "pos-pay", title: "Choose tender and complete payment", instruction: "Choose cash, card, cheque, direct deposit, gift card, Charge Account or split tender. For cash, enter amount tendered and verify change before completing the sale.", target: workspace("Complete"), missingMessage: "A completion control is not available yet. The cart may be empty, the drawer may be closed, or required payment information may still be missing." },
    ],
  },
  {
    id: "ops-hold-sale", title: "Hold and recall a sale", context: "operations",
    description: "Temporarily save a customer cart and recall it later without processing payment.",
    keywords: ["hold sale", "suspend sale", "save cart", "recall sale", "recall hold", "park transaction"],
    steps: [
      opsStep("hold-nav", "pos", "Open Point of sale", "Click Point of sale."),
      { id: "hold-build", title: "Build the cart", instruction: "Add the customer and products that need to be held.", target: workspace("Search") },
      { id: "hold-action", title: "Hold the transaction", instruction: "Use the Hold action. A held order does not capture payment or deduct inventory.", target: workspace("Hold"), missingMessage: "The Hold action only appears when the checkout state can be saved." },
      { id: "recall-action", title: "Recall it later", instruction: "Use the held-sales/recall control, select the correct held transaction, review current stock and pricing, then continue normal checkout.", target: workspace("Recall"), optional: true },
    ],
  },
  {
    id: "ops-drawer-open", title: "Open a cash drawer", context: "operations",
    description: "Start the cashier session with the correct opening float.",
    keywords: ["open drawer", "start drawer", "opening float", "start shift", "cashier shift"],
    steps: [
      opsStep("drawer-nav", "pos", "Open Point of sale", "Click Point of sale."),
      { id: "drawer-open", title: "Open the drawer session", instruction: "Find the drawer session control, enter the verified opening float, and open the session before taking payments.", target: workspace("Open"), missingMessage: "If no drawer-open control is visible, you may already have an active session or your security group may restrict drawer operations." },
    ],
  },
  {
    id: "ops-drawer-close", title: "Close and reconcile a cash drawer", context: "operations",
    description: "Count physical tender, explain variance and close the cashier session.",
    keywords: ["close drawer", "reconcile drawer", "cash count", "end shift", "drawer variance", "over short"],
    steps: [
      opsStep("drawer-close-nav", "pos", "Open Point of sale", "Click Point of sale."),
      { id: "drawer-denominations", title: "Count physical cash", instruction: "Enter the physical denomination counts. Guided Mode will keep you in the drawer reconciliation area while the system calculates counted cash and expected cash.", target: workspace("denomination"), optional: true },
      { id: "drawer-other", title: "Verify other tender totals", instruction: "Confirm card, cheque, gift card, credit/Charge Account and direct-deposit totals against the shift evidence.", target: workspace("reconcile"), optional: true },
      { id: "drawer-finish", title: "Reconcile and close", instruction: "Review the over/short variance, add a reconciliation note when needed, then use Reconcile and close.", target: workspace("close"), missingMessage: "The close control may be unavailable until an active drawer session exists and required count fields are complete." },
    ],
  },
  {
    id: "ops-return", title: "Return or refund a sale", context: "operations",
    description: "Find the original transaction and process an authorized item return.",
    keywords: ["return sale", "return item", "refund", "customer return", "credit note", "replacement"],
    steps: [
      opsStep("return-nav", "pos", "Open Point of sale", "Click Point of sale."),
      { id: "return-search", title: "Find the original transaction", instruction: "Use transaction/receipt lookup and open the exact original sale before returning anything.", target: workspace("transaction") },
      { id: "return-items", title: "Choose the return quantities", instruction: "Select only the items and quantities physically being returned. The POS protects against returning more than was purchased or more than the remaining returnable quantity.", target: workspace("Return"), missingMessage: "A Return action is shown only for eligible transactions and authorized staff." },
      { id: "return-method", title: "Choose the outcome", instruction: "Choose refund, replacement or credit note as permitted, add the required notes, then submit through the POS return workflow.", target: workspace("refund"), optional: true },
    ],
  },
  {
    id: "ops-void", title: "Void a transaction", context: "operations",
    description: "Use the supervised two-person void workflow for an eligible transaction.",
    keywords: ["void transaction", "void sale", "cancel transaction", "supervisor void"],
    steps: [
      opsStep("void-nav", "pos", "Open Point of sale", "Click Point of sale."),
      { id: "void-find", title: "Open the transaction", instruction: "Find and open the exact transaction that needs to be voided.", target: workspace("transaction") },
      { id: "void-action", title: "Start supervised void", instruction: "Choose Void, enter the mandatory reason, then have an active authorized supervisor enter their override PIN. Do not share or store supervisor PINs.", target: workspace("Void"), missingMessage: "Void is limited by transaction state and supervisor authorization. If the action is absent, the record may not be eligible or your workflow may require a different reversal." },
    ],
  },
  {
    id: "ops-repair", title: "Create or work a repair", context: "operations",
    description: "Open work orders, assess equipment, assign work and progress it through service.",
    keywords: ["repair", "work order", "service repair", "assess repair", "technician repair", "repair intake", "diagnosis"],
    steps: [
      opsStep("repair-nav", "repairs", "Open Repairs", "Click Repairs in Operations."),
      { id: "repair-list", title: "Find the work order", instruction: "Search or select the correct active work order. Open it to view customer, equipment, authorization, parts, task and payment evidence.", target: { selector: "#operations-main-content" } },
      { id: "repair-assess", title: "Use the permitted repair action", instruction: "Continue assessment, authorization, parts assignment, technician task, QC or collection according to the work order's current state and your security permissions.", target: { selector: "#operations-main-content button" }, missingMessage: "No eligible action is currently visible. The work order state or your permission set may not allow the next transition." },
    ],
  },
  {
    id: "ops-technician", title: "View technician work", context: "operations",
    description: "See active technician tasks and open the related work order.",
    keywords: ["technician", "technician task", "who is working", "active tasks", "technician workload"],
    steps: [
      opsStep("tech-nav", "technicians", "Open Technicians", "Click Technicians."),
      { id: "tech-board", title: "Review active technician tasks", instruction: "Use the live task board to see who is working and open the related work order when you need detail.", target: { selector: "#operations-main-content" } },
    ],
  },
  {
    id: "ops-rental", title: "Work with a rental", context: "operations",
    description: "Open rental operations and continue an approved rental through issue, return or settlement.",
    keywords: ["rental", "rent out", "rental issue", "rental return", "rental agreement", "overdue rental", "rental settlement"],
    steps: [
      opsStep("rental-nav", "rentals", "Open Rentals", "Click Rentals in Operations."),
      { id: "rental-record", title: "Open the rental record", instruction: "Find the live rental agreement and verify customer, equipment, dates, branch, deposit/eligibility and current status before taking action.", target: { selector: "#operations-main-content" } },
      { id: "rental-action", title: "Continue the authorized lifecycle", instruction: "Use the action allowed by the agreement state—verification, issue, return, extension, settlement or exception handling. Do not bypass identity, deposit or availability controls.", target: { selector: "#operations-main-content button" }, optional: true },
    ],
  },
  {
    id: "ops-stock-adjust", title: "Adjust inventory", context: "operations",
    description: "Post a controlled reason-coded stock correction to the inventory ledger.",
    keywords: ["adjust inventory", "stock adjustment", "write off", "damaged stock", "stock found", "inventory correction", "remove inventory"],
    steps: [
      opsStep("inventory-nav", "inventory", "Open Inventory", "Click Inventory."),
      { id: "inventory-product", title: "Choose the exact product and branch", instruction: "Select the authoritative POS product and the branch whose physical quantity is changing. Verify the current quantity first.", target: workspace("product") },
      { id: "inventory-delta", title: "Enter the adjustment", instruction: "Enter the whole-number positive or negative adjustment. Review the projected stock; the system will block a result below zero.", target: workspace("adjust") },
      { id: "inventory-reason", title: "Record the reason", instruction: "Choose the correct reason—cycle-count correction, damaged stock, write-off/disposal, stock found, receiving correction, return correction or migration correction—and add enough detail for audit.", target: workspace("reason") },
      { id: "inventory-post", title: "Post the adjustment", instruction: "Review current → adjustment → projected quantity, then post. The movement becomes part of the authoritative stock ledger.", target: workspace("Post"), optional: true },
    ],
  },
  {
    id: "ops-cycle-count", title: "Run a physical or cycle count", context: "operations",
    description: "Start a branch/bin count, record physical quantities and commit reviewed variances.",
    keywords: ["cycle count", "physical count", "stock count", "inventory count", "count variance", "bin count"],
    steps: [
      opsStep("count-nav", "inventory", "Open Inventory", "Click Inventory."),
      { id: "count-start", title: "Start the count session", instruction: "Start a full-branch count or choose a specific bin. The POS snapshots expected inventory for the session.", target: workspace("count") },
      { id: "count-enter", title: "Record physical quantities", instruction: "Enter the quantities physically counted. Save partial work when necessary; do not change stock manually just to make the count match.", target: { selector: "#operations-main-content" } },
      { id: "count-review", title: "Review and commit variances", instruction: "Review expected versus counted quantities. Once approved, commit the count so each variance is written to the stock movement ledger with the count reference.", target: workspace("commit"), optional: true },
    ],
  },
  {
    id: "ops-purchase-request", title: "Create or approve a purchase request", context: "operations",
    description: "Move an internal procurement need through draft, submit and approval.",
    keywords: ["purchase request", "pr", "requisition", "request stock", "approve purchase request", "procurement request"],
    steps: [
      opsStep("pr-nav", "purchasing", "Open Purchasing", "Click Purchasing."),
      { id: "pr-area", title: "Open Purchase Requests", instruction: "Use the Purchase Request area to create a draft or find a submitted request awaiting your decision.", target: workspace("Purchase Request") },
      { id: "pr-review", title: "Review the demand", instruction: "Verify branch, items, quantities, supplier/cost evidence, required date and notes. Submit drafts or approve/reject submitted requests according to your permission.", target: { selector: "#operations-main-content" } },
      { id: "pr-convert", title: "Convert approved PR to PO", instruction: "When an approved request is ready for supplier ordering, use Convert to PO. The POS creates the real PO and keeps the PR linked for audit.", target: workspace("Convert"), optional: true },
    ],
  },
  {
    id: "ops-po", title: "Create, revise or copy a purchase order", context: "operations",
    description: "Manage the controlled purchase-order lifecycle without rewriting history.",
    keywords: ["purchase order", "po", "create po", "edit po", "revise po", "copy po", "cancel po", "approve po", "send po"],
    steps: [
      opsStep("po-nav", "purchasing", "Open Purchasing", "Click Purchasing."),
      { id: "po-select", title: "Open Purchase Order Control", instruction: "Find or select the purchase order. Review supplier, branch, expected date and lines before changing its lifecycle.", target: workspace("Purchase Order") },
      { id: "po-action", title: "Choose the correct lifecycle action", instruction: "Use Revise to create an audit-safe replacement draft, Copy as New to reuse an old PO, Cancel to stop an eligible PO, Send when issued to supplier, or Approve when you have purchasing approval authority.", target: { selector: "#operations-main-content button" } },
    ],
  },
  {
    id: "ops-receive-po", title: "Receive a purchase order", context: "operations",
    description: "Record partial or complete supplier receipt using remaining quantities only.",
    keywords: ["receive po", "receive purchase order", "goods received", "partial receiving", "receive stock", "po receiving", "supplier delivery"],
    steps: [
      opsStep("receive-nav", "purchasing", "Open Purchasing", "Click Purchasing."),
      { id: "receive-po", title: "Select the PO to receive", instruction: "Open the approved/sent/partial purchase order that matches the supplier delivery. Fully received and cancelled POs remain locked.", target: workspace("Receiving") },
      { id: "receive-lines", title: "Enter what physically arrived", instruction: "For every line, enter only the quantity physically received now. The system limits entry to the remaining ordered quantity and supports partial receipts.", target: { selector: "#operations-main-content" } },
      { id: "receive-submit", title: "Post the receipt", instruction: "Review the receipt and post it. The POS updates branch/global inventory and advances the PO state. Capture discrepancy/freight/invoice evidence in the supported notes/attachments until structured upstream fields are added.", target: workspace("Receive"), optional: true },
    ],
  },
  {
    id: "ops-transfer", title: "Create or receive a branch transfer", context: "operations",
    description: "Move stock between branches using the real transfer lifecycle.",
    keywords: ["branch transfer", "transfer stock", "move stock", "smart transfer", "receive transfer", "dispatch transfer", "in transit"],
    steps: [
      opsStep("transfer-nav", "purchasing", "Open Purchasing", "Click Purchasing."),
      { id: "transfer-area", title: "Open Branch Transfers", instruction: "Go to Branch Transfers. For a new transfer, verify source and destination branches and live source availability before creation.", target: workspace("Transfer") },
      { id: "transfer-create", title: "Create only after review", instruction: "Creating the transfer is the human approval boundary because source stock is immediately reserved/deducted. Confirm the stock impact before creating it.", target: workspace("Create") },
      { id: "transfer-lifecycle", title: "Dispatch and receive", instruction: "Dispatch the transfer, track it in transit, then record only quantities physically received at the destination. Cancel only the unreceived remainder when necessary.", target: { selector: "#operations-main-content" } },
    ],
  },
  {
    id: "ops-quote", title: "Create or manage a quotation", context: "operations",
    description: "Prepare a commercial quote and move it through send, decision and POS conversion.",
    keywords: ["quote", "quotation", "create quote", "commercial quote", "accept quote", "decline quote", "convert quote", "copy quote"],
    steps: [
      opsStep("quote-nav", "quotes", "Open Quotations", "Click Quotes."),
      { id: "quote-create", title: "Create or open the quotation", instruction: "Create a new quotation or open an existing one. Verify customer, branch, lines, quantities, live sourcing, validity and notes.", target: { selector: "#operations-main-content" } },
      { id: "quote-lifecycle", title: "Use the controlled lifecycle", instruction: "Creators may edit/copy and mark Sent. Acceptance/decline requires quotation approval authority. Conversion requires quotation conversion permission and creates a held POS sale rather than pretending payment occurred.", target: { selector: "#operations-main-content button" } },
    ],
  },
  {
    id: "ops-review", title: "Review a SmartCommerce, website or app request", context: "operations",
    description: "Inspect an omnichannel export, decide it and route approved work into the correct POS workflow.",
    keywords: ["manual review", "review request", "approve smartcommerce", "website request", "app request", "review approval", "integration review", "omnichannel"],
    steps: [
      opsStep("review-nav", "reviews", "Open Reviews & approvals", "Click Reviews & approvals."),
      { id: "review-record", title: "Inspect the source record", instruction: "Open the record and inspect source, priority, external reference, review reason, destination and approved payload. Do not approve from the summary alone when business evidence matters.", target: { selector: "#operations-main-content" } },
      { id: "review-decide", title: "Approve or reject", instruction: "Add decision conditions when useful, then Approve or Reject. Approval authorizes the handoff; it does not silently mutate the POS.", target: { selector: "#operations-main-content button", text: "Approve" }, missingMessage: "An Approve action appears only for a record awaiting a decision and only when your security group has the required approval permission." },
      { id: "review-route", title: "Route approved work", instruction: "Route the approved item into its registered workflow. Typed handoffs can prefill/create controlled drafts or confirmed stock actions depending on the risk of the operation.", target: { selector: "#operations-main-content button", text: "Route" }, optional: true },
    ],
  },
  {
    id: "ops-exception", title: "Handle a management exception", context: "operations",
    description: "Claim, acknowledge, snooze or resolve an evidence-backed operational exception.",
    keywords: ["exception", "alert", "notification", "claim alert", "acknowledge", "snooze", "resolve alert", "overdue exception", "management exception"],
    steps: [
      opsStep("exception-nav", "reviews", "Open Reviews & approvals", "Click Reviews & approvals to see the compact attention panel, or use Reports for the full exception register."),
      { id: "exception-panel", title: "Open the attention item", instruction: "Review the exception reason, severity, POS reference, source and age. Claim it when you are taking ownership.", target: { selector: "#operations-main-content" } },
      { id: "exception-action", title: "Manage the alert state", instruction: "Acknowledge once seen, Snooze only when there is a legitimate temporary wait, or Resolve with a mandatory resolution note after the underlying issue is genuinely addressed.", target: { selector: "#operations-main-content button" } },
    ],
  },
  {
    id: "ops-report", title: "Run, export or print a report", context: "operations",
    description: "Use the Reporting & Audit Center for POS, inventory, purchasing, rentals, repairs and digital-channel evidence.",
    keywords: ["report", "run report", "export report", "print report", "csv", "excel", "pdf report", "sales report", "inventory report", "rental report", "purchasing report"],
    steps: [
      opsStep("report-nav", "reports", "Open Reports", "Click Reports."),
      { id: "report-family", title: "Choose the report family", instruction: "Select the report from the left catalogue—for example Sales, Inventory, Slow-moving, Purchasing, Vendors, Rentals, Repairs, Transfers, AR, Audit or Integration.", target: { selector: "#operations-main-content" } },
      { id: "report-filters", title: "Set period and branch", instruction: "Choose the date range and branch, then run the report. Use search to narrow the displayed evidence when necessary.", target: workspace("Run report") },
      { id: "report-output", title: "Export or print", instruction: "Use CSV or Excel when export permission allows it. Use Print / PDF for a print-ready management copy or browser Save as PDF.", target: workspace("CSV"), optional: true },
    ],
  },
  {
    id: "ops-erp", title: "Use ERP Intelligence", context: "operations",
    description: "Review evidence-driven replenishment, purchasing and transfer recommendations without bypassing human controls.",
    keywords: ["erp intelligence", "recommendation", "replenishment", "buy recommendation", "stock recommendation", "smart transfer recommendation", "purchase plan", "inventory intelligence"],
    steps: [
      opsStep("erp-nav", "intelligence", "Open ERP Intelligence", "Click ERP Intelligence."),
      { id: "erp-evidence", title: "Read the evidence before the recommendation", instruction: "Review demand, current stock, credible inbound, branch imbalance, supplier/lead-time evidence and confidence. Treat the recommendation as decision support, not an automatic instruction.", target: { selector: "#operations-main-content" } },
      { id: "erp-action", title: "Use the controlled destination workflow", instruction: "When action is justified, continue through the corresponding Purchasing, Transfer or Inventory workflow. Draft recommendations must not bypass approval, receiving or live-stock validation.", target: { selector: "#operations-main-content button" }, optional: true },
    ],
  },
  {
    id: "find-product", title: "Find a product", context: "storefront", description: "Search the catalogue by product, model, category, or job.", keywords: ["find product", "search product", "look for", "buy", "product", "item", "tool"],
    steps: [
      { id: "product-search", title: "Use the main search", instruction: "Click the search field, then type the product, model, category, or job you are looking for.", target: { selector: "#v2-global-search" }, advanceOnClick: true },
      { id: "product-submit", title: "Run the search", instruction: "Click Search to see matching products. You can then filter and open the product you want.", target: { selector: ".v2-search-submit" } },
    ],
  },
  {
    id: "start-repair", title: "Start a repair request", context: "storefront", description: "Open repairs and complete a customer repair request.", keywords: ["repair", "service", "fix", "send repair request", "equipment repair"],
    steps: [
      { id: "repair-nav", title: "Open Repairs", instruction: "Click Repair in the top navigation.", target: { text: "Repair", selector: ".v2-header__nav a" }, advanceOnClick: true },
      { id: "repair-equipment", title: "Identify the equipment", instruction: "Enter the type of equipment being repaired.", route: "/repairs", target: { selector: "#repair-equipment" } },
      { id: "repair-model", title: "Add model or serial", instruction: "Enter the model or serial number if known.", route: "/repairs", target: { selector: "#repair-model" } },
      { id: "repair-issue", title: "Describe the symptoms", instruction: "Describe what the machine does or fails to do. You do not need to diagnose the failed part yourself.", route: "/repairs", target: { selector: "#repair-issue" } },
      { id: "repair-submit", title: "Send the request", instruction: "Review the information and click Send repair request.", route: "/repairs", target: { selector: "#repair-submit" } },
    ],
  },
  {
    id: "rent-equipment", title: "Rent equipment", context: "storefront", description: "Open rentals and choose equipment by job, branch and availability.", keywords: ["rent", "rental", "hire equipment", "book equipment", "reserve equipment"],
    steps: [
      { id: "rent-nav", title: "Open Rentals", instruction: "Click Rent in the top navigation.", target: { text: "Rent", selector: ".v2-header__nav a" }, advanceOnClick: true },
      { id: "rent-page", title: "Choose your rental", instruction: "Select the equipment, branch, dates and quantity you need.", route: "/rentals", target: { selector: "main" } },
    ],
  },
  {
    id: "account", title: "Open or manage an account", context: "storefront", description: "Sign in, create an account, or manage an existing customer account.", keywords: ["account", "sign in", "login", "register", "create account", "profile"],
    steps: [{ id: "account-button", title: "Open Account", instruction: "Click Account at the top of the screen.", target: { selector: ".v2-account-action" } }],
  },
  {
    id: "checkout", title: "Go to checkout", context: "storefront", description: "Open the cart and continue toward checkout.", keywords: ["checkout", "pay", "cart", "purchase", "complete order", "place order"],
    steps: [{ id: "cart-button", title: "Open your cart", instruction: "Click Cart to review your items and continue to checkout.", target: { selector: ".v2-cart" } }],
  },
];

function normalize(value: string) { return value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim(); }
function scoreFlow(flow: GuideFlow, query: string) {
  const q = normalize(query); if (!q) return 0; const words = new Set(q.split(" ")); let score = 0;
  for (const keyword of flow.keywords) { const k = normalize(keyword); if (q === k) score += 20; else if (q.includes(k)) score += 10; else score += k.split(" ").filter((word) => words.has(word)).length * 2; }
  return score;
}
function visible(element: HTMLElement) { const style = window.getComputedStyle(element); const rect = element.getBoundingClientRect(); return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0; }
function findTarget(target?: Target): HTMLElement | null {
  if (!target) return null;
  const candidates = target.selector ? Array.from(document.querySelectorAll<HTMLElement>(target.selector)) : Array.from(document.querySelectorAll<HTMLElement>("a,button,input,select,textarea,[role='button'],[role='link']"));
  return candidates.find((element) => {
    if (!visible(element)) return false;
    if (target.ariaLabel && !normalize(element.getAttribute("aria-label") || "").includes(normalize(target.ariaLabel))) return false;
    if (target.text && !normalize(element.textContent || element.getAttribute("placeholder") || element.getAttribute("aria-label") || "").includes(normalize(target.text))) return false;
    return true;
  }) || null;
}
function rectFor(element: HTMLElement): HighlightRect { const r = element.getBoundingClientRect(); const p = 8; return { top: Math.max(8, r.top - p), left: Math.max(8, r.left - p), width: Math.min(window.innerWidth - 16, r.width + p * 2), height: Math.min(window.innerHeight - 16, r.height + p * 2) }; }
function isOperations() { return Boolean(document.querySelector(".sc-ops-shell, #operations-main-content")); }
export function openGuidedMode(query = "") { window.dispatchEvent(new CustomEvent(OPEN_GUIDED_MODE_EVENT, { detail: { query } })); }

export default function GuidedMode() {
  const [open, setOpen] = useState(false); const [query, setQuery] = useState(""); const [flow, setFlow] = useState<GuideFlow | null>(null); const [stepIndex, setStepIndex] = useState(0); const [rect, setRect] = useState<HighlightRect | null>(null); const [targetFound, setTargetFound] = useState(false); const [missingText, setMissingText] = useState(""); const inputRef = useRef<HTMLInputElement>(null);
  const operations = isOperations();
  const eligibleFlows = useMemo(() => flows.filter((item) => item.context === "any" || (operations ? item.context === "operations" : item.context !== "operations")), [operations]);
  const step = flow?.steps[stepIndex] || null;
  const suggested = useMemo(() => eligibleFlows.slice(0, operations ? 8 : 5), [eligibleFlows, operations]);
  const close = useCallback(() => { setOpen(false); setFlow(null); setStepIndex(0); setRect(null); setTargetFound(false); setMissingText(""); }, []);

  useEffect(() => { const onOpen = (event: Event) => { const nextQuery = String((event as CustomEvent<{ query?: string }>).detail?.query || ""); setOpen(true); setQuery(nextQuery); window.setTimeout(() => inputRef.current?.focus(), 0); }; window.addEventListener(OPEN_GUIDED_MODE_EVENT, onOpen); return () => window.removeEventListener(OPEN_GUIDED_MODE_EVENT, onOpen); }, []);
  useEffect(() => { if (!open) return; const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [open, close]);

  useEffect(() => {
    if (!step) { setRect(null); setTargetFound(false); setMissingText(""); return; }
    if (step.route && !operations) { const current = window.location.hash.replace(/^#/, "").split("?")[0] || "/"; if (current !== step.route) go(step.route); }
    let cancelled = false; let targetElement: HTMLElement | null = null; let misses = 0;
    const updateTarget = () => {
      if (cancelled) return; targetElement = findTarget(step.target); setTargetFound(Boolean(targetElement));
      if (targetElement) { misses = 0; setMissingText(""); targetElement.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" }); setRect(rectFor(targetElement)); }
      else { setRect(null); misses += 1; if (misses >= 2) setMissingText(step.missingMessage || (step.optional ? "This optional control is not currently visible. It may not apply to the current record or state; you can skip this step." : "This control is not currently available. Check the current workflow state and your permissions, then try again.")); }
    };
    const timer = window.setTimeout(updateTarget, step.route ? 220 : 30); const interval = window.setInterval(updateTarget, 800); const onResize = () => updateTarget(); window.addEventListener("resize", onResize); window.addEventListener("scroll", onResize, true);
    const onClick = (event: MouseEvent) => { if (!step.advanceOnClick || !targetElement) return; if (targetElement === event.target || targetElement.contains(event.target as Node)) window.setTimeout(() => setStepIndex((current) => Math.min(current + 1, (flow?.steps.length || 1) - 1)), 150); };
    document.addEventListener("click", onClick, true);
    return () => { cancelled = true; window.clearTimeout(timer); window.clearInterval(interval); window.removeEventListener("resize", onResize); window.removeEventListener("scroll", onResize, true); document.removeEventListener("click", onClick, true); };
  }, [step, flow, operations]);

  function startGuide(selected: GuideFlow) { setFlow(selected); setStepIndex(0); setMissingText(""); }
  function submit(event: FormEvent) { event.preventDefault(); const ranked = eligibleFlows.map((candidate) => ({ candidate, score: scoreFlow(candidate, query) })).sort((a, b) => b.score - a.score); if (ranked[0]?.score > 0) startGuide(ranked[0].candidate); else setFlow(null); }
  const next = () => { if (!flow) return; if (stepIndex >= flow.steps.length - 1) return close(); setStepIndex((current) => current + 1); };
  const previous = () => setStepIndex((current) => Math.max(0, current - 1));

  return <>
    <button className="tt-guided-launcher" type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}><CircleHelp size={18} aria-hidden="true"/><span>Guided Mode</span></button>
    {open ? <div className="tt-guided-layer" aria-live="polite">
      {rect && step ? <div className="tt-guided-spotlight" aria-hidden="true" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}/> : null}
      <section className={flow ? "tt-guided-panel is-guiding" : "tt-guided-panel"} role="dialog" aria-modal="false" aria-labelledby="tt-guided-title">
        <button className="tt-guided-close" type="button" onClick={close} aria-label="Close Guided Mode"><X size={18}/></button>
        {!flow ? <>
          <div className="tt-guided-heading"><span><Sparkles size={17}/> {operations ? "Operations Guided Mode" : "Guided Mode"}</span><h2 id="tt-guided-title">What do you want to do?</h2><p>{operations ? "Describe the staff task in your own words. I’ll take you to the correct workspace, highlight the next control and explain workflow restrictions as they arise." : "Describe the task in your own words. I’ll show you where to click and what to do next."}</p></div>
          <form className="tt-guided-search" onSubmit={submit}><Search size={19}/><label className="tt-sr-only" htmlFor="tt-guided-query">Describe what you want to do</label><input ref={inputRef} id="tt-guided-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={operations ? "Example: receive a purchase order" : "Example: I want to start a repair"} autoComplete="off"/><button type="submit">Guide me</button></form>
          {query.trim() && !eligibleFlows.some((candidate) => scoreFlow(candidate, query) > 0) ? <p className="tt-guided-no-match">I don’t have a verified walkthrough for that task yet. Try naming the workflow—for example POS sale, close drawer, return, purchase order, receiving, stock adjustment, cycle count, transfer, quote, review, report or ERP Intelligence.</p> : null}
          <div className="tt-guided-suggestions">{suggested.map((candidate) => <button key={candidate.id} type="button" onClick={() => startGuide(candidate)}><strong>{candidate.title}</strong><span>{candidate.description}</span></button>)}</div>
        </> : <>
          <div className="tt-guided-heading"><span><MousePointer2 size={17}/> {flow.title}</span><h2 id="tt-guided-title">{step?.title}</h2><p>{step?.instruction}</p></div>
          <div className="tt-guided-progress"><span>Step {stepIndex + 1} of {flow.steps.length}</span><div><i style={{ width: `${((stepIndex + 1) / flow.steps.length) * 100}%` }}/></div></div>
          <p className="tt-guided-status">{targetFound ? "The next control is highlighted on screen." : missingText || "Looking for the next control…"}</p>
          {missingText ? <p className="tt-guided-no-match">{missingText}</p> : null}
          <div className="tt-guided-actions"><button className="is-secondary" type="button" onClick={previous} disabled={stepIndex === 0}>Back</button><button type="button" onClick={next}>{stepIndex >= flow.steps.length - 1 ? "Finish" : step?.optional && !targetFound ? "Skip" : "Next"}</button></div>
          <button className="tt-guided-change-task" type="button" onClick={() => { setFlow(null); setStepIndex(0); setRect(null); setMissingText(""); window.setTimeout(() => inputRef.current?.focus(), 0); }}>Choose another task</button>
        </>}
      </section>
    </div> : null}
  </>;
}
