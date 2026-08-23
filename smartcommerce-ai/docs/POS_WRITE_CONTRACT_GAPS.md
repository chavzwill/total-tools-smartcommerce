# SmartCommerce ↔ Total Tools POS write contract gaps

## Current verified POS API capabilities

The current Total Tools POS API supports API-key-scoped reads for products, categories, customers and transactions, plus writes for customers and transactions when the API key has the matching scopes.

SmartCommerce now uses those real contracts rather than guessed payloads.

## SmartCommerce safety policy

SmartCommerce must not create a financially authoritative POS transaction unless the POS can represent the same order total and the write can be made duplicate-safe.

The guarded SmartCommerce adapter therefore:

- synchronizes customers using exact email/phone deduplication before creation;
- quarantines ambiguous POST/network outcomes instead of automatically retrying;
- uses a durable `pos_write_operations` guard keyed by SmartCommerce order id;
- only permits commercial-account-credit order writes at this stage;
- requires a configured dedicated ecommerce POS employee id;
- rejects any order containing delivery or another non-merchandise charge the POS transaction cannot represent;
- rejects order lines without an authoritative POS product id and whole-number quantity;
- requires a verified provider/POS customer mapping for commercial credit.

## POS changes required for full production order writes

### 1. Native external order / idempotency key

`POST /api/transactions` should accept an immutable external order reference, for example:

- `external_order_id`
- `source = smartcommerce`
- optional `idempotency_key`

The database should enforce uniqueness for the provider/source + external order id combination.

If the same request is repeated, the POS should return the original transaction instead of creating a second transaction or decrementing stock twice.

### 2. Explicit delivery / logistics charge

The transaction contract needs an explicit delivery amount rather than encoding delivery as a discount, arbitrary product line or note.

Suggested fields:

- `delivery_amount`
- `delivery_provider`
- `delivery_service_id`
- `delivery_reference`

The POS total should be calculated server-side as merchandise subtotal + tax - discount + delivery + other approved fees.

### 3. Explicit service/other approved fee support

If SmartCommerce can apply service charges, handling charges or other non-merchandise fees, the POS needs typed fields/lines that preserve the accounting category and tax treatment of each fee.

### 4. Online order lifecycle

POS transactions created from SmartCommerce should retain:

- external SmartCommerce order id;
- checkout quote id;
- payment/settlement reference;
- commercial account / PO reference where relevant;
- fulfilment mode;
- delivery provider/service/collection point where relevant;
- provider payment reference;
- customer-visible order reference.

### 5. Invoice contract

The current POS exposes transaction/receipt data but SmartCommerce's platform contract also supports invoices. Before enabling `createInvoice`, decide whether:

- a completed POS transaction is the authoritative invoice, or
- the POS should expose a dedicated invoice resource/API.

The choice must preserve invoice number, issue date, due date, tax totals, payment status, customer and originating order.

### 6. Reconciliation endpoint

The POS should allow lookup by external SmartCommerce order id/idempotency key. This is required for safe recovery after timeouts and webhook/provider ambiguity.

## Current production-safe scope

Until the POS gains the missing fields above:

- product/catalog/branch/inventory/pricing reads: supported;
- customer lookup/create: supported with SmartCommerce deduplication and ambiguity quarantine;
- pickup-only commercial-credit order writes: supported only when configured and guarded;
- delivery-bearing order writes: blocked;
- invoice creation: blocked;
- arbitrary retail payment writes: blocked until payment settlement mapping is completed;
- rentals/repairs/commercial quote writes: remain separate integration work.
