# Frontend UX / Design Requirements

## UX intent

Frontend should communicate trustworthy commerce outcomes from live provider-connected data while preserving speed, clarity, and recoverability.

## Requirements

1. **Truthful data states**
   - Distinguish live results, stale results, unavailable provider, and error states.
   - Do not present fabricated stock/price/availability as factual.

2. **Explicit fallback behavior**
   - Demo/fallback datasets must be gated and visibly non-production.
   - Production paths must fail safely, not silently degrade to fake data.

3. **Workflow continuity**
   - Product/rental/repair/commercial flows must preserve user context and selected branch.

4. **Error recovery UX**
   - Retry controls, support messaging, and clear next actions for integration failures.

5. **Performance and responsiveness**
   - Search and filter should remain responsive under live API latency.

6. **Accessibility and consistency**
   - Preserve consistent navigation, labels, and form states across workflows.

## Current UI reality (repo-derived)

- Rich page set and navigation are implemented.
- Several flows currently use demo-centric copy and submit-to-confirmation patterns.
- Production UX hardening is needed around live-data guarantees and failure semantics.
