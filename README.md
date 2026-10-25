# Total Tools SmartCommerce

SmartCommerce is the customer-facing commerce layer for Total Tools. The canonical production code is in `smartcommerce-ai/` and the authoritative handoff checkpoint is the current `main` branch.

## Handoff status

The September 2026 handoff release has been consolidated into `main`. Start with:

- `smartcommerce-ai/docs/HANDOFF_RELEASE_2026-09-27.md` — release scope, certification and remaining environment-dependent acceptance.
- GitHub issue `#42` — final handoff acceptance checklist.
- `smartcommerce-ai/docs/POS_COMMERCE_SYNC_ARCHITECTURE.md` — POS synchronization design.
- `smartcommerce-ai/docs/POS_ORDER_DELIVERY.md` — retry-safe POS order delivery.
- `smartcommerce-ai/docs/POS_APPROVAL_AUTHORITY.md` — staff authority boundary.
- `smartcommerce-ai/docs/POS_INTEGRATION_AND_APPROVAL_DASHBOARD_SETUP.md` — receiving-team runbook for POS endpoints, credentials, synchronization, approval dashboards, decision return flow, rollout and acceptance tests. **John/receiving AI should start here for POS setup.**

Historical feature branches and old PRs are not the source of truth.

## Local verification

```bash
cd smartcommerce-ai
npm ci
npm run build
```

The build command runs the consolidated release gate before TypeScript and Vite production compilation.

## Environment-dependent verification

The database-backed suites intentionally require disposable PostgreSQL databases:

```bash
npm run test:couriers-database
npm run test:pos-order-database
```

Configure only isolated test URLs. Do not point these suites at production databases.

## Ownership and secrets

Production credentials, payment secrets, POS credentials and database secrets must remain outside Git. Before organizational turnover is complete, move repository ownership, deployment access, secrets, monitoring and database ownership to the approved company-controlled accounts.

## Development rule

Use `main` as the accepted baseline. New work should be introduced through focused branches and reviewed changes; do not revive historical feature branches as alternate canonical lines.

## Optional TT AI shared intelligence (SmartCommerce backend)

SmartCommerce's existing POS-grounded assistant remains authoritative for catalog retrieval, branch availability, customer pricing, checkout and account access. An **optional backend-only** TT AI bridge can add `data.ttAiAdvisory` to existing assistant responses when grounded public catalog products exist. It is read-only and never certifies compatibility or price. If TT AI is unconfigured or unavailable, the existing assistant continues unchanged.

The service uses a dedicated 45-second Ed25519 v3 assertion (issuer `total-tools-smartcommerce`, purpose `catalog_assist`, tenant-bound). It forwards only the names and identifiers of already-grounded public products, **not** raw customer messages, customer identifiers, addresses, payment details, stock or supplier costs.

Backend-only variables: `SMARTCOMMERCE_TT_AI_URL` (approved secure TT AI endpoint), `SMARTCOMMERCE_TT_AI_SIGNING_PRIVATE_KEY` (private PEM never exposed to the browser), `SMARTCOMMERCE_TT_AI_TENANT_ID` (registered tenant). Register the matching public key in TT AI per `docs/MULTI_PLATFORM_AI_HUB.md` in `chavzwill/total-tools-ai` PR #46.

**Not live:** TT AI currently binds to loopback, so Vercel cannot reach it without separately approved secure inter-service transport. No credentials, model, infrastructure or deployment were configured. No customer UI is enabled to consume the optional response yet.

Run `npm run test:tt-ai-service-client`, `npx tsc --noEmit -p tsconfig.json`, and the complete release gate before merging.
