# SmartCommerce Operations Manual

This is the living operating manual for SmartCommerce. Every major production feature should be documented here by role before it is considered operationally complete.

## Documentation modules

1. `payments/PAYMENTS-ARCHITECTURE.md` — payment rails, settlement, verification, reconciliation, refunds, disputes, and provider responsibilities.
2. `DELIVERY-FULFILMENT-ENGINE.md` — parcel courier pricing, 20% operational markup, manual-review rules for large items/rentals, fulfilment controls, and role responsibilities.
3. `roles/SALES-AGENT-MANUAL.md` — what frontline sales/customer-service staff need to know and do.
4. `roles/BOOKKEEPING-MANUAL.md` — settlements, fees, reconciliation, exceptions, refunds, and accounting controls.
5. `roles/MANAGEMENT-MANUAL.md` — controls, KPIs, approvals, risk, provider decisions, and oversight.
6. `roles/DEVELOPER-MANUAL.md` — implementation contracts, security boundaries, webhooks, idempotency, observability, testing, and deployment rules.
7. `IMPLEMENTATION-DECISION-LOG.md` — chronological record of important architecture/product decisions and why they were made.

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

## Delivery principle

Customer convenience must not create unreliable freight pricing. SmartCommerce may automatically price verified small-parcel shipments through approved courier rate adapters, with the approved operational markup stored separately from the provider cost. Rentals, large/heavy/oversized items, special-handling freight, or shipments with incomplete trusted freight data must be routed to manual review and pricing instead of guessed automatically.

## Documentation ownership

This manual is versioned with the codebase. Production behavior and documentation should move together. When implementation changes, the relevant role modules and decision log should be updated in the same development cycle.
