# Sales Agent Manual

## Purpose

Give sales and customer-service staff a simple operational understanding of SmartCommerce payment choices without requiring them to understand processor internals.

## What sales agents should know

### Payment choices customers may see
- Express wallets such as Apple Pay or Google Pay when eligible.
- Click to Pay when supported by the selected processor.
- Debit/credit card.
- Approved Credit Account.
- Pay in Store / Pay on Pickup.
- PayPal only if enabled for the business.

The exact options displayed can vary by device, customer eligibility, merchant configuration, and provider availability.

### Never promise a payment option just because the customer owns a certain phone
Wallet availability depends on the issuing bank/card, browser/device, region, and the merchant's payment processor.

### What counts as paid
Only the SmartCommerce order/payment status should be treated as authoritative. A customer's screenshot, browser confirmation, email screenshot, or claim that money left their account is not enough to manually mark an order paid.

### Payment status meanings
- `Awaiting payment` — no verified payment yet.
- `Authorized` — provider has authorized funds but final payment/fulfillment rules may still apply.
- `Paid` — SmartCommerce has verified the payment through the provider.
- `Payment failed` — provider did not complete the transaction.
- `Refund pending` — refund requested but not yet confirmed.
- `Refunded` — provider confirmed refund.
- `Needs review` — mismatch or exception requires finance/authorized staff.

### Credit Account checkout
Only approved accounts may use Credit Account checkout. Do not override credit eligibility, limits, holds, aging rules, or approval requirements manually unless your role explicitly allows it.

### Pay in Store / Pickup
This reserves/creates the order but does not mean the order is paid. The in-store POS/payment workflow must complete before the order becomes paid unless an authorized business rule says otherwise.

## What agents should do when something looks wrong

Do not retry charges repeatedly or create duplicate payments. Confirm the order number and payment status in SmartCommerce, then escalate the exception using the payment reference shown by the system.

Common escalation cases:
- customer says they paid but order is still awaiting payment;
- amount shown to customer differs from order total;
- duplicate charge allegation;
- refund complaint;
- credit account declined/held;
- payment marked `Needs review`.

## What agents should never do

- Never ask a customer to send full card details, CVV, or online-banking credentials.
- Never type a customer's card details into notes/chat fields.
- Never manually change an order to paid based on a screenshot.
- Never promise a refund completion date unless SmartCommerce/provider status supports it.
- Never bypass an account hold or credit limit without authorized approval.

## Customer explanation

A useful explanation is: SmartCommerce lets customers choose an eligible payment method, but the payment itself is processed by the approved financial provider. SmartCommerce receives secure confirmation and updates the order automatically.
