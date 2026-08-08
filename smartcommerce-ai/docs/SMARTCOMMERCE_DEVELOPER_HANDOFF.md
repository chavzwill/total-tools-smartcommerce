# SmartCommerce Developer Handoff

This package is the canonical onboarding set for SmartCommerce-AI in this repository.

## What is SmartCommerce?

SmartCommerce-AI is an AI-native customer commerce layer that sits above a business system/POS. It provides customer-facing sales, inventory, rentals, repairs, and commercial workflows while integrating with (not replacing) the provider/POS.

## First-hour answers

### What already works

- Frontend route shell and major customer pages exist in `src/pages`.
- Platform canonical contracts exist in `src/platform/contracts.ts`.
- POS adapter contract exists in `src/platform/posAdapter.ts`.
- API client, production sync client, and connector scaffolding exist in `src/apiClient.ts` and `src/services/pos/posTypes.ts`.
- Backend REST routing/service scaffolding exists in `src/backend`.

### What is fake/demo right now

- Local fallback catalog/rental/repair datasets in:
  - `src/data/products.ts`
  - `src/data/rentals.ts`
  - `src/data/repairs.ts`
- Demo-oriented UI copy/flows across `src/pages/*` and `src/components/demo/*`.
- Multiple backend endpoints intentionally return pending/unsupported states (501 or structured unsupported responses).

### What is the source of truth

- Authoritative business data must come from connected provider/POS systems through platform adapters.
- Canonical SmartCommerce data contracts are in `src/platform/contracts.ts`.
- Integration behavior should be driven by `PosAdapter` and `SmartCommercePlatformApi` interfaces.

### What should I touch

- Adapter/provider integration layers.
- Platform/backend orchestration and data normalization.
- UI-to-platform wiring to remove silent demo fallback in production paths.
- Tests and observability around production workflows.

### What should I not touch

- Do not hardwire the whole app to one provider schema.
- Do not bypass canonical contracts with raw provider fields in UI/app layers.
- Do not introduce fabricated inventory/pricing/availability/customer data in production flows.
- Do not add new orchestration layers unless proven necessary.

### What does “finished” mean

A workflow is finished when it is end-to-end against real provider data, normalized to canonical contracts, error-safe, tested, observable, and no longer silently dependent on demo fallback data.

---

## Core package contents

1. [Current architecture inventory](./handoff/01_ARCHITECTURE_INVENTORY.md)
2. [Product requirements document](./handoff/02_PRODUCT_REQUIREMENTS_DOCUMENT.md)
3. [Canonical architecture flow](./handoff/03_CANONICAL_ARCHITECTURE_FLOW.md)
4. [API/POS integration documentation](./handoff/04_API_POS_INTEGRATION_SPEC.md)
5. [Frontend UX/design requirements](./handoff/05_FRONTEND_UX_REQUIREMENTS.md)
6. [Feature-status matrix](./handoff/06_FEATURE_STATUS_MATRIX.md)
7. [Production-readiness checklist](./handoff/07_PRODUCTION_READINESS_CHECKLIST.md)
8. [Environment/setup instructions](./handoff/08_ENVIRONMENT_AND_SETUP.md)
9. [Prioritized roadmap + acceptance criteria](./handoff/09_ROADMAP_AND_ACCEPTANCE_CRITERIA.md)

## Existing architecture context

- Existing blueprint: [SMART_COMMERCE_PLATFORM_BLUEPRINT.md](./SMART_COMMERCE_PLATFORM_BLUEPRINT.md)
