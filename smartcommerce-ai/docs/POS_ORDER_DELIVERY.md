# Website order delivery to Total Tools POS

## Deployment and operation

Apply `20260915_pos_commerce_sync.sql` and then `20260916_pos_order_delivery.sql` to the website database before using the worker or enqueue function. Run migrations transactionally. The new unique order-identity index deliberately stops migration if existing duplicate order identities require reconciliation. No data is automatically deleted.

Configure server-only `SMARTCOMMERCE_DATABASE_URL` (or `DATABASE_URL`), `SMARTCOMMERCE_TOTAL_TOOLS_POS_URL` (HTTPS origin), and `SMARTCOMMERCE_TOTAL_TOOLS_POS_API_KEY`. The existing POS key must grant **both `orders:read` and `orders:write`**. Requests use `X-API-Key`; no browser credential or employee session is used.

Set `SMARTCOMMERCE_POS_DELIVERY_SECRET` to an independent random secret of at least 32 characters. A trusted scheduler invokes `POST /api/pos-order-delivery` with `Authorization: Bearer <secret>`. Each invocation processes at most one due order, with up to three bounded POS calls. Schedule repeated invocations according to queue volume. No scheduler or production credentials are installed by this change.

## Enqueue boundary

Trusted server producers use `enqueueWebsitePosOperation` with operation `order.create`, entity type `order`, the permanent website order ID, an immutable idempotency key, and a correlation ID. The payload is the POS snake-case contract:

- `external_order_id`: exactly the permanent website order ID (1–120 ASCII letters, digits, `_` or `-`). Never generate a new identity on retry.
- `branch_id`: authoritative positive numeric POS branch ID.
- `items`: unique positive numeric POS `product_id` values with finite positive quantities. No submitted price fields, rental lines, guessed IDs, or client stock assertions.
- `payment_method`: `online`; `external_payment_reference`: confirmed payment identity.
- `expected_pos_total`: confirmed website settlement total, used only for receipt comparison and removed before POST.
- Optional POS customer/quote external references, mapped numeric `customer_id`, and approved delivery/service/handling amounts.

The producer must have independently authorized the payment and derived these fields server-side. Presence of a reference is not payment verification. This worker does not turn draft platform orders into paid orders. Credit orders, tax exemptions, discounts, approvals and unverified payment flows remain unsupported by this path. No public enqueue endpoint is exposed.

The POS currently computes prices/taxes from its own products, validates branch stock, reserves stock transactionally, and treats non-credit creates as completed payments. Its contract lacks expected-price preconditions. Therefore a price change may already have created a POS order before the worker detects a total mismatch: that order becomes `needs_review`, retaining its POS reference. The worker never refunds, recreates, or silently changes it. Strict prevention of settlement/price drift requires a POS-side conditional quote/price contract before wider checkout activation.

## Delivery semantics

- `pending`: durably queued or scheduled for retry; does not mean transferred.
- `transferring`: a worker holds a two-minute lease; the POS outcome may still be unknown.
- `accepted`: a matching completed POS receipt has been validated and durably saved. This is delivery acceptance, not a new assertion of fulfillment or payment settlement.
- `failed`: a definite nonretryable create rejection (400/404/405/413/415).
- `needs_review`: permission/business conflict, invalid payload, receipt mismatch, or exhausted uncertainty. It does not imply that no POS order exists.

Every delivery first looks up `/api/smartcommerce-orders/:externalOrderId`. Only a definitive 404 permits POST. Lost responses, 408, 429 and 5xx responses trigger reconciliation; subsequent attempts keep the same external ID. PostgreSQL `FOR UPDATE SKIP LOCKED` prevents concurrent active claims, while the POS unique external-order index protects against duplicate creates after lease expiry or network delays. Completion compares the lease token and expiry, preventing a stale worker from replacing newer evidence.

Retries use exponential delay, capped at one hour and honoring bounded `Retry-After`. Eight attempted deliveries without resolution require review. Only fixed error codes are persisted or returned; provider bodies, database diagnostics, payment payloads and credentials are never exposed by the trigger. The trigger reports `lease_lost` if completion did not persist, and returns 503 on storage failure. An expired lease is recovered by a later invocation.

Idempotency key reuse with different intent fails closed. Payloads and identities are immutable. A second key cannot enqueue the same website order. Review terminal records against the POS using the same external ID; do not delete/recreate records or mint new IDs as a retry mechanism.

## Verification

`npm run test:pos-commerce-sync` includes executable transport/trigger regressions and is part of the existing release gate. `npm run test:pos-order-database` additionally requires `POS_TEST_DATABASE_URL` pointing to a disposable localhost PostgreSQL database and optionally `POS_TEST_PSQL` pointing to its psql executable. It creates and removes a uniquely named schema, applies both migrations, and exercises concurrent claims, leases, backoff, immutable payloads, identity uniqueness and enqueue conflicts.

The local suite does not submit real production orders. Production enablement still requires migrations, scoped credentials, a trusted scheduler, authorized order producers, and a controlled end-to-end acceptance test against the deployed POS version.
