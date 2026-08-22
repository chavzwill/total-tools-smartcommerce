# SmartCommerce Payments Architecture

## Objective

Give customers fast, familiar payment choices without forcing accounting staff to reconcile a separate financial universe for every checkout button.

## Core rule

**Payment method is not the same thing as settlement rail.**

Apple Pay, Google Pay, Click to Pay, and ordinary card entry should preferably settle through one primary card acquirer/payment processor when commercially and technically available. PayPal should only be added if its customer value justifies a second settlement stream. Credit Account and Pay in Store remain separate operational/accounting rails.

## Target customer-facing methods

### Express checkout
- Apple Pay — when device, browser, issuer, region, and merchant processor support it.
- Google Pay — when eligible for the customer and processor.
- Click to Pay — preferred universal saved-card option if supported by the selected acquirer.

### Other online
- Debit/credit card through the primary acquiring gateway.
- PayPal, if merchant-country support, fees, settlement, and demand justify the extra rail.

### Business and offline
- Approved Credit Account checkout.
- Pay in Store / Pay on Pickup.

### Future/local rails
- Jamaican digital payment rails or QR payment methods may be added behind the same payment-provider interface after commercial and operational review.

## Jamaica implementation direction

Do not commit to a gateway solely because it exposes an API. Provider selection must evaluate:

- JMD settlement;
- USD support where required;
- settlement account and timing;
- fees and chargeback costs;
- webhook/event support;
- transaction verification API;
- refund support;
- 3-D Secure/card authentication;
- Apple Pay/Google Pay/Click to Pay compatibility;
- local acquiring relationship;
- reporting/export quality;
- reconciliation/batch identifiers;
- support and incident response;
- PCI scope and hosted checkout/tokenisation options.

Current research confirms WiPay offers Jamaican JMD/USD processing, local-bank settlement, REST APIs and real-time webhooks. It is a candidate local rail, not yet the selected SmartCommerce processor. Google Pay issuer support is growing in Jamaica, but wallet eligibility must be detected rather than assumed. Apple Pay issuer availability is still evolving locally. Provider due diligence remains required before live integration.

## SmartCommerce Payment Orchestrator

All providers must map into one internal state model:

`created -> awaiting_payment -> authorized -> paid`

Alternative terminal states:

`failed | cancelled | expired | refunded | partially_refunded | disputed`

Settlement states are tracked independently:

`not_expected | pending | settled | partially_settled | mismatch | reversed`

A payment may be `paid` before its processor settlement reaches the bank. These concepts must never be conflated.

## Canonical payment record

Every payment attempt should ultimately normalize to a record containing at minimum:

- internal payment ID;
- order ID;
- invoice ID when applicable;
- customer ID when known;
- payment method shown to customer;
- underlying provider/acquirer;
- processor transaction/reference ID;
- authorization ID when supplied;
- amount;
- currency;
- tax context inherited from order;
- payment status;
- provider status;
- created/authorized/paid timestamps;
- gross amount;
- processor fees when known;
- expected net settlement;
- settlement batch/reference;
- expected settlement date;
- actual settlement date;
- refund totals;
- dispute/chargeback state;
- reconciliation state;
- source event/webhook IDs;
- audit timestamps.

## Payment verification

A customer redirect or browser success screen is **never** proof of payment.

Preferred flow:

1. SmartCommerce creates an internal payment attempt tied to one immutable order amount and currency.
2. Customer is sent to or invokes the trusted wallet/provider authorization experience.
3. Provider processes authorization/payment outside SmartCommerce's card-data boundary.
4. Provider sends a signed server-to-server webhook/event.
5. SmartCommerce validates signature/authenticity, provider transaction ID, amount, currency, merchant account, and internal order reference.
6. Event processing is idempotent.
7. SmartCommerce updates the payment ledger.
8. Order fulfillment state changes only when the required payment condition is satisfied.
9. If webhook delivery is delayed or ambiguous, SmartCommerce queries the provider transaction-verification endpoint before presenting final paid status.

## Reconciliation architecture

The bookkeeping goal is exception-based reconciliation.

SmartCommerce should ingest settlement/batch data and automatically match:

`processor transaction -> payment -> order/invoice -> settlement batch -> bank deposit`

For each item calculate:

`gross paid - processor fees - refunds/adjustments = expected net settlement`

Normal matched transactions should disappear into a reconciled state. Human attention should be reserved for:

- missing settlement;
- amount mismatch;
- currency mismatch;
- duplicate processor events;
- overpayment/underpayment;
- refund mismatch;
- chargeback/dispute;
- payment with no matching order;
- order marked paid without verified provider evidence.

## Accounting buckets

Preferred operational structure:

1. **Primary online card/acquirer rail** — cards + supported express wallets.
2. **Accounts receivable rail** — approved Credit Account purchases.
3. **POS/offline rail** — Pay in Store / pickup counter settlement.
4. **Optional secondary wallet rail** — e.g. PayPal only if justified.

Do not add a new payment provider without documenting where its funds settle and how bookkeeping will reconcile it.

## Refunds

Refunds must originate from authorized SmartCommerce roles and be sent through the provider used for the original transaction whenever required by processor/network rules. SmartCommerce must record requested, submitted, succeeded/failed, amount, provider refund ID, actor, reason, and settlement effect.

## Security requirements

- Never store CVV.
- Prefer hosted/tokenized provider flows to reduce PCI scope.
- Verify webhook signatures/secrets exactly as documented by the provider.
- Use idempotency keys for payment creation/refunds where supported.
- Never accept amount/currency from a client callback as authoritative.
- Never let the browser directly mark an order paid.
- Store provider secrets only in approved server-side secret management/environment variables.
- Log financial state changes in an immutable/auditable event trail.
- Separate permissions for sales actions, refund approvals, reconciliation, and configuration.

## Rollout sequence

### Phase 1 — foundation
- payment ledger/data model;
- provider adapter interface;
- payment attempt creation;
- webhook/event ingestion contract;
- verification and idempotency;
- order-payment state machine;
- audit log;
- bookkeeping reconciliation model.

### Phase 2 — existing business rails
- Credit Account checkout integration;
- Pay in Store / pickup workflow;
- staff visibility and receipts.

### Phase 3 — primary online acquirer
- card checkout;
- settlement ingestion;
- refunds;
- 3-D Secure handling;
- end-of-day reconciliation.

### Phase 4 — express wallets
- Apple Pay/Google Pay/Click to Pay where the selected provider supports them;
- device/browser eligibility detection;
- one-tap UX without adding new bookkeeping rails where possible.

### Phase 5 — optional additional provider
- PayPal or local alternative only after accounting and management sign-off on settlement/reconciliation impact.

## Definition of done for a payment provider

A provider is not production-ready until all of the following work:

- successful payment;
- declined payment;
- abandoned payment;
- webhook delayed;
- duplicate webhook;
- incorrect/forged callback rejected;
- amount mismatch rejected/flagged;
- refund;
- partial refund if supported;
- settlement batch matched;
- missing settlement exception;
- staff permissions;
- audit trail;
- accounting export/report;
- operational manual updated.
