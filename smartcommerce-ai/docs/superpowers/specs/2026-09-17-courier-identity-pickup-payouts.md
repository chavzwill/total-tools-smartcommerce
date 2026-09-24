# Courier identities, verified pickup and manual payouts

User-approved extension, 17 September 2026.

## Confirmed decisions

- Dedicated courier registration and login, distinct from the shopper flow.
- Courier businesses and individual drivers require staff verification of uploaded identity/business documents.
- Each driver belongs to an approved courier organization and receives their own pickup QR pass.
- Staff approve bank-transfer payouts and record the actual payment reference. No automatic transfer is implied.

## Identity and verification

Reuse reviewed password/session primitives where possible, but courier authentication must not grant customer, staff or another organization's authority. Business owners manage only their organization. Drivers access only their assigned work. Membership and invitations are durable and cannot be self-assigned by supplying an organization ID.

Private document upload must enforce file signatures, a bounded size, allowed formats, authenticated ownership, encryption at rest, private retrieval and audit evidence. Documents must never be public URLs or part of public courier profiles. Review records identify the exact document version reviewed. Replacing approved evidence invalidates its verification until reviewed again. Rejection requires a reason. Required document types and retention periods are configuration, not invented legal requirements.

Separate identity verification states (unsubmitted, pending, verified, rejected, revoked) from application approval and driver membership. Application approval and pickup eligibility must check current verification server-side.

## Driver pickup pass

A QR is a revocable, opaque, expiring credential representing a driver, with no identity document, bank detail or customer address encoded. Store only a hash of the credential. Staff scan while authenticated with pickup permission; a scan opens the actual assigned pickup order at their authorized branch: order number, item names/SKUs and quantities, delivery destination and pickup status. Show a list when several orders are assigned. The QR is a lookup reference, never a frozen copy of order details.

Scanning alone does not release goods. Staff select the actual assigned shipment/items and explicitly confirm handover. Recheck driver verification, organization approval, pass validity, branch, shipment assignment and expected version in the handover transaction. Duplicate confirmations replay the original receipt; revoked, expired, foreign-branch and already-collected requests cannot create another pickup. Keep an audit trail with staff actor, driver, shipment, branch and time.

Issuing a new pass revokes the previous one. Suspension, driver removal or verification revocation immediately prevents pickup. QR issuance and scan recognition can ship ahead of dispatch, but physical handover remains disabled until authoritative shipment and branch assignments exist. No fabricated orders or POS calls.

## Courier earnings and bank-transfer payouts

Bank details are private, access-controlled and masked by default. Changes require an authenticated owner and staff verification before use. Preserve a snapshot/version of the approved destination on each payout.

Delivery earnings are distinct from customer payments and are created only from authoritative paid bookings and completed, accepted delivery evidence. Disputes, refunds, adjustments and deductions remain explicit ledger entries. Never calculate payable earnings from a browser-supplied delivery fee or mark an order paid from a redirect.

Payout lifecycle: pending review → approved → transfer pending → paid; rejected/cancelled before transfer and needs review for ambiguous outcomes. Approval does not move money. Staff record the actual bank-transfer reference, currency, amount and time. Duplicate payout submissions and duplicate bank references must not pay or mark the same earnings twice. Failed/uncertain transfer reporting preserves the reservation until reconciled.

Until booking, payment and delivery integrations exist, show no invented balance and permit no payout against unsupported earnings. Expose readiness honestly.

## Verification requirements

Test owner/driver/staff isolation, document access and validation, evidence replacement, review permissions, invite replay, pass expiry/revocation, unverified driver denial, wrong-branch pickup, concurrent/duplicate handover, payout arithmetic and duplicate references. Test local workflows before deployment; POS synchronization stays paused.
