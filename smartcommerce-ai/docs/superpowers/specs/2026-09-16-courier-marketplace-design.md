# SmartCommerce courier marketplace

Design specification — 16 September 2026

## Approved product decisions

Couriers register with SmartCommerce and require Total Tools approval before customers can book them. Couriers publish delivery services with prices, shipping speeds, areas served, operating hours, pickup/drop-off options, availability, supported item categories, and category-specific rates. Customers choose an eligible courier at checkout and pay the delivery fee through SmartCommerce. Customers and Total Tools receive delivery status updates and proof of delivery. Live GPS tracking is outside the initial scope.

The implementation extends the existing storefront. Preserve unrelated local work, the camera/responsive corrections, and existing checkout functionality. The POS synchronization program remains paused: no POS contract changes, deployment, or order submission is part of this program without separate authorization.

## Existing integration points

The React/Vite storefront routes pages in `src/App.tsx`. `src/pages/CheckoutPage.tsx` consumes the checkout contract in `src/lib/customerCommerce.ts`. That contract already contains integer-minor-unit delivery and total amounts, an expiration time, and `paymentAvailable`. Account and guest quote endpoints are `api/commerce.ts` and `api/guest-checkout.ts`. Commercial credit checkout is a separate flow in `api/commercial-credit-checkout.ts`.

The account commerce endpoint uses Neon/PostgreSQL, server-side session validation, durable rate limits, and provider-backed product facts. Courier records must use durable server storage and authenticated APIs, not browser-local records. Reuse existing session/security primitives after verifying their actual behavior; do not assume customer authentication grants courier or staff authority. Staff approval must use the existing staff identity boundary plus explicit courier-management permissions.

Standard checkout currently reports that payment processor connectivity is required. A delivery fee field is not evidence of working payment collection. The marketplace must remain unavailable for paid booking until a real supported payment flow and authoritative order source are configured.

## Approach and delivery boundaries

Recommended: build a first-party courier marketplace on the existing account and checkout foundation. This supports local couriers that do not have shipping APIs and gives Total Tools approval and operational control.

An external shipping aggregator would reduce some carrier integration work, but cannot be assumed to support the requested local courier onboarding, rates, and proof workflow. A standalone logistics application would create extra identities and duplicate checkout integration. Neither is required for the approved scope.

Deliver three independently gated increments:

1. **Courier onboarding and approval:** real accounts, applications, approval queue, service/rate configuration, availability, and audit history. This can ship without enabling paid bookings.
2. **Checkout quotes and booking:** eligibility, item-specific delivery quotes, customer choice, capacity reservation, and verified payment/order association. Enable only when the payment and order dependencies are ready.
3. **Shipment operations:** assignments, status timelines, proof of delivery, exceptions, disputes, and settlement records. Automatic bank payouts are a separately configured integration, not an implied feature of collecting fees.

## Courier and staff experience

A courier organization can have an owner and assigned drivers. Membership is stored explicitly; a customer cannot self-assign staff authority. Initial UI supports one owner and invites/assignments only when the corresponding authorization exists.

Application lifecycle: draft → submitted → approved or rejected. Rejected applications show a safe staff explanation and can be revised and resubmitted. Approved organizations may be suspended by authorized staff. Suspension blocks new quotes and bookings; existing jobs remain visible for controlled completion or reassignment. Every approval, rejection, suspension, and reinstatement records actor, reason, timestamp, and version.

Registration collects business/contact details and operational information. Verification documents remain private. Required verification documents are administrator-configured; do not invent mandatory legal requirements. The public courier profile excludes identity documents, payout details, and private contact data.

Couriers configure named services, service areas using canonical area IDs, origin branches/pickup areas, delivery destinations, weekly hours, timezone, holiday closures, booking cutoff, lead time, and dated capacity/blackout overrides. Availability must represent reservable capacity, not merely a green online indicator. Hours default to the configured business timezone and must be visible to customers.

Supported modes are branch pickup followed by delivery to an address or supported collection point. Additional customer pickup, return, and repair transport can use explicit service modes later; do not offer unsupported flows through generic labels.

Service eligibility includes allowed catalogue category IDs, maximum weight/dimensions, quantity/package constraints, and explicit handling exclusions. Category matching uses identifiers and governed hierarchy, never mutable names. Unknown essential shipping measurements make an order ineligible for an automatic quote and show a request-for-quote/contact option.

