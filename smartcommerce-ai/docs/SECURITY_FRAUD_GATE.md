# SmartCommerce Security & Fraud Gate

This document tracks security and fraud-control findings discovered during the production-readiness audit.

## Current gate status

### Closed in code

- Customer sessions use server-side session lookup and customer scoping.
- Persistent cart mutations are scoped to the authenticated customer's active cart.
- Commercial account detail lookup requires active membership in the requested commercial account.
- Commercial financial controls require authenticated membership, verified organisation/member authority, enabled privileges, a verified provider mapping, strong step-up authentication, explicit role authorization, and request-context binding for protected actions.
- Commercial administrative data is minimized by role; sensitive verification, member-contact, provider-account, and organisation-identifier data is restricted to administrative roles.
- Generic `/api/platform/*` sensitive operations are protected by the server-only `SMARTCOMMERCE_PLATFORM_INTERNAL_TOKEN` boundary; public reads are separated from privileged operations.
- Platform gateway request bodies are bounded and raw internal exception details are no longer returned to callers.
- Cart mutation and quote-generation velocity controls use the durable database-backed rate-limit infrastructure.
- Quote creation is replay-resistant within a quote window: identical authenticated customer/cart/pricing state produces the same quote identifier instead of creating duplicate quote records.
- Commerce velocity blocks and quote creation/replay events are recorded in the security event stream.
- Commercial account applications are velocity-limited by authenticated customer and network signal; repeat applications and duplicate organisation claims are escalated to review.
- Platform order, invoice, and checkout creation require durable idempotency keys. Replays with the same request return the stored response, while reuse of a key for a changed request is rejected.
- Provider webhook processing requires a provider event ID and is durably replay-protected for 72 hours.
- Sensitive commercial financial actions require the current request to match a recent successful TOTP, recovery-code, or passkey strong-authentication event for the same session. A changed request context or a newer high-risk security event invalidates the active step-up window and requires fresh strong authentication.
- Security CI installs from the synchronized lockfile, runs production builds, and fails on high/critical production dependency vulnerabilities. CodeQL analysis is retained as an advisory job until GitHub code scanning is enabled for this repository.
- Security events support an HMAC-SHA-256 append-only integrity chain. Each protected event commits its predecessor hash and event hash through an atomic compare-and-advance database statement, and an internal-only verifier detects changed events, deleted/disconnected events, forks, cycles, count mismatches, and chain-head mismatches.

### Closed findings

#### SC-SEC-002 — Commercial financial role authorization

Closed in code. Financial controls now enforce explicit server-side role allowlists. Owner/admin/approver/buyer may inspect/evaluate permitted financial entitlements; override requests are restricted to owner/admin/approver. Strong step-up remains additive and denied-role attempts are security-audited.

#### SC-SEC-003 — Commercial account data minimization

Closed in code. Sensitive commercial account fields and fraud-review data are restricted by role; non-administrative members receive only the operational data required for their role.

#### SC-FRAUD-001 — Commerce velocity abuse

Closed in code for the current cart/quote surface. Authenticated cart mutations and quote creation are subject to durable customer-level limits, quote creation also has an IP-level limit, and rate-limit events are logged. Thresholds must be tuned from production telemetry rather than treated as permanent constants.

#### SC-FRAUD-002 — Duplicate quote/replay generation

Closed in code for current checkout quote creation. Quote IDs are deterministically derived from authenticated customer, cart, revalidated provider pricing, totals, and the active quote window. Repeated submission of the same state uses `ON CONFLICT DO NOTHING`, preventing duplicate quote records from retries/double taps while allowing a new quote after the quote window or pricing/cart state changes.

#### SC-FRAUD-003 — Order/payment idempotency

Closed in code for the currently implemented platform order/invoice/checkout boundary and provider webhook gateway. Protected writes require a server-enforced idempotency key, persisted with business/provider scope, operation, request fingerprint, stored response, and expiry. Reuse of a key with a different request fingerprint is rejected. Concurrent duplicates fail closed while the original request is processing. Provider webhooks require `X-Provider-Event-Id` and are replay-protected independently from normal request idempotency.

