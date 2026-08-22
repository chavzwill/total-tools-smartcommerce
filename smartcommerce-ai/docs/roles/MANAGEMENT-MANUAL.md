# Management Manual

## Purpose

Management should be able to understand payment performance, risk, costs, customer choice, and operational exceptions without needing to operate provider dashboards daily.

## Management principles

1. Customer payment choice must not create uncontrolled settlement complexity.
2. Every enabled payment method must have a documented settlement destination.
3. Every provider must support verifiable server-side payment status before SmartCommerce can mark an order paid.
4. No provider goes live without finance/bookkeeping sign-off on reconciliation and fees.
5. No provider goes live without developer sign-off on webhook verification, idempotency, refunds, security, and failure handling.

## Preferred financial architecture

- One primary online card/acquirer rail for cards and compatible express wallets.
- Accounts receivable for Credit Account purchases.
- POS/offline rail for Pay in Store / pickup.
- At most one optional secondary wallet/payment provider unless there is a clear commercial reason for more.

## Provider approval checklist

Management should review:
- supported currencies;
- settlement bank accounts;
- settlement frequency/timing;
- transaction fees;
- refund fees;
- chargeback fees;
- reserves/holds;
- contract term and exit conditions;
- supported wallets and card networks;
- 3-D Secure/security capabilities;
- reporting and settlement batch quality;
- API/webhook maturity;
- support/SLA/escalation path;
- fraud controls;
- customer demand;
- accounting workload created by the provider.

## Management dashboard requirements

SmartCommerce should eventually expose:
- gross sales by channel/payment method;
- collected vs credit-account value;
- processor fees and effective fee rate;
- approval/decline rates;
- refund rate;
- dispute/chargeback rate;
- settlement timing;
- unreconciled amount;
- number/value of payment exceptions;
- provider uptime/incident impact;
- payment-method adoption;
- checkout conversion by payment method.

## Approval controls

Management should define thresholds for:
- refunds requiring supervisor approval;
- partial refunds;
- manual payment adjustments;
- credit-limit overrides;
- write-offs;
- reconciliation adjustments;
- provider configuration changes.

## Risk rule

No staff member should have unrestricted ability to both create/alter a financial transaction and independently reconcile/approve that same transaction without appropriate segregation of duties.

## Expansion rule

Before adding a new payment logo to checkout, management must answer:

1. What customer problem does it solve?
2. How many customers are likely to use it?
3. Where does the money settle?
4. What does it cost?
5. How does it reconcile?
6. What happens on refund/dispute?
7. Who owns operational support?

If those answers are weak, do not add the payment method merely for visual variety.
