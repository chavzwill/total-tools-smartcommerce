# SmartCommerce Delivery & Fulfilment Engine

## Purpose
SmartCommerce should give customers reliable fulfilment choices without turning checkout into a manual shipping desk. The engine separates small-parcel automation from large-item and rental logistics.

## Core policy
- Small parcels may be automatically priced only when every item has trusted parcel eligibility, weight and required dimensions.
- Customer courier charge = provider cost + 20% SmartCommerce operational markup.
- Provider cost, markup and customer charge must be stored separately for bookkeeping.
- Rentals always require manual delivery/collection review and pricing.
- Large, oversized, hazardous, fragile-freight or otherwise special-handling items always require manual review and pricing.
- Missing freight data never produces a guessed courier rate; it produces manual review.
- International parcels require a live provider quote before checkout.
- An estimate is never an authoritative order charge. Fulfilment must be bound to the checkout quote on the server before an order can be created.

## Initial provider strategy
### Automated domestic rate adapters
- TARA: published Jamaica courier rate structure.
- Knutsford Express Courier: published base/overweight structure, including dimensional weight rule.

### Configured but not automatically quoted yet
- Jamaica Post Zip Mail: retained as a reference configuration until Total Tools confirms a current business rate card.
- Doorway Express: provider quote required until an authoritative contracted/live rate source is available.
- DHL: international provider quote adapter.
- FedEx: international provider quote adapter.

## Markup rule
For every automated quote:

provider_cost_jmd = courier rate
operations_markup_rate = 0.20
operations_markup_jmd = provider_cost_jmd * 0.20
customer_delivery_charge_jmd = provider_cost_jmd + operations_markup_jmd

Do not collapse these fields into one number in accounting records.

## Authoritative product freight facts
The delivery API does not accept browser-supplied weight, dimensions or parcel eligibility as trusted facts. It receives product identity and quantity, fetches the product through the configured SmartCommerce commerce-provider adapter, then maps provider `attributes` / `metadata` into the delivery engine.

Recognized provider freight keys currently include aliases for:
- `parcelEligible`
- `shippingWeightLb` / `packageWeightLb` / `weightLb`
- `packageLengthIn` / `lengthIn`
- `packageWidthIn` / `widthIn`
- `packageHeightIn` / `heightIn`
- `oversized` / `freightOnly`
- `hazardous` / `hazmat` / `dangerousGoods`
- `fragileFreight` / `specialHandling`

If the connected catalogue/provider does not contain trustworthy values, SmartCommerce routes delivery to manual review.

## Parcel eligibility gate
Automatic courier pricing is allowed only when all of the following are true:
1. Item is a sale, not a rental.
2. Item is explicitly marked parcel-eligible by trusted product/provider data.
3. Weight is known and positive.
4. Required dimensions are available where dimensional-weight rules apply.
5. Item is not oversized, hazardous or flagged as fragile freight/special handling.

If any requirement fails, route the shipment to manual review.

## Rental logistics
Rental orders must be manually reviewed because logistics can include both delivery and collection, vehicle class, job-site access, scheduling and equipment handling. SmartCommerce must not treat rental transport as a normal parcel shipment.

## Large-item logistics
Large machines, generators, ladders, heavy tools, bulk electrical materials and similar freight are not priced through parcel courier tables. They enter manual logistics review where staff determine vehicle, route, delivery window, unloading requirements and final customer charge.

## Checkout behaviour
Checkout exposes:
- Pick up in store: zero-delivery path.
- Deliver my order: courier/manual-review path.

For delivery, the customer can capture a home, business or job-site destination with recipient, phone, street address, town/city, parish/region and optional delivery notes. Job-site requests may include a site name.

Courier choices shown before binding are estimates. When the customer selects `Verify & attach delivery`, SmartCommerce:
1. Re-reads the authenticated checkout quote.
2. Re-resolves freight facts from the connected commerce provider.
3. Re-runs the delivery engine.
4. Confirms the selected service still exists.
5. Records address, service, provider cost, 20% markup, customer charge, billable weight and source state in the quote snapshot.
6. Updates `delivery_minor` and `total_minor` on the server.

Pickup is also explicitly bound to the quote at J$0 delivery.

If the engine returns manual review, SmartCommerce stores the pending manual-review fulfilment state in the quote snapshot and records an auditable `delivery_manual_review_requested` event. Payment/order creation remains blocked until a final transport charge is approved and bound.

## Order integrity
Commercial-credit order creation now independently enforces the fulfilment gate. It rejects a request unless the checkout quote contains a server-bound `pickup` or `delivery` state. The browser cannot bypass this by enabling a button manually.

When a delivery order is created, fulfilment mode, delivery amount, provider/service and destination are carried into order metadata. The commercial ledger records the total authorised order value and delivery identifiers for reconciliation.

## Guest checkout status
Guest checkout can currently view provider-backed courier estimates, but authoritative guest delivery binding remains intentionally disabled until the guest-order/payment contract can revalidate and persist the same server evidence without relying on an authenticated customer quote.

## Sales agent module
Sales agents should know:
- Small parcels can receive automatic courier options when freight data is complete.
- Never promise an automated rate for large items or rentals.
- Manual-review orders remain valid sales opportunities; logistics staff must price delivery before final payment/confirmation.
- A courier's underlying cost is not the customer-facing charge; SmartCommerce applies the approved operational markup.
- A displayed courier estimate is not final until checkout shows that delivery has been verified and attached.

## Bookkeeping module
Bookkeepers should see separate values for:
- provider/courier cost
- 20% operational markup
- customer delivery charge
- provider/service
- order/reference
- settlement/payment status

This separation enables courier invoice reconciliation and delivery-margin reporting.

## Management module
Management should be able to review:
- delivery revenue
- courier cost
- delivery gross margin
- manual-review volume
- average delivery charge
- provider usage and service performance
- rate-table freshness

The 20% markup is a policy setting and may later become configurable; this first implementation keeps it fixed at 20% by decision.

## Developer module
Primary implementation:
- `src/server/deliveryFulfilmentEngine.ts`
- `src/server/deliveryProductFacts.ts`
- `src/services/deliveryClient.ts`
- `src/services/checkoutFulfilmentClient.ts`
- `api/delivery-quote.ts`
- `api/checkout-fulfilment.ts`
- `api/commercial-credit-checkout.ts`
- `src/pages/CheckoutPage.tsx`
- `src/styles/delivery-fulfilment.css`

Engineering rules:
- Provider rates belong in configuration/data structures, never scattered through checkout components.
- Do not trust client-editable weight/dimension values as authoritative checkout facts.
- Freight facts are resolved from the connected commerce provider at the server boundary.
- Rates with stale or unconfirmed sources must remain disabled for automatic checkout.
- Preserve explicit source status for every provider service.
- Manual review is a valid routing decision, not an error condition.
- Never create an order with an estimated delivery charge that has not been revalidated and persisted into the authoritative checkout quote.
- Every order-creation endpoint must enforce fulfilment binding server-side; UI guards are not security controls.

## Next implementation stages
1. Build the staff delivery/manual-review work queue and controlled final-pricing action.
2. Add saved customer addresses/job-site records.
3. Add authoritative route/zone intelligence so metro/rural/remote classification does not depend on customer selection.
4. Add courier collection-point/branch selection for branch-to-branch services.
5. Add provider APIs/contracts where available.
6. Add guest checkout fulfilment binding.
7. Add delivery status, dispatch and proof-of-delivery lifecycle.
