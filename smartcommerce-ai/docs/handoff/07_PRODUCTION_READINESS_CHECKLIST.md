# Production Readiness Checklist

## Non-negotiables

- [ ] SmartCommerce remains provider/POS agnostic.
- [ ] No direct app-wide coupling to provider-specific field names.
- [ ] Canonical contract mapping is enforced at adapter boundary.
- [ ] No fabricated live-critical data (stock, price, availability, customer, promotions).
- [ ] Missing data is handled explicitly and safely.
- [ ] Secrets are not in frontend source or repository.
- [ ] Security does not rely solely on frontend checks.
- [ ] Production workflows are tested.

## Capability readiness gates

### Product search
- [ ] Search executes against real provider.
- [ ] Canonical product normalization passes.
- [ ] Branch availability and pricing are accurate.
- [ ] Duplicates are resolved.
- [ ] Error and retry states are production-grade.
- [ ] No silent demo fallback.
- [ ] Tests exist.

### Rentals
- [ ] Live rental asset availability.
- [ ] Reservation lifecycle correctness.
- [ ] Branch/delivery constraints validated.
- [ ] Error-safe recovery states.
- [ ] Tests exist.

### Repairs
- [ ] Live repair catalog/source.
- [ ] Request-to-job lifecycle tracking.
- [ ] Branch scheduling correctness.
- [ ] Explicit unsupported/missing capability handling.
- [ ] Tests exist.

### Customer/quotes/orders
- [ ] Customer identity/account context is reliable.
- [ ] Quote/order creation is traceable and auditable.
- [ ] Transaction state sync with provider is observable.
- [ ] Tests exist.

## Platform and operations

- [ ] Adapter capability matrix documented per provider.
- [ ] Logging and request correlation IDs are end-to-end.
- [ ] Health checks and alerting are in place.
- [ ] Deployment and rollback process documented.