Rate tables use integer minor units with currency, version, effective period, category/weight band, origin/destination area, speed, and service mode. Initial rules use explicit brackets and surcharges, not user-authored executable formulas. Ambiguous overlapping rules are rejected. Couriers see a quote preview before publishing. Rate changes apply to new quotes; existing accepted bookings retain their price snapshots. Approval of the courier does not silently imply staff approval of every later price edit; rate publishing is audited and staff can disable a service.

## Customer checkout and quote rules

Customer supplies a destination and desired delivery/collection mode. The server verifies the cart against authoritative catalogue/pricing data and eligible fulfillment origin before computing options. Customers see courier, total delivery fee, estimated delivery window, relevant restrictions, and pickup/drop-off details. No eligible option is shown as unavailable, never as free delivery.

Eligibility requires approved and unsuspended courier, published service, covered origin/destination, allowed categories, supported package limits, matching currency, operating hours, and capacity. Speed labels must correspond to calendar-aware estimated windows including cutoffs, holidays, and lead time. They are estimates unless an explicit guaranteed service exists.

Initial scope is a single eligible fulfillment origin and one shipment per order. Multi-origin or incompatible carts require an explicit quote or supported split-shipment extension; they must not be priced as a single assumed package. Rental equipment and hazardous or specialist goods are not automatically eligible merely because a broad category matches.

Quotes bind to customer/session, cart version, destination, origin, courier/service/rate version, currency, item and shipping snapshots, expiry, and the full fee breakdown. Default expiry is ten minutes, aligned with existing account commerce quotes. Changing any bound input requires a new quote. Server recomputation and expiry checks occur before booking. Product tax and delivery tax remain distinct and use configured rules; no tax treatment is invented.

Delivery amount enters the existing verified checkout total. Zero-cost delivery is represented explicitly, not inferred from a falsy amount. Guest access uses scoped expiring credentials, never a public order ID as authorization. Commercial-credit delivery is disabled until the credit policy explicitly covers the charge and the courier settlement obligation; retain the existing commercial checkout behavior otherwise.

## Booking, payment, and failure handling

Quote selection creates a short-lived capacity hold and pending booking with a stable idempotency key. Concurrent finalization must not exceed capacity or create duplicate shipments. Use database uniqueness constraints and transactional state/version checks.

Payment status, courier acceptance, and shipment status are separate. A browser success redirect cannot mark payment paid. Verified payment-provider events or authenticated reconciliation determine authorization/capture/refund status. The same provider event can be delivered repeatedly without duplicating charges, bookings, earnings, or notifications.

Preferred payment sequencing is authorization followed by capture once order and courier acceptance are confirmed, if the selected provider supports it. Otherwise a documented capture/refund compensation path is required before enablement. No provider capability is assumed. Ambiguous timeouts remain pending reconciliation and are never blindly retried as a fresh charge or booking.

Customers choose the courier; the courier must accept within a configurable deadline. Expired or declined assignments release capacity and trigger the configured payment compensation. The customer is offered a new choice; do not silently substitute a different courier or increase the price. Staff reassignment requires customer agreement where courier or fee changes.

Persist domain events and notification work in the same transaction as the associated state change. Retry workers use bounded backoff and distinguish transient failures from validation/authorization failures. Exhausted or ambiguous work is visible to staff for review. No in-memory timer is the sole mechanism for holds, acceptance deadlines, or retries.

## Shipment updates and proof of delivery

Operational lifecycle: awaiting acceptance → scheduled → collected → in transit → out for delivery → delivered. Delay and failed-attempt events preserve the current operational stage and add a reason and next action. Returns use explicit return-requested/returning/returned transitions. Cancellation before collection and exceptional termination after collection are separate governed actions.

Drivers can update only assigned shipments. Courier owners can manage only their organization's shipments. Staff intervention requires an explicit permission and audit reason. Customer and staff views read the same persisted timeline, with internal notes excluded from the customer projection.

Events carry a stable event ID, shipment ID, expected version, actor, event type, server receipt time, reported occurrence time, and safe structured details. Duplicate events return their existing result; invalid or stale transitions are rejected rather than regressing a delivered shipment. Reported offline timestamps do not override authoritative event ordering.

Begin with authenticated polling while a tracking page is visible, showing last-update time and a stale/offline indication. Persisted events support later push delivery without changing truth. No fake movement, progress, or ETA countdown. Email/SMS notifications require configured channels and customer preferences; in-app updates do not depend on an external messaging provider.

