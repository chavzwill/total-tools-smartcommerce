# Total Tools POS + Repairs Modernization

Branch: `feature/pos-modernization-guided-mode`

## Product direction

The employee POS, repair/service operations, rentals, inventory, purchasing, CRM and SmartCommerce storefront must operate as one Total Tools system with a shared data model and a single brand language. The employee workspace uses the same SmartCommerce design tokens, typography, green/yellow brand system, spacing, geometry and accessibility standards. It must not become a separate visual product.

## Non-negotiable architecture

- No mock operational data in production surfaces.
- SmartCommerce consumes POS data through explicit versioned API contracts, never DOM scraping or direct table coupling.
- Protected employee and operational data remain behind trusted server authorization and role-based access.
- Customer-facing repair updates expose only customer-safe fields.
- Every money, stock, permission and repair-status mutation must be auditable.
- Long-running work such as sync, notifications and scheduled checks must move to durable jobs/workers rather than browser timers or web-process `setInterval` loops.
- Existing working commerce, rental, repair and account behavior must be preserved while the new operations layer is introduced incrementally.

## Workstreams

### 1. Operations UI foundation

- Total Tools-branded employee shell.
- Responsive desktop/tablet/mobile layouts.
- POS, Repairs, Technicians, Inventory, Purchasing, Quotes and Reports workspaces.
- Guided Mode available globally and extended per operational workflow.
- Keyboard and screen-reader support.
- Connection-aware empty/error states instead of fake data.

### 2. Service advisor / customer service workspace

- Customer lookup and creation.
- Equipment intake and ownership history.
- Make/model/serial and warranty state.
- Customer complaint and intake condition.
- Photo/video/document attachments.
- Diagnostic fee, deposit and approval workflow.
- Estimate and change-order approvals.
- Promised completion and pickup workflow.
- Customer communication timeline.

### 3. Technician workspace

- Assigned work queue.
- Skill-aware assignment.
- Diagnostic notes and structured findings.
- Task-level timers and pause/resume.
- Billable vs actual labor tracking.
- Parts request, consumption and returns.
- QC and sign-off.
- Rework and warranty classification.
- Mobile/tablet-first technician experience.

### 4. Technician compensation and performance

- Hourly rate inputs.
- Productive, billable, diagnostic, rework, warranty and training time classification.
- Utilization and efficiency.
- First-time-fix rate and rework rate.
- Quality score and quota attainment.
- Incentive rules with manager approval and audit trail.
- Compensation calculations exported to payroll/accounting rather than silently posting payroll.

### 5. Inventory, parts and purchasing

- Branch availability and reservation.
- Work-order part reservation.
- Branch sourcing and transfers.
- Purchase requests and purchase orders.
- Supplier management.
- Backorders and expected-arrival information.
- Customer-supplied parts.
- Consumed, returned and unused part reconciliation.

### 6. POS and financial controls

- Sales, refunds, repair deposits, repair balances and rental payments.
- Cash drawer sessions and variance handling.
- Quotations and invoices.
- Discount/override permissions.
- Idempotent payment and stock mutations.
- Tax and branch settlement controls.

### 7. Customer repair portal

- Repair status timeline.
- Estimate and change-order approvals.
- Customer-safe technician updates.
- Attachments approved for customer viewing.
- Invoice/receipt access.
- Pickup readiness and instructions.
- Equipment/service history.

### 8. CRM and equipment ownership

- Customer-to-equipment relationship.
- Service history by serial number.
- Warranty history.
- Prior faults and repair outcomes.
- Rental and sales context where appropriate.
- Communication timeline.

### 9. Security and audit

- Dedicated staff authentication and sessions.
- Granular RBAC for refunds, overrides, stock, labor rates, technician compensation, reopening jobs and approvals.
- Immutable audit events for sensitive mutations.
- Session revocation and optional MFA/passkeys for privileged roles.
- Rate limiting, validation and structured error handling.

### 10. SmartCommerce API exports

Canonical operations contracts are defined in `src/platform/posOperationsContracts.ts`.

The protected manifest endpoint is `GET /api/pos-export-manifest` and requires `Authorization: Bearer <SMARTCOMMERCE_PLATFORM_INTERNAL_TOKEN>`.

The contract registry in `src/platform/posExportRegistry.ts` distinguishes currently available, partial and contract-only resources. Contract-only resources must not be advertised as live until their handlers and provider adapter methods exist.

Target resources:

- branches
- categories
- products
- inventory
- customers
- orders
- invoices
- rentals
- work orders
- technicians
- technician skills
- technician schedule
- technician performance
- suppliers
- purchase requests
- purchase orders
- branch transfers
- quotations
- transactions
- cash drawers
- audit events

### 11. Sync model

Each resource should support the strongest safe mode available:

- snapshot for full reads
- incremental with cursor or `updated_since`
- realtime through signed/idempotent webhook events

Writes remain separate from exports and require explicit capabilities and authorization.

## Implementation order

1. API contracts and truthful capability manifest.
2. Staff identity/RBAC boundary.
3. Operations shell and repair/service-advisor workspace.
4. Work-order API and customer-safe repair projection.
5. Technician workspace, skills, scheduling and task timing.
6. Parts reservation, sourcing, transfers and purchasing.
7. Estimates, approvals, payments and cash controls.
8. Technician performance/compensation projections.
9. Customer repair portal and notifications.
10. Full export coverage, webhooks and incremental sync.
11. Observability, load testing, offline/degraded workflows and production acceptance.

## Current branch status

Implemented foundations:

- separate modernization branch
- global Guided Mode engine
- guided repair-intake walkthrough
- Total Tools operations workspace shell and responsive styling
- canonical POS operations contracts
- POS export contract registry
- protected POS export manifest endpoint

The remaining operational endpoints are intentionally classified as contract-only until their handlers and data adapters are implemented and tested.
