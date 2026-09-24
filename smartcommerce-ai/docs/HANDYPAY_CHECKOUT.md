# HandyPay checkout wiring

Implemented locally, disabled until configured and connected to trusted order reservations. Powertranz is not implemented. Selecting another provider fails closed rather than silently routing payments to HandyPay.

## Implemented

- Account checkout calls `/api/checkout-payment` with a quote identifier only. The server retrieves the saved amount and claims the order once before contacting HandyPay.
- Hosted session creation uses `https://api.handypay.me/api/v1/payment-sessions`. Card details stay off SmartCommerce.
- Only explicitly allowed HTTPS checkout origins may be returned. Configure origins supplied by the merchant's HandyPay onboarding; do not allow arbitrary domains.
- Repeated clicks return the saved session. A timeout, invalid response or uncertain database save never triggers another session creation automatically. Staff must reconcile the order with HandyPay before enabling another attempt.
- `/api/handypay-webhook` verifies HMAC-SHA256 against raw bytes, persists event identity and fetches the session using the configured merchant key. Paid settlement requires exact saved session, order metadata, currency and amount matching.
- Settlement and courier dispatch occur in one database transaction. Browser returns only show saved status; they never confirm payment. Payment and delivery states remain separate.
- Unknown, failed, expired, refund and dispute notifications are retained for review. Automatic refund/cancellation workflows are not implemented.

## Server configuration

Set secrets in the server environment, never in chat, browser variables or source control:

```
SMARTCOMMERCE_PAYMENTS_ENABLED=false
SMARTCOMMERCE_PAYMENT_PROVIDER=handypay
SMARTCOMMERCE_PAYMENT_MODE=test
SMARTCOMMERCE_PUBLIC_ORIGIN=https://your-configured-host
HANDYPAY_API_KEY=<test or live merchant key matching mode>
HANDYPAY_WEBHOOK_SECRET=<secret for this endpoint and mode>
HANDYPAY_CHECKOUT_ORIGINS=<comma-separated exact HTTPS origins>
```

Register the HTTPS webhook with HandyPay for checkout completion, asynchronous success/failure, expiry, refunds and disputes. Use separate test/live deployments and endpoint secrets. Do not flip an environment containing pending test orders into live mode.

Apply the courier migrations first, then `20260924_handypay_checkout.sql`, and explicitly grant only the server database role the required table/function access. No migrations have been applied to production.

## Required before taking payments

The trusted order/stock adapter must create `smartcommerce_payment_orders` with a stable order ID, authenticated customer, exact checkout quote, final amount/currency, verified inventory reservation reference/expiry, and selected held shipping quote. No browser endpoint creates these records. The current storefront price quote does not reserve inventory; the POS integration remains paused. Consequently the current preview cannot take payments simply by adding API keys.

Shipping options still require an authoritative address/packing resolver and checkout selection integration. Guest payments are not enabled. Operational reconciliation needs staff tooling for uncertain session creation, webhook delivery failures and held review events. The current implementation provides durable records but no automated recovery worker or payment review screen.

Complete merchant sandbox acceptance tests for hosted redirection, payment decline, delayed notifications, duplicate notifications, late payment, refunds and reconciliation before live activation. A returned checkout URL may remain payable after the local fulfillment hold expires; late payment is recorded as paid with fulfillment requiring review and must not dispatch automatically.

## Sources checked September 23, 2026

- https://tryhandypay.com/docs/api-reference
- https://api.handypay.me/api/openapi.json
- https://powertranz.com/payment-gateway/hosted-payment-page

The older HandyPay developers landing page shows a different endpoint. This implementation follows the current API reference and linked OpenAPI contract. Provider session-creation idempotency behavior is not sufficiently specified there to safely assume automatic POST retries.
