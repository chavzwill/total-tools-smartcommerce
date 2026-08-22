# SmartCommerce Operations Manual

This is the living operating manual for SmartCommerce. Every major production feature should be documented here by role before it is considered operationally complete.

## Documentation modules

1. `payments/PAYMENTS-ARCHITECTURE.md` — payment rails, settlement, verification, reconciliation, refunds, disputes, and provider responsibilities.
2. `roles/SALES-AGENT-MANUAL.md` — what frontline sales/customer-service staff need to know and do.
3. `roles/BOOKKEEPING-MANUAL.md` — settlements, fees, reconciliation, exceptions, refunds, and accounting controls.
4. `roles/MANAGEMENT-MANUAL.md` — controls, KPIs, approvals, risk, provider decisions, and oversight.
5. `roles/DEVELOPER-MANUAL.md` — implementation contracts, security boundaries, webhooks, idempotency, observability, testing, and deployment rules.
6. `IMPLEMENTATION-DECISION-LOG.md` — chronological record of important architecture/product decisions and why they were made.

## Operating rule

A feature is not complete merely because the interface works. It must also have:

- a documented business purpose;
- a documented source of truth;
- defined user roles and permissions;
- failure and exception handling;
- auditability;
- accounting/operational consequences documented where applicable;
- developer implementation notes;
- an entry in the implementation decision log when the decision materially affects architecture or operations.

## Payment principle

Customer choice must not create accounting chaos. SmartCommerce should expose multiple payment experiences while consolidating settlement through as few financial rails as practical. The platform records and reconciles every payment through one internal payment ledger regardless of provider.

## Documentation ownership

This manual is versioned with the codebase. Production behavior and documentation should move together. When implementation changes, the relevant role modules and decision log should be updated in the same development cycle.
