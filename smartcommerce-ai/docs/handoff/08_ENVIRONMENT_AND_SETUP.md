# Environment and Setup Instructions

## Repository path

`/home/runner/work/total-tools-smartcommerce/total-tools-smartcommerce/smartcommerce-ai`

## Requirements

- Node.js (current LTS recommended)
- npm

## Install

```bash
cd /home/runner/work/total-tools-smartcommerce/total-tools-smartcommerce/smartcommerce-ai
npm ci
```

## Run

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Current known build issue

Repository currently has TypeScript project-reference/config mismatch (`TS6307`) involving `tsconfig.node.json` and imported `src` files from `vite.config.ts`/backend-platform modules. Resolve this before treating build as green.

## Integration environment variables

Used by data provider setup and API context:

- `VITE_SMARTCOMMERCE_API_URL`
- `VITE_SMARTCOMMERCE_BUSINESS_ID`
- `VITE_SMARTCOMMERCE_PROVIDER_ID`

Backend/dev middleware context also checks:

- `SMARTCOMMERCE_BUSINESS_ACCOUNT_ID`
- `SMARTCOMMERCE_PROVIDER_ID`

## First-hour verification routine

1. Install dependencies (`npm ci`).
2. Run build and note current failures.
3. Inspect `src/platform/contracts.ts` and `src/platform/posAdapter.ts`.
4. Trace one live workflow: page → data provider → api client → backend route/service → adapter method.
5. Identify whether behavior is live or fallback/demo for that workflow.
