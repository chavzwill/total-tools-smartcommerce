# Prioritized Roadmap and Acceptance Criteria

## Priority order

1. Real provider/POS connection
2. Canonicalize architecture and remove dead/duplicate paths
3. Wire live products, inventory, pricing, branches
4. Wire rentals
5. Wire repairs
6. Wire customer/account context
7. Wire quotes/orders
8. Connect AI/orchestrator to real capabilities
9. Authentication, security, permissions
10. Testing, observability, deployment

## Milestone 1 (first production milestone)

### Goal

A customer search in SmartCommerce returns real provider product/price/branch stock via canonical models, with no silent fallback demo data.

### Acceptance criteria

- [ ] UI search calls provider-backed path through platform abstractions.
- [ ] Canonical product and availability mapping validated.
- [ ] Branch stock and pricing reflect provider authority.
- [ ] Duplicate/conflicting product records are handled.
- [ ] Missing data is surfaced safely, not fabricated.
- [ ] Error/retry UX is explicit and user-safe.
- [ ] Automated tests cover normal + failure scenarios.

## Milestone 2 (rentals)

- [ ] Live rental availability from provider.
- [ ] Reservation requests persist and return trusted status.
- [ ] Branch and delivery constraints enforced.
- [ ] Tests for rental booking and failure states.

## Milestone 3 (repairs)

- [ ] Live repair catalog and booking flow.
- [ ] Job status tracking from provider.
- [ ] Safe handling when provider lacks specific capabilities.
- [ ] Tests for repair request lifecycle.

## Milestone 4 (customer/commercial/orders)

- [ ] Customer account linking and context propagation.
- [ ] Quote/order flows with provider traceability.
- [ ] Audit-friendly transaction records.
- [ ] Tests for core transaction paths.

## Milestone 5 (AI + operations)

- [ ] AI guidance grounded in real provider capabilities/data.
- [ ] No recommendations based on fabricated catalog facts.
- [ ] Security model and access boundaries validated.
- [ ] Observability, incident response, and deployment controls in place.
