# API / POS Integration Specification

## Integration objective

Implement provider adapters that map provider-specific APIs into SmartCommerce canonical contracts defined in `src/platform/contracts.ts` and adapter interface in `src/platform/posAdapter.ts`.

## Canonical adapter contract

Use `PosAdapter` methods as the integration surface, including:

- Health and capabilities
- Branches, categories, products
- Inventory availability
- Rental asset and reservation flows
- Repair request and status flows
- Customer, order, invoice flows
- Sync/webhook handling

## Current integration state (repo-derived)

- HTTP adapter and API client scaffolding exist (`src/apiClient.ts`).
- Backend routing exists (`src/backend/platformRestApi.ts`).
- Several operations still return pending/unsupported behavior and require full provider implementation.

## Provider mapping principles

1. Keep provider schemas isolated to adapter implementation.
2. Normalize to canonical models before crossing adapter boundary.
3. Preserve provenance/external refs for traceability.
4. Enforce explicit handling of unknown/missing provider fields.
5. Never fabricate transactional-critical values.

## Example mapping pattern

Provider fields (example):

- `products.stock_qty`
- `branch_inventory`
- `product_variations`
- `product_type`

Map to canonical models:

- `CommerceProduct`
- `InventoryAvailability`
- variant/attribute structures in canonical product model
- capability and purchasable/rentable semantics

## Integration acceptance baseline

- End-to-end product search from UI to real provider.
- Correct branch stock and price display.
- No silent fallback dataset for production search path.
- Structured error propagation on provider failure.
