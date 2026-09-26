# Staff approval authority

All staff approval decisions belong in the POS. This supersedes earlier courier design documents assigning verification, bank review or payout approval to SmartCommerce staff.

SmartCommerce collects applications, documents and requests, and displays recorded status. Customer decisions on their own repair estimates and courier responses to delivery offers are not staff approvals.

## Implemented boundaries

- Courier registration, identity/business documents, bank verification and payout decisions: blocked in SmartCommerce runtime; staff decision controls removed.
- Migration 20260926 adds database guards and prevents legacy local courier approvals from enabling checkout services, new dispatch jobs or pickup passes. It must be applied before deployment; it has only been tested locally.
- Payroll approval/finalization and manual staff recording of repair decisions: blocked at authenticated API boundary; decision buttons removed.
- Generic staff operations proxy: read-only. Arbitrary write bodies could otherwise bypass POS-only approvals through status updates. Non-decision operations must be performed in POS until a reviewed, narrowly scoped write contract is available.
- Adaptive integration capability approval/rejection/revocation: staff REST decisions blocked as well.
- Commercial applications and credit/override requests remain submissions; no new SmartCommerce staff approval endpoint is introduced. Existing customer self-service and server-authenticated external data readers are retained.

## Integration status

No POS approval ingestion contract is implemented or enabled. Requests must not be labelled sent to POS or POS approved. Submitted courier registrations are saved in SmartCommerce for a future POS handoff; they have not reached a POS review queue. Historical local statuses are not evidence of POS approval. No POS code, production database, payment credentials, deployment or merge was changed.

Before live activation, implement the POS review queue and authenticated versioned decision exchange with actor, reason, entity identity, event identity, replay protection and audit records. Replace the fail-closed courier database guards only with that reviewed authority contract. Do not add a browser credential or local override.
