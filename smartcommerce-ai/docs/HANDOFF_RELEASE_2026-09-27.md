# SmartCommerce Handoff Release — 2026-09-27

## Canonical handoff release

Canonical branch: `main`

SmartCommerce handoff code is consolidated on `main`. Historical feature and preview branches are retained only for audit/history and are not alternate sources of truth.

Current accepted SmartCommerce production line includes the customer commerce platform, courier operations, POS authority boundaries, durable POS commerce synchronization, commercial-team lifecycle, payments, security hardening, grounded intelligence and the production ESM fix found during final live smoke testing.

## Included handoff-critical capabilities

- Customer-facing commerce shell and catalogue workflows.
- Security/session/account-recovery and authorization regression gates.
- Commercial account controls plus team invitation, roles, permissions, spending limits and member enforcement.
- Courier application, identity, service/rate, dispatch, delivery, proof and POS staff-authority flows.
- HandyPay hosted-payment workflow and settlement validation.
- Grounded AI/Product Match and branch-aware commerce guidance.
- Rental grounding and provider-currency handling.
- Durable POS commerce sync admission, versioning, dependency checks, order outbox and retry-safe delivery.
- Staff approval authority remains in the POS rather than SmartCommerce.

## Certification completed

`npm ci` completed with 0 vulnerabilities.

A clean `npm run build` passed end-to-end, including the full release gate, both TypeScript configurations and the Vite production build. Security, staff/POS authority, commercial-team/member enforcement, intelligence grounding, storefront stability, courier, payment and POS-sync regression suites passed.

Database-backed acceptance was completed on an isolated disposable PostgreSQL 16 cluster bound to localhost on a separate port. `npm run test:couriers-database` passed the courier migration, ownership, idempotency, concurrency, encrypted proof, payout, delivery, payment and POS-authority database checks. `npm run test:pos-order-database` passed the POS order-outbox concurrency, lease fencing, immutable payload, replay, conflict, retry/backoff and category-cycle regression suite. The disposable cluster was stopped and deleted after testing.

## Production smoke acceptance

The current SmartCommerce `main` production deployment was verified READY on Vercel. Final smoke testing discovered an extensionless Node ESM runtime import in the POS export manifest; PR #44 fixed it and added regression coverage. After deployment, `/api/pos-export-manifest` no longer crashes and correctly returns `401 PLATFORM_AUTH_REQUIRED` without trusted server credentials.

The production homepage responds successfully and protected integration endpoints continue to fail closed when authorization is absent.

## POS integration acceptance

The current POS `master` already contains the newer `/api/smartcommerce-orders` contract with scoped API-key access, external-order idempotency, reconciliation, delivery/service/handling accounting, POS-authoritative price/tax handling and branch stock reservation.

The missing durable POS-to-SmartCommerce event outbox was ported onto current POS master rather than merging the stale historical integration branch. POS PR #95 was locally accepted and merged to `master` at `8082680d5efddd006df68d2453a9fd3d115c6ff5`.

Local current-master acceptance verified authenticated commerce catalog reads, no internal cost leakage, branch availability, scoped order reconciliation, 21 installed sync triggers, versioned event creation, and fail-closed preservation of pending events when sync credentials are absent.

## Ownership and operations handoff

Production credentials, payment secrets, POS integration credentials and database secrets must remain outside Git. Organizational turnover should move repository ownership, deployment access, secret ownership, database administration, monitoring/alert destinations and incident contacts to approved company-controlled accounts.

The repository currently lives under the personal GitHub owner `chavzwill`; this is an administrative ownership-transfer item, not an unresolved code defect.

## Branch policy after handoff

1. Use `main` as the only accepted baseline.
2. Protect the company-owned default branch with required review/status checks once transferred.
3. Keep historical branches only as long as needed for audit; remove them after confirming company retention requirements.
4. Require focused branches and reviewed changes for future development.

## Remaining administrative dependencies

The remaining handoff items are account/ownership operations that require company-controlled destinations or credentials: repository ownership transfer, company-controlled production secrets/access, and hosted GitHub Actions restoration/rerun if the account billing/spending restriction remains in effect. These should not be represented as software defects or bypassed by weakening controls.
