# API / Business-System Integration Specification

## Integration objective

Implement adaptive provider integrations that map provider-specific APIs into SmartCommerce canonical contracts defined in `src/platform/contracts.ts` and the adapter interface in `src/platform/posAdapter.ts`.

SmartCommerce is not POS-only. The same integration model must support POS, CRM, SRM, ERP, WMS, rental, repair/service, accounting, ecommerce, delivery/logistics, and other business systems when they expose useful capabilities.

## Canonical adapter contract

Use `PosAdapter` as the current canonical business-system adapter surface, including:

- Health and capabilities
- Branches, categories, products
- Inventory and pricing
- Customer/account context
- Rental asset, verification, availability, and reservation flows
- Repair request and status flows
- Customer, order, invoice flows
- Commercial quote flows
- Sync/webhook handling

The interface name is historical; provider capability must not be restricted to traditional POS systems.

## Adaptive integration intelligence

The adapter must be smart and adaptable. It must not require a provider to use predetermined SmartCommerce endpoint names or field names.

### Route-name independence

Route names are only one discovery signal. For example, `/products`, `/items`, `/catalog`, `/stock-items`, or `/merchandise` may all map to `products.search` / `products.read` if the request and response semantics support that conclusion.

Similarly, `/customers`, `/clients`, `/accounts`, `/contacts`, or `/buyers` may all represent customer/account capabilities.

A route name mismatch must not, by itself, prevent valid data transfer.

### Discovery signals

Capability inference should combine:

- route/path name
- HTTP method
- operation/documentation metadata
- request/query parameters
- request schema
- response schema
- sample records
- field names and values
- identifier relationships
- provider documentation/OpenAPI metadata where available
- previously validated provider mappings

### Semantic field mapping

Provider field names must be mapped by meaning rather than exact spelling. Example:

Provider fields:

- `item_code`
- `descr`
- `qty_free`
- `sell_amt`
- `site`

may map to canonical concepts such as:

- product external ID / SKU
- product name
- available quantity
- selling price
- branch/location

Mappings must include confidence/provenance sufficient for debugging and review.

### Learned provider profile

Once a provider route and field mapping has been validated, SmartCommerce should persist a provider capability profile and reuse it instead of rediscovering the provider for every request.

The profile should represent each canonical capability as one of:

- available
- conditional
- unsupported
- unverified
- disabled

### Capability closure

If a provider does not expose a capability, SmartCommerce must close that capability at the service boundary. The UI, AI, planner, and workflow layer must not pretend the capability exists.

For example, if a provider exposes products, inventory, customers, orders, and rentals but not repairs or delivery, SmartCommerce must make repairs/delivery unavailable for that provider or route them through a separate connected system/manual workflow.

### Read versus write safety

Adaptive discovery is allowed to be more automatic for read-only capabilities.

Transactional writes require stricter validation. SmartCommerce must not experimentally invoke uncertain write routes.

Examples requiring high-confidence verification before activation include:

- order creation
- inventory adjustment
- refunds
- invoice creation
- customer credit changes
- rental reservation confirmation
- cancellation
- pricing mutation

## Current integration state (repo-derived)

- Canonical contracts and adapter interface exist.
- HTTP adapter and API client scaffolding exist (`src/apiClient.ts`).
- Backend routing exists (`src/backend/platformRestApi.ts`).
- Branch/category/inventory authority routes have been added on the active development branch.
- The adapter contract now includes optional rental verification capability and adaptive capability flags.
- A production-grade semantic discovery/mapping engine and persisted learned-provider profile are not yet implemented.
- Several end-to-end provider operations still require validation against the real authoritative systems.

## Provider mapping principles

1. Keep provider schemas isolated to adapter implementation.
2. Normalize to canonical models before crossing adapter boundary.
3. Preserve provenance/external refs for traceability.
4. Enforce explicit handling of unknown/missing provider fields.
5. Never fabricate transaction-critical values.
6. Route names are hints, not requirements.
7. Infer capability from semantics and validate the inference.
8. Persist validated mappings for reuse.
9. Close unsupported capabilities explicitly.
10. Require stronger verification for writes than reads.

## Rental verification baseline

Before a rental is represented as confirmed, integration must support or compose evidence for:

- machine identity and rentable/maintenance/inspection state
- requested-date availability and schedule conflicts
- branch/logistics constraints
- customer identity/account eligibility
- deposit, certification, insurance, or manual-review requirements where applicable

Provider-native verification may be used when available. If the necessary facts live in multiple systems, SmartCommerce may compose them across connected providers, but each fact must retain authoritative provenance.

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
- Route-name-independent semantic mapping demonstrated against at least one alternate provider schema.
- Unsupported capabilities are closed and cannot be planned/executed accidentally.
- Transactional writes are explicitly verified before activation.
- Rental confirmation cannot bypass machine, schedule, and customer-eligibility verification.
