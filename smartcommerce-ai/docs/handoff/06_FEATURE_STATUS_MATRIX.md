# Feature Status Matrix (Repository-Derived)

> **Historical baseline notice:** This matrix predates the September 2026 handoff consolidation and should not be used as the current readiness verdict. See `../HANDOFF_RELEASE_2026-09-27.md` and issue #42 for current status.

Status legend:

- **Yes**: clearly present
- **Partial**: present but incomplete/stubbed/fallback-dependent
- **No**: not meaningfully implemented

| Capability | UI | Architecture | Real provider wiring | Production ready | Notes |
|---|---|---|---|---|---|
| Products | Yes | Yes | Partial | No | Data provider + API contracts exist; fallback catalog remains active path. |
| Inventory | Yes | Yes | Partial | No | Branch/category/inventory authority routes exist on the active branch, but end-to-end authoritative branch stock is not yet fully verified. |
| Pricing | Yes | Yes | Partial | No | Pricing exists in canonical models; production-grade authoritative handling not verified end-to-end. |
| Rentals | Yes | Yes | Partial | No | Rental discovery/detail UX is advanced; live provider availability/reservation still needs production validation. |
| Rental machine verification | Partial | Yes | No/Partial | No | Canonical verification contracts now exist; provider-native machine/inspection/maintenance verification is not yet implemented end-to-end. |
| Rental customer eligibility | Partial | Yes | No/Partial | No | Eligibility contract now covers identity/account/deposit/certification/insurance/manual review; authoritative provider wiring is still required. |
| Rental schedule verification | Partial | Yes | Partial | No | Availability contract exists; reservation conflict/turnaround/transfer verification is not fully proven. |
| Repairs | Yes | Partial | Partial | No | Repair request/status surfaces exist; complete service lifecycle remains incomplete. |
| Customers | Partial | Yes | Partial | No | Customer contract and calls exist; full identity/account lifecycle is not complete. |
| Quotes (Commercial) | Partial | Yes | Partial | No | Commercial request path exists; production readiness/testing unresolved. |
| Orders | Partial | Yes | Partial | No | Order creation routes/contracts exist; full transaction hardening incomplete. |
| AI guidance | Yes | Yes | Partial | No | Assistant/provider work exists but recommendations are not yet comprehensively grounded in authoritative live data. |
| Provider adapter | No (N/A) | Yes | Partial | No | Canonical adapter boundary exists and includes capability flags; robust provider implementations still require proof. |
| Adaptive route discovery | No | Partial | No | No | Requirement is now documented; production semantic endpoint discovery is not yet implemented. |
| Semantic field mapping | No | Partial | No | No | Canonical mapping exists manually; automatic meaning-based field mapping/confidence scoring is not yet implemented. |
| Learned provider capability profile | No | Partial | No | No | Capability-profile requirement is documented; persisted validated learned mappings are not yet implemented. |
| Unsupported-capability closure | Partial | Yes | Partial | No | Unsupported adapter operations can be surfaced explicitly; UI/AI/planning must still be proven to respect capability closure consistently. |
| Multi-system composition (POS/CRM/SRM/ERP/etc.) | No | Partial | No | No | Architecture requirement now explicitly covers multiple business-system types; cross-provider fact composition is not yet implemented. |
| Data quality / trust / deduplication | No | Partial | No | No | Requirement exists conceptually; no mature production ingestion trust/merge/quarantine pipeline is verified in this repo. |
| Auth / authorization | Limited | Limited | Limited | No | No complete production authz/authn posture evident in current repo. |
| Tests | No/limited | — | — | No | No meaningful automated production workflow coverage detected. |

## Important verification note

Module existence does not imply production readiness. Verify callers, real data flow, provider authority, safety boundaries, and tests before marking complete.

Adaptive integration must not be considered complete until SmartCommerce demonstrates route-name-independent semantic mapping against materially different provider schemas and safely closes unsupported capabilities.

Rental reservations must not be considered confirmed until machine verification, schedule availability, and customer eligibility have all been resolved according to policy.