No direct payment-processor charge endpoint is currently enabled. When one is introduced, it must use the same durable boundary plus the payment provider's own idempotency facility and a database uniqueness constraint on the provider transaction/reference ID.

#### SC-FRAUD-004 — Commercial application velocity and identity abuse

Closed in code for the current commercial-account application surface. Application creation is rate-limited per authenticated customer and IP/network signal. Government claims, duplicate organisation identifiers/names, and repeated applicant behavior are routed to manual review while account privileges remain locked. Review signals are stored in commercial verification/audit data and the security event stream, which are not exposed to ordinary non-administrative commercial members.

#### SC-FRAUD-005 — Account takeover transaction escalation

Closed in code for the currently implemented high-risk commercial financial actions. SmartCommerce now binds an active strong-authentication window to the IP and user-agent context of the successful TOTP, recovery-code, or passkey event. If the sensitive request arrives from a different context, lacks a recent matching strong-auth event, or a newer high/critical security event exists after that authentication, the existing step-up window is invalidated and a fresh passkey/authenticator/recovery-code confirmation is required. Customer-visible responses remain generic; detailed signals are stored only in the security event stream.

Future payment-method changes, refund-destination changes, direct payment charging, and other newly introduced high-risk transaction paths must call the same sensitive-action risk boundary rather than implementing weaker local checks.

#### SC-OPS-001 — Automated dependency and static-analysis gate

Closed for the mandatory build and dependency-vulnerability gates. The repository dependency lockfile is synchronized with the current server dependencies and both normal CI and security CI use `npm ci`. The security workflow builds the production application and fails for high/critical vulnerabilities in production dependencies. The primary build workflow also runs on `security/**` branches so security changes receive normal compilation checks before merge. During this gate, the stale lockfile exposed two high-severity transitive dependency findings; the lockfile was regenerated/fixed and the dependency-audit job subsequently passed.

CodeQL successfully initializes, builds and executes JavaScript/TypeScript analysis in Actions and produces SARIF, but GitHub cannot register the analysis because repository code scanning is not currently enabled. The CodeQL job is therefore advisory rather than a required merge gate until that repository setting/capability is enabled. This is an operational GitHub configuration limitation, not evidence that the application passed or failed every CodeQL query.

#### SC-OPS-002 — Tamper-evident security event integrity

Closed in code, configuration pending. When `SMARTCOMMERCE_AUDIT_INTEGRITY_KEY` is configured with at least 32 characters, every new `security_events` record is HMAC chained to the previous protected event. The chain head and event count are advanced atomically with the event insert, preventing concurrent writers from creating an accepted fork. `/api/security-integrity` is protected by `SMARTCOMMERCE_PLATFORM_INTERNAL_TOKEN` and verifies the complete protected chain without exposing event contents. Existing historical events created before integrity-key activation remain outside the v1 chain.

The integrity key must remain server-only, independent from customer MFA secrets and frontend configuration, and must never use a `VITE_` environment variable. Key rotation requires a deliberate new chain/version rather than silently re-signing history.

### Open: operational assurance

- Refund/credit/promo abuse controls once those write paths are enabled.
- Security-event retention policy plus automated external alert delivery when the integrity verifier fails or critical security events occur.
- Automated authorization regression tests covering cross-customer and cross-commercial-account IDOR cases.
- Enable GitHub repository code scanning if CodeQL result publication and repository-native alerts are desired as a required gate.
- Production telemetry review and threshold tuning for all durable rate limits and transaction-risk signals.
- Deployment and live integrity-chain verification after hosting build capacity is available and `SMARTCOMMERCE_AUDIT_INTEGRITY_KEY` is configured.

## Release rule

SmartCommerce must not be described as "hack free", "fraud free", or "scam free". Production readiness means material risks are identified, controls are implemented, and adversarial tests pass; it is not a guarantee that compromise or fraud is impossible.
