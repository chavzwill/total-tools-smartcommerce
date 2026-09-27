# Courier acceptance and dispatch oversight

Local implementation, September 24, 2026. Not deployed or enabled for live bookings.

After verified settlement creates a dispatch, its courier company has ten minutes to respond. Acceptance is required before driver assignment. Declines require a reason. Concurrent decisions use a locked job version; only one wins. Retried responses preserve the original receipt and append only one response/audit record.

Owners see their company's offers under Driver access & private details. They can accept, decline, and choose an active verified driver. The existing pickup transaction creates the QR-visible order only after acceptance. Driver and company verification are rechecked at assignment.

Staff with the existing `couriers_pickup` permission see dispatch oversight under courier security, restricted to their explicit branch assignments. This phase is read-only for staff. It does not grant staff reassignment or refund powers.

Expired unanswered offers appear as expired / needs review on every server read. The database row is finalized as expired when a response is attempted; no scheduled expiry worker is installed. Reads do not claim that notification or intervention has happened. Declines and expiry do not silently release confirmed capacity or change the customer-selected service. Existing assignments predating the migration retain their assigned state.

Apply `20260925_courier_acceptance.sql` after the dispatch migration. Grant execution only to the application's server role. No production migration has been applied. The existing courier feature flag, dedicated courier sessions and staff permissions continue to apply.

Regression coverage: acceptance required before pickup creation, owner isolation, stable retry, conflicting idempotency payload, competing accept/decline requests, mandatory decline reason, expired response, staff permission and branch isolation. TypeScript and existing courier/payment regressions are also checked.

Still required for the larger service-quality program: automatic dispatch notifications, safe reassignment under the customer's delivery terms, staffed incident resolution, pickup/delivery service deadlines, verified performance metrics, document expiry, customer ratings/appeals, and optional consent-based live location. This work does not establish parity with Uber or Grubhub. Live checkout still requires the trusted stock/order/shipping adapters and merchant configuration described in HANDYPAY_CHECKOUT.md.
