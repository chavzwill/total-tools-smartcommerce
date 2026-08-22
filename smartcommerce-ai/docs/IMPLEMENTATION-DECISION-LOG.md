# SmartCommerce Implementation Decision Log

This log records material product, operational, accounting, security, and architecture decisions. New entries should be appended; do not silently rewrite history when the reasoning changes.

---

## 2026-08-22 — Search experience becomes a dedicated mobile mode

### Decision
Mobile search is a dedicated search experience rather than a focused input trapped inside the homepage hero.

### Why
The original focused state felt visually dated and cramped by the mobile keyboard. Dedicated mode provides better hierarchy, recent searches, quick paths, and room for query-aware suggestions.

### Operational impact
No accounting impact. Search remains connected to real platform routes and must not present fallback/demo catalogue data as live inventory.

---

## 2026-08-22 — Customer payment choice must not multiply bookkeeping complexity

### Decision
SmartCommerce will support multiple customer-facing payment methods while intentionally minimizing the number of settlement rails.

### Preferred structure
1. Primary online acquirer for standard cards plus compatible Apple Pay, Google Pay, and Click to Pay experiences.
2. Accounts receivable rail for approved Credit Account checkout.
3. POS/offline rail for Pay in Store / Pay on Pickup.
4. Optional secondary wallet/provider such as PayPal only when customer value justifies the additional settlement and reconciliation workload.

### Why
Adding independent processors for every checkout button would force finance staff to reconcile multiple dashboards, payout schedules, fees, currencies, refunds, and bank deposits. The customer should receive choice while bookkeeping receives consolidation.

---

## 2026-08-22 — SmartCommerce will orchestrate payments, not store raw card data

### Decision
Sensitive authorization/payment entry should be handled by approved payment providers/acquirers using hosted/tokenized/wallet flows wherever practical. SmartCommerce owns the order, payment attempt, verification, internal status, reconciliation, audit trail, and fulfillment decision.

### Source of truth
A browser redirect/success page never marks an order paid. Server-side verified provider evidence is required, primarily signed webhooks/events with provider transaction verification as fallback.

### Why
This reduces fraud risk and unnecessary PCI scope while preserving reliable instant order status.

---

## 2026-08-22 — Paid and Settled are separate states

### Decision
Customer payment state and processor settlement state will be modeled independently.

### Why
An order can be legitimately paid before the processor's net settlement reaches the business bank account. Conflating these states causes bad accounting and misleading operations.

---

## 2026-08-22 — Reconciliation should be exception-based

### Decision
SmartCommerce will aim to automatically match processor transaction -> payment -> order/invoice -> settlement batch -> bank/accounting deposit. Routine matched transactions should require no manual intervention.

### Human-review exceptions
Missing settlements, amount/currency mismatches, duplicate/unmatched payments, refund mismatches, disputes/chargebacks, and other financial anomalies.

### Why
Bookkeepers should investigate exceptions rather than manually cross-check every payment across separate systems.

---

## 2026-08-22 — Payment provider selection remains open pending merchant due diligence

### Decision
Do not hard-wire SmartCommerce to a production payment provider before Total Tools confirms merchant availability, contract terms, settlement, supported currencies, wallet availability, APIs/webhooks, refunds, reporting, and reconciliation quality.

### Current research note
WiPay is a candidate Jamaican rail because it advertises JMD/USD support, local-bank settlement, REST APIs, and webhooks. This is not a provider-selection decision. Jamaican Google Pay issuer support is expanding; Apple Pay issuer availability is evolving. SmartCommerce must use capability detection rather than assume wallet availability from device ownership.

---

## 2026-08-22 — Payment buttons are server-capability gated

### Decision
A payment method must not become selectable because its frontend component exists. SmartCommerce will expose server-derived payment capabilities and only enable methods when the required merchant provider, webhook/verification credentials, and explicit environment enablement are present.

### Current implementation
`api/payment-capabilities.ts` reports capability state for Apple Pay, Google Pay, Click to Pay, card, PayPal, and Pay in Store. Primary-acquirer methods share one configuration gate where possible; PayPal and store-POS settlement remain independent rails.

### Integrity rule
Frontend redirects, device ownership, or the presence of a wallet logo are not proof that the method can process a real transaction. Production eligibility must be confirmed by the connected provider and server configuration.

---

## 2026-08-22 — Checkout consumes verified capability state but adapters remain a second gate

### Decision
The customer checkout now reads `/api/payment-capabilities` and presents the supported payment families in one normalized panel. A method is still non-actionable until its SmartCommerce checkout adapter exists, even if merchant/provider configuration is present.

### Why
Merchant credentials prove that a rail may be configured; they do not prove that SmartCommerce has implemented initiation, return handling, webhook verification, idempotency, failure recovery, refunds, and reconciliation for that rail.

### Current customer behavior
- Apple Pay, Google Pay and Click to Pay are grouped as Express Checkout.
- PayPal and card appear under other online methods.
- Pay in Store appears as a branch settlement path.
- Commercial Account Credit remains an independent, already validated flow.
- If capability verification fails, no online payment method is enabled.

### Production activation gate
A method becomes genuinely selectable only after provider onboarding plus its payment initiation adapter, verified server confirmation, ledger posting, reconciliation mapping, refund behavior, and failure tests are complete.

---

## Documentation policy adopted 2026-08-22

For every material production feature, keep role-specific documentation for:

- Sales/customer-service staff;
- Bookkeeping/finance;
- Management;
- Developers.

A feature is not operationally complete until its relevant manual modules and this decision log are updated.
