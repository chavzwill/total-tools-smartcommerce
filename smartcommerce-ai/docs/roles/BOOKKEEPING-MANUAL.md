# Bookkeeping Manual

## Purpose

SmartCommerce should make bookkeeping exception-based: routine transactions reconcile automatically; bookkeepers investigate only mismatches, missing settlements, refunds, disputes, and unusual items.

## Key distinction

`Paid` and `Settled` are different.

- **Paid** means SmartCommerce verified that the payment provider completed the customer transaction.
- **Settled** means the processor's net funds have reached the expected business bank/settlement account and have been matched.

A transaction can legitimately be Paid while Settlement is Pending.

## Financial records bookkeepers need

For each payment SmartCommerce should expose:
- order/invoice number;
- customer where applicable;
- gross amount;
- currency;
- payment method;
- processor/acquirer;
- provider transaction/reference ID;
- payment date/time;
- processing fee;
- refund/adjustment amount;
- expected net settlement;
- settlement batch/reference;
- expected settlement date;
- actual settlement date;
- reconciliation status;
- exception reason when applicable.

## Preferred settlement structure

Keep settlement rails minimal:

1. Primary online acquirer: cards plus supported express wallets.
2. Accounts receivable: Credit Account purchases.
3. POS/offline: Pay in Store / pickup.
4. Optional additional wallet: only when management approves the extra reconciliation burden.

Apple Pay or Google Pay should not create separate bookkeeping processes when they settle through the same card acquirer.

## Daily workflow

1. Review the SmartCommerce settlement summary.
2. Confirm expected settlement batches against bank deposits/imported bank data.
3. Review only items marked `Needs review`, `Mismatch`, `Missing settlement`, `Refund mismatch`, or `Disputed`.
4. Resolve or annotate exceptions with an audit note.
5. Confirm completed refunds and their settlement impact.
6. Export/post the accounting journal or settlement report according to the connected accounting/POS system.

## Reconciliation formula

For each settlement grouping:

`gross customer payments - processor fees - refunds - adjustments = expected net settlement`

The settlement batch should then match the bank deposit or provider payout record.

## Common exceptions

### Missing settlement
Payment is verified as Paid, but no matching provider payout/bank deposit exists after the expected settlement window.

### Amount mismatch
Provider or bank settlement differs from SmartCommerce's expected net amount.

### Currency mismatch
Never reconcile JMD and USD merely because their numeric values resemble each other. Currency is part of the transaction identity.

### Duplicate transaction
Two provider transactions appear connected to one intended payment/order. Do not automatically net them without investigation.

### Unmatched payment
Provider shows a payment that cannot be matched to a SmartCommerce order/invoice/reference.

### Refund mismatch
SmartCommerce recorded a refund request but the provider did not confirm it, or provider settlement shows a refund not represented internally.

### Chargeback/dispute
Keep the original sale, dispute amount, dispute fee, evidence status, outcome, and settlement adjustment separately auditable.

## Credit Account bookkeeping

Credit Account checkout is not a card settlement. It creates/updates accounts receivable according to the approved customer account, credit limit, terms, holds, and invoice rules. Do not treat a credit-account order as cash collected.

## Pay in Store

An online order selecting Pay in Store remains unpaid until the store POS/payment workflow confirms collection. The eventual payment should be tied back to the original SmartCommerce order/reference.

## Refund controls

Bookkeeping should be able to see who requested/approved a refund, the reason, amount, provider refund ID, original transaction, status, and settlement impact. Failed refund attempts must remain visible rather than disappearing.

## End-of-day view

SmartCommerce should eventually present:
- total sales;
- collected online;
- credit-account sales;
- pay-in-store pending/collected;
- refunds;
- processor fees;
- expected net settlements;
- settlements received;
- unreconciled value;
- number and value of exceptions.
