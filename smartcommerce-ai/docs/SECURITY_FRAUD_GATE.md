# SmartCommerce Security & Fraud Gate

This document tracks security and fraud-control findings discovered during the production-readiness audit.

## Current gate status

### Closed in code

- Customer sessions use server-side session lookup and customer scoping.
- Persistent cart mutations are scoped to the authenticated customer's active cart.
- Commercial account detail lookup requires active membership in the requested commercial account.
- Commercial financial controls require authenticated membership, verified organisation/member authority, enabled privileges, a verified provider mapping, strong step-up authentication, and explicit role authorization for protected actions.
- Commercial administrative data is minimized by role; sensitive verification, member-contact, provider-account, and organisation-identifier data is restricted to administrative roles.
- Generic `/api/platform/*` sensitive operations are protected by the server-only `SMARTCOMMERCE_PLATFORM_INTERNAL_TOKEN` boundary; public reads are separated from privileged operations.
- Platform gateway request bodies are bounded and raw internal exception details are no longer returned to callers.
- Cart mutation and quote-generation velocity controls use the durable database-backed rate-limit infrastructure.
- Quote creation is replay-resistant within a quote window: identical authenticated customer/cart/pricing state produces the same quote identifier instead of creating duplicate quote records.
- Commerce velocity blocks and quote creation/replay events are recorded in the security event stream.

### Closed findings

#### SC-SEC-002 — Commercial financial role authorization

Closed in code. Financial controls now enforce explicit server-side role allowlists. Owner/admin/approver/buyer may inspect/evaluate permitted financial entitlements; override requests are restricted to owner/admin/approver. Strong step-up remains additive and denied-role attempts are security-audited.

#### SC-SEC-003 — Commercial account data minimization

Closed in code. Sensitive commercial account fields and fraud-review data are restricted by role; non-administrative members receive only the operational data required for their role.

#### SC-FRAUD-001 — Commerce velocity abuse

Closed in code for the current cart/quote surface. Authenticated cart mutations and quote creation are subject to durable customer-level limits, quote creation also has an IP-level limit, and rate-limit events are logged. Thresholds must be tuned from production telemetry rather than treated as permanent constants.

#### SC-FRAUD-002 — Duplicate quote/replay generation

Closed in code for current checkout quote creation. Quote IDs are deterministically derived from authenticated customer, cart, revalidated provider pricing, totals, and the active quote window. Repeated submission of the same state uses `ON CONFLICT DO NOTHING`, preventing duplicate quote records from retries/double taps while allowing a new quote after the quote window or pricing/cart state changes.

### Open: high priority fraud controls

#### SC-FRAUD-003 — Order/payment idempotency

Before a payment-capable order write path is enabled, every order/payment creation request must require a server-enforced idempotency boundary. A retry, browser double-submit, network replay, or webhook retry must never create a second financial transaction or duplicate fulfillment obligation.

Required remediation:

- Persist idempotency keys with authenticated actor/customer, operation, request fingerprint, response reference, and expiry.
- Reject reuse of a key with a different request fingerprint.
- Make provider/webhook handling idempotent by provider event ID.
- Add database uniqueness constraints at the final order/payment boundary, not only application checks.

#### SC-FRAUD-004 — Commercial application velocity and identity abuse

Commercial account creation already flags duplicate verified organisations and government claims for review, but application-submission velocity and repeated identity-claim patterns still require dedicated controls.

Required remediation:

- Rate-limit commercial account applications by authenticated customer and network signal.
- Escalate repeated tax/registration/work-domain claims across accounts to manual review rather than auto-trust.
- Record reviewable fraud signals without exposing those signals to normal account members.

#### SC-FRAUD-005 — Account takeover transaction escalation

Authentication security is strong, but transactional risk should also consider session/device change and recent security events.

Required remediation:

- Require fresh strong step-up for high-risk future actions such as payment-method change, refund destination change, high-value order, credit use, or commercial privilege change.
- Add risk escalation for new-device/new-network activity combined with sensitive transactions.
- Keep customer-visible messaging generic so fraud rules cannot be easily reverse engineered.

### Open: operational assurance

- Refund/credit/promo abuse controls once those write paths are enabled.
- Tamper-resistant audit/event retention and operational alerting.
- Automated authorization regression tests covering cross-customer and cross-commercial-account IDOR cases.
- Production telemetry review and threshold tuning for all durable rate limits.
- Deployment verification for security changes currently blocked by hosting build-rate limits.

## Release rule

SmartCommerce must not be described as "hack free", "fraud free", or "scam free". Production readiness means material risks are identified, controls are implemented, and adversarial tests pass; it is not a guarantee that compromise or fraud is impossible.
