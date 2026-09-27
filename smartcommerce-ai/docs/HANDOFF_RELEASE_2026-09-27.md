# SmartCommerce Handoff Release — 2026-09-27

## Canonical handoff candidate

Branch: `release/handoff-2026-09`

This branch consolidates the current SmartCommerce customer platform, courier operations, POS authority boundaries, durable POS commerce synchronization, commercial-team lifecycle, payments, security hardening, and grounded intelligence into one release candidate.

Do not use historical feature or preview branches as the source of truth for handoff.

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

## Certification completed on this candidate

`npm ci` completed with 0 vulnerabilities.

`npm run build` passed end-to-end, including the full release gate, both TypeScript configurations and the Vite production build.

The release gate passed security, staff/POS authority, commercial-team/member enforcement, intelligence grounding, storefront stability, courier, payment and POS-sync regression suites.

## Environment-dependent acceptance still required

The database-backed courier and POS outbox suites require disposable PostgreSQL databases and intentionally refuse to run without them. Set `COURIER_TEST_DATABASE_URL` and `POS_TEST_DATABASE_URL` to isolated test databases, then run:

```bash
npm run test:couriers-database
npm run test:pos-order-database
```

Before enabling broad live checkout, verify a non-production SmartCommerce/POS pair for duplicate submissions, lost responses, reconciliation, concurrency, stock rejection and price changes. Apply required migrations transactionally and keep credentials server-only.

## Ownership and operations handoff

Before the final organizational transfer, confirm production environment variables and secret ownership, deployment/rollback access, database ownership/backups, payment credentials, POS integration credentials, monitoring/alert destinations and incident contacts. Secrets must not be copied into this repository or handoff document.

The repository currently lives under the personal GitHub owner `chavzwill`; long-term company ownership should be transferred to the approved company organization/account after the release candidate is accepted.

## Branch policy for handoff

1. Review and qualify `release/handoff-2026-09`.
2. Merge the accepted release into `main`.
3. Tag the accepted commit (recommended: `smartcommerce-v1.0-handoff`).
4. Protect `main` with required review/status checks.
5. Archive/delete superseded branches only after confirming they contain no unique accepted work.

## Known external dependencies

Some final acceptance depends on systems outside this repository: a disposable PostgreSQL test environment, a non-production POS endpoint/database pair, production secrets/credentials and the company GitHub ownership decision. These are deployment/ownership dependencies, not reasons to weaken repository safety controls.