Proof can include photo, signature, recipient name, or a one-time recipient code according to service policy. A delivered transition requires the configured evidence and a successful persisted proof reference. Recipient codes are hashed, attempt-limited, short-lived, and never displayed to the driver. Uploaded media uses private object storage, short-lived scoped access, type/size validation, malware/quarantine handling where configured, and integrity hashes. Do not put photos or signatures in public URLs, logs, or notification payloads.

Customers can view proof only for their own shipments; couriers only for their assigned/owned work; authorized staff only within their role. Retention and deletion policies are configurable and must be selected before production proof uploads. A failed upload cannot result in a false delivered state. Corrections are append-only audited events, not overwritten evidence.

## Settlement and disputes

Maintain separate immutable entries for delivery charges, configured platform fees, refunds, adjustments, courier earnings, and actual payouts. No commission percentage is assumed. Quoted gross fee and settlement allocations must reconcile in the same currency.

Delivery confirmation makes earnings eligible for review under configured settlement policy; it does not prove money was sent. States distinguish pending, held/disputed, eligible, payout pending, paid, and failed. Only confirmed payout evidence can mark paid. Disputes hold unsettled earnings; reversals reference the original entries. Manual settlement recording is permitted only for authorized staff with an external payment reference and audit trail.

The payout provider, fees, settlement timing, cancellation/refund policy, and proof acceptance/dispute window are production configuration decisions. Until configured, earnings stay held and automatic payouts remain disabled. This is an explicit safe product boundary, not a simulated integration.

## Data and API organization

Suggested durable entities: courier organizations, memberships, applications, application decisions, services, coverage areas, service categories, rate versions/rules, hours and exceptions, capacity holds, delivery quotes, bookings, assignments, shipments, shipment events, proof objects, disputes, settlement entries, payment reconciliation jobs, and notification outbox jobs.

Use foreign keys, tenant/organization ownership, timestamps, version counters, currency constraints, nonnegative monetary/capacity checks, and unique idempotency keys. Avoid a second independent customer or product source of truth. Migrations must be additive and safely rerunnable, with feature gates enabling each increment separately.

Keep HTTP handlers thin. Separate eligibility/rating, approval, booking/payment orchestration, shipment transitions, proof authorization, and settlement accounting into focused server modules. Proposed endpoints cover applications, staff decisions, courier services/rates/availability, checkout delivery quotes, booking acceptance, shipment events, proof upload/finalization, customer tracking, and staff reconciliation. Exact route files follow existing server/runtime conventions verified during implementation.

Customer-facing errors are sanitized and actionable. Logs use correlation IDs and exclude credentials, private addresses, identity documents, proof content, and raw provider errors. Authentication, authorization, request-size limits, origin/CSRF protections, and durable abuse controls apply on every mutation.

## Acceptance and testing

Use failing behavioral/contract tests first. Database integration tests must exercise real transactional constraints, not only source-text assertions.

- Pending/rejected/suspended couriers never appear in new checkout choices; forged IDs and cross-organization access fail.
- Hours, timezones, closures, area boundaries, category hierarchy, weight/size bands, unknown measurements, currency mismatches, and capacity produce deterministic eligibility.
- Rate edits and address/cart changes cannot alter an existing booking snapshot or reuse an invalid quote.
- Simultaneous bookings cannot oversell capacity; duplicate requests/events cannot double-charge or create duplicate shipments, ledger entries, or notifications.
- Payment redirects, timeouts, webhook retries, courier rejection, and reconciliation cannot falsely report paid, accepted, or refunded.
- Invalid/backward shipment transitions fail. Proof is private and required by policy before delivery completion.
- Customers, drivers, courier owners, staff, and guests have isolated access; proof and tracking links expire appropriately.
- Responsive onboarding, rate editing, courier selection, tracking, and proof upload work at phone, tablet, and desktop widths with keyboard-accessible controls.
- Run TypeScript, relevant security/commerce regressions, and release checks. Report existing generated-artifact gate failures separately; do not weaken tests or silently remove unrelated work.

No release claim until actual payment/order dependencies and private proof storage are configured and verified. No mock couriers, rates, shipments, or proof are inserted into production workflows.

## Review outcome

The agreed product choices are captured above. Proposed operational defaults and production gates are explicit. No GPS, unsupported automatic payout, unapproved POS integration, or invented provider behavior is included. The first implementation plan should cover courier onboarding, approval, and service configuration; subsequent increments retain the contracts defined here.
