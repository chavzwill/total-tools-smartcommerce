# Current Architecture Inventory

## Repository scope

- App root: `/home/runner/work/total-tools-smartcommerce/total-tools-smartcommerce/smartcommerce-ai`
- Stack: React + TypeScript + Vite
- Core scripts: `dev`, `build`, `preview` (from `package.json`)

## Major modules and boundaries

### 1. Frontend experience layer (`src/pages`, `src/components`, `src/styles`)

- Customer pages and navigation shell are implemented (`src/App.tsx`, `src/pages/*`).
- Includes commerce, rentals, repairs, commercial, AI-assistant, cart/account pages.
- Contains demo-oriented components (`src/components/demo/*`) and UX copy patterns.

### 2. Application data providers (`src/data`)

- `products.ts`: product/category provider with platform refresh/sync + fallback dataset.
- `rentals.ts`: rental provider with platform refresh/sync + fallback dataset.
- `repairs.ts`: repair provider with platform refresh/sync + fallback dataset.

### 3. Platform canonical model (`src/platform`)

- `contracts.ts`: canonical domain contracts (products, inventory, rentals, repairs, customers, orders, invoices, etc.).
- `posAdapter.ts`: provider/POS adapter contract and capability model.
- `platformApi.ts`: service wrapper enforcing canonical contract use.

### 4. Platform client + connector layers

- `src/apiClient.ts`: HTTP client, adapter implementation, sync client, API factory helpers.
- `src/services/pos/posTypes.ts`: higher-level POS connector facade and mapping helpers.

### 5. Backend orchestration scaffolding (`src/backend`)

- `platformRestApi.ts`: REST route handler and endpoint wiring.
- `platformBackendService.ts`: orchestration methods and adapter delegation.
- `platformBackendTypes.ts`: backend service/runtime contracts.

## Evidence of partial/incomplete areas

- Endpoint stubs/pending behavior in backend (e.g., mutation endpoints returning pending 501 paths).
- Unsupported operations returned by POS connector facade.
- Data providers keep fallback datasets when context/provider data is unavailable.

## Architecture health observations

- Positive: clear separation exists between frontend, platform contracts, adapter contracts, and service routing.
- Risk: current runtime behavior can still resolve into demo data paths rather than strict live-data failure handling.
- Risk: multiple generated `.js/.d.ts` artifacts inside `src` increase duplicate-path maintenance overhead.
