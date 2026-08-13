# Prioritized Roadmap and Acceptance Criteria

## Priority order

1. Prove one real authoritative provider connection end-to-end
2. Add adaptive integration discovery/mapping around the proven provider boundary
3. Wire live products, inventory, pricing, and branches with no silent fake fallback
4. Build production search/filter/discovery on authoritative data
5. Implement customer identity/account context
6. Implement transaction-safe cart/order/quote lifecycle
7. Complete rental verification + live reservation lifecycle
8. Complete repair/service lifecycle
9. Ground AI/orchestrator actions in real capabilities and data
10. Add data trust/deduplication/conflict handling across integrations
11. Harden authentication, permissions, observability, and deployment
12. Expand automated test coverage continuously across every milestone

Architecture cleanup should occur only where it blocks these milestones. Do not add another orchestration/planning layer merely to reorganize existing code.

## Milestone 1 — Real product/price/branch-stock vertical slice

### Goal

A customer search in SmartCommerce returns real provider product, authoritative price, and authoritative branch stock via canonical models, with no silent fallback demo data.

### Acceptance criteria

- [ ] UI search calls provider-backed path through platform abstractions.
- [ ] Canonical product and availability mapping validated.
- [ ] Branch stock and pricing reflect provider authority.
- [ ] Duplicate/conflicting product records are handled or surfaced safely.
- [ ] Missing data is surfaced safely, not fabricated.
- [ ] Error/retry UX is explicit and user-safe.
- [ ] Automated tests cover normal + failure scenarios.
- [ ] Provider/auth failure never silently falls back to fake production data.

## Milestone 2 — Adaptive integration intelligence

### Goal

SmartCommerce can connect to a materially different business-system API without depending on exact provider route/field names.

### Acceptance criteria

- [ ] Discover available provider endpoints/capabilities from API description, schemas, metadata, and/or safe inspection.
- [ ] Infer canonical capability using route, method, parameters, schema, samples, and semantic evidence.
- [ ] Demonstrate that materially different routes (for example `/items` vs `/products`) can map to the same canonical capability when data semantics match.
- [ ] Map materially different provider field names into canonical product/customer/inventory concepts.
- [ ] Record confidence and provenance for inferred mappings.
- [ ] Persist validated provider capability profile for reuse.
- [ ] Mark each capability available, conditional, unsupported, unverified, or disabled.
- [ ] Close unsupported capabilities so UI/AI/planner cannot execute them accidentally.
- [ ] Read-only mappings may activate under validated policy thresholds.
- [ ] Transactional write mappings require higher confidence and explicit verification/approval.
- [ ] Tests cover ambiguous routes, conflicting schemas, missing required fields, and unsupported capabilities.

## Milestone 3 — Production discovery

- [ ] Price, brand, category, branch, availability, and relevant attribute filters use real provider data.
- [ ] Search/filter state persists appropriately.
- [ ] Missing data is not treated as zero/false.
- [ ] Empty/error states distinguish no results from provider failure.
- [ ] Search results do not silently mix fake and authoritative records.
- [ ] Automated tests cover combined filters and stale request handling.

## Milestone 4 — Customer identity and transactions

- [ ] Customer account linking and context propagation.
- [ ] Persistent cart/project state.
- [ ] Quote/order flows with provider traceability.
- [ ] Audit-friendly transaction records.
- [ ] Transactional writes are capability-verified before execution.
- [ ] Tests cover duplicate submission, provider failure, and recovery.

## Milestone 5 — Verified rentals

### Goal

A rental cannot be represented as confirmed until SmartCommerce verifies the machine, requested availability interval, and customer eligibility.

### Machine verification acceptance criteria

- [ ] Asset identity/product relationship is verified.
- [ ] Branch/location is authoritative.
- [ ] Rentable/active status is verified.
- [ ] Maintenance, inspection, service, damage, and hold states are considered when the provider exposes them.
- [ ] Required accessories/attachments are accounted for when necessary.

### Availability verification acceptance criteria

- [ ] Requested start/end interval is validated.
- [ ] Existing reservations and active rentals are considered.
- [ ] Expected returns and operational turnaround are considered when available.
- [ ] Maintenance/inspection windows are considered.
- [ ] Branch transfer/logistics constraints are considered.
- [ ] Quantity and required accessories are considered.
- [ ] Result distinguishes available, available later, other branch, transfer, waitlist, unavailable, and unknown states as supported.

### Customer eligibility acceptance criteria

- [ ] Customer/account identity requirement is resolved.
- [ ] Account standing/overdue rentals can influence eligibility when authoritative data is available.
- [ ] Deposit requirements are surfaced.
- [ ] Required certification/licence/insurance is surfaced where applicable.
- [ ] Manual-review conditions are explicit.
- [ ] Eligibility distinguishes approved, conditional, manual review, and rejected outcomes.

### Reservation acceptance criteria

- [ ] Reservation request carries verification context/provenance.
- [ ] `confirmed` status cannot be represented when verification policy is unresolved.
- [ ] Live provider reservation returns trusted status/external reference.
- [ ] Branch/delivery constraints are enforced.
- [ ] Tests cover machine hold, schedule conflict, ineligible customer, conditional approval, manual review, and successful reservation.

## Milestone 6 — Repairs

- [ ] Live repair catalog and booking flow.
- [ ] Job status tracking from provider.
- [ ] Customer approval/quote states supported where provider exposes them.
- [ ] Safe handling when provider lacks specific capabilities.
- [ ] Tests cover repair request lifecycle and provider failure.

## Milestone 7 — AI + data intelligence + operations

- [ ] AI guidance is grounded in real provider capabilities/data.
- [ ] AI cannot plan closed/unsupported capabilities.
- [ ] Recommendations do not rely on fabricated catalog facts.
- [ ] Data quality pipeline scores and validates incoming records.
- [ ] Duplicate/conflicting records can be merged, quarantined, or surfaced for review.
- [ ] Security model and access boundaries validated.
- [ ] Observability, incident response, and deployment controls in place.
- [ ] Critical workflows have automated integration tests.
