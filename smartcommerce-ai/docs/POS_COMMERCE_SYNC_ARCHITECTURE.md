# Total Tools POS ↔ Website Commerce Synchronization

## Baseline architecture map

The website is a React/Vite storefront with serverless TypeScript APIs and Neon-backed durable customer/commerce state. Catalog discovery currently reads the Total Tools POS through `totalToolsPosReadAdapter`; the website does not maintain an independent physical-stock ledger. Protected platform operations are server-authorized and request writes already have a durable idempotency layer.

The synchronization program extends those boundaries rather than replacing them:

- **POS:** operational authority for catalog identity, SKUs, variations, operational pricing, promotions, stock state, repair/rental lifecycle and approval outcomes.
- **Website:** authority for customer experience, website editorial/SEO fields, presentation, customer sessions/carts and permitted website-originated requests.
- **Sync ledger:** durable identity, version, event, conflict and outbound-delivery evidence between the two systems.
- **Storefront reads:** may use safely published/cached state for page speed; high-risk final actions continue to require authoritative validation.

## Non-negotiable invariants

1. One `(source, entity_type, POS entity ID)` maps to at most one website identity.
2. Mutable display names never establish synchronized identity.
3. Older authoritative versions never replace newer accepted state.
4. Same event + same payload is a replay, not a second mutation.
5. Same authoritative version + different payload is a conflict and fails closed.
6. Website stock is a projection of POS authority, never a second physical inventory ledger.
7. A website-originated order/request is not “transferred” until POS acceptance is durably recorded.
8. Retrying an outbound operation uses the same idempotency identity and cannot create a duplicate POS record.
9. Customer-visible repair/rental/approval state is explicitly allowlisted; internal notes, routing and audit evidence remain private.
10. Raw database/provider errors and secrets never cross the ordinary user boundary.
## Versioned inbound contract

Inbound POS publication uses `/api/integrations/pos/v1/events`. Each request is HMAC-SHA256 signed with a short replay window and contains a stable event envelope: event ID, event type, entity type, authoritative entity ID, monotonically increasing entity version, occurrence time, source, correlation ID and payload.

Admission is serialized transactionally by event ID and authoritative entity identity. The database function classifies each delivery as applied, replayed, stale or conflict before changing accepted state. Conflicts are preserved for review; they are never resolved by last-write-wins.

Catalog publication order is governed as:

`Brand → Category hierarchy → Product → Variation → Media → Price → Availability → Promotion relationships`

Dependencies are data invariants, not timing assumptions. Later slices must mark events `blocked` until referenced identities exist and must resume them without replaying already committed dependencies.

## Field ownership

`POS_COMMERCE_FIELD_AUTHORITY` is the initial ownership registry. Operational identity, SKU/barcode/part-number, category hierarchy, price/tax/eligibility, availability and promotion rules are POS-owned. Website editorial description and SEO fields remain website-owned. Shared-review fields must never silently choose a winner.

## Durable website → POS delivery

`pos_sync_outbox` is the authoritative website-side delivery record. Operations move through human-readable equivalents of Pending transfer, Transferring, Accepted by POS, Failed and Needs review. HTTP attempt alone is not acceptance. Every operation has a stable idempotency key, correlation ID, attempt count and POS reference when accepted.

## Security and privacy boundaries

Privileged POS credentials remain server-side. Inbound synchronization fails closed when the signing secret is absent, rejects stale signatures, bounds request size, rejects malformed/unknown critical envelope fields and sanitizes public errors. Customer/service synchronization uses explicit public field contracts rather than mirroring entire POS records.

## Release sequencing

Continuous publication must not be enabled until initial reconciliation classifies existing records as matched confidently, possible match, website only, POS only or conflict. No destructive cleanup is automatic. Each capability is promoted only after contract, concurrency/replay, migration, regression, security and production-build evidence is green on the exact release commit.
