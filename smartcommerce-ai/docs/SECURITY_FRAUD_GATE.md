# SmartCommerce Security & Fraud Gate

This document tracks security and fraud-control findings discovered during the production-readiness audit.

## Current gate status

### Closed in code

- Customer sessions use server-side session lookup and customer scoping.
- Persistent cart mutations are scoped to the authenticated customer's active cart.
- Commercial account detail lookup requires active membership in the requested commercial account.
- Commercial financial controls require authenticated membership, verified organisation/member authority, enabled privileges, a verified provider mapping, and strong step-up authentication for protected actions.
- Generic `/api/platform/*` sensitive operations are protected by the server-only `SMARTCOMMERCE_PLATFORM_INTERNAL_TOKEN` boundary; public reads are separated from privileged operations.
- Platform gateway request bodies are bounded and raw internal exception details are no longer returned to callers.

### Open: high priority

#### SC-SEC-002 — Commercial financial role authorization

The commercial financial-policy endpoint currently verifies that the caller is an active member and that organisation/member/provider trust is verified, but it does not independently restrict financial-policy actions by commercial role. A verified member with a non-financial role could therefore reach entitlement evaluation or submit a financial override request if their authority status is verified.

Required remediation:

- Define explicit financial roles/capabilities (for example owner/admin/buyer/approver as applicable to business policy).
- Enforce role authorization server-side before returning financial controls and before `evaluate` or `request_override` actions.
- Keep strong step-up as an additional control, not as a substitute for authorization.
- Record denied role attempts in the security event log.

#### SC-SEC-003 — Commercial account data minimization

`accountDetails` currently returns organisation tax identifiers, member names/emails, approval rules, and verification application/risk information to any active member of the commercial account. Membership proves tenancy but not a need to see all sensitive administrative and fraud-review data.

Required remediation:

- Apply field-level and section-level authorization by commercial role.
- Restrict verification applications, risk flags, tax identifiers, and full member directory details to authorised administrative roles.
- Return only the minimum data needed by buyer/approver/project users.

### Open: fraud controls

- Transaction/order velocity rules and duplicate-order detection.
- Account takeover risk signals and unusual-device/session escalation.
- Refund/credit/promo abuse controls once those write paths are enabled.
- Tamper-resistant audit/event retention and operational alerting.
- Automated authorization regression tests (cross-customer and cross-commercial-account IDOR cases).

## Release rule

SmartCommerce must not be described as "hack free", "fraud free", or "scam free". Production readiness means material risks are identified, controls are implemented, and adversarial tests pass; it is not a guarantee that compromise or fraud is impossible.
