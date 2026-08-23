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
- Unknown or unverified delivery zones never receive a guessed courier rate; they produce manual review.
- International parcels require a live provider quote before checkout.
- An estimate is never an authoritative order charge. Fulfilment must be bound to the checkout quote on the server before an order can be created.

## Initial provider strategy
### Automated domestic rate adapters
- TARA: published Jamaica courier rate structure and published REG/RUR/REM destination classifications.
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
6. The destination has an authoritative delivery-zone resolution.
7. Same-day, when requested, is an explicitly provider-supported origin/destination route.

If any requirement fails, route the shipment to manual review.

## Jamaica destination-zone intelligence
Customers do not choose whether they are `metro`, `regular`, `rural` or `remote`. Those classes affect money and therefore are server decisions.

SmartCommerce resolves Jamaican destinations from town/city + parish against authoritative courier-area data. The current resolver uses TARA's published `REG`, `RUR` and `REM` location classifications as its first provider source:
- `REG` maps to normal door-to-door pricing unless the shipment is genuinely within the same configured city/town.
- `RUR` maps to rural pricing.
- `REM` maps to remote pricing.
- A town that is not yet represented by an authoritative provider classification is `unresolved` and goes to manual logistics review.

The resolver is intentionally conservative. Do not infer a town's class from parish alone and do not silently map an unknown location to `regular`.

### Round Town / Metropolitan rule
TARA's Round Town / Metropolitan rate applies only when pickup and delivery are within the same city/town. A destination being in Kingston does not by itself qualify for the Round Town price.

SmartCommerce therefore requires its actual ecommerce dispatch origin to be configured before it can emit a Round Town quote:
- `SMARTCOMMERCE_FULFILMENT_ORIGIN_TOWN`
- `SMARTCOMMERCE_FULFILMENT_ORIGIN_PARISH`

Until the real dispatch origin is configured, a `REG` destination is treated as regular rather than Round Town. This deliberately favors avoiding an undercharge.

### Same-day route rule
Same-day is not a generic speed upgrade. It is offered automatically only when the configured origin and destination match a provider-published same-day route. Otherwise the request becomes manual review rather than silently using the same-day tariff.

## Saved delivery destinations
Signed-in customers can save reusable Home, Business and Job-site destinations. Saved records include:
- label
- address type
- optional job-site name
- recipient and phone
- street address
- town/city and parish
- optional postal code and access/delivery notes
- default-address flag
- latest zone status/class/source

Saved addresses are convenience data, not frozen pricing evidence. Their delivery zone is resolved again when checkout quotes and binds fulfilment, because provider coverage/rules may change.

Customers may select a saved destination in checkout, mark one as default, remove old destinations, or save the current delivery form with a useful label such as `Home`, `Office`, or a project/site name.

## Rental logistics
Rental orders must be manually reviewed because logistics can include both delivery and collection, vehicle class, job-site access, scheduling and equipment handling. SmartCommerce must not treat rental transport as a normal parcel shipment.

## Large-item logistics
Large machines, generators, ladders, heavy tools, bulk electrical materials and similar freight are not priced through parcel courier tables. They enter manual logistics review where staff determine vehicle, route, delivery window, unloading requirements and final customer charge.

## Checkout behaviour
Checkout exposes:
- Pick up in store: zero-delivery path.
- Deliver my order: courier/manual-review path.

For delivery, the customer can capture or select a saved home, business or job-site destination with recipient, phone, street address, town/city, parish and optional delivery notes. Job-site requests may include a site name.

After town/city and parish are present, SmartCommerce resolves the courier area on the server and shows the result to the customer. There is no customer-editable metro/rural/remote selector.

Courier choices shown before binding are estimates. When the customer selects `Verify & attach delivery`, SmartCommerce:
1. Re-reads the authenticated checkout quote.
2. Re-resolves the destination zone from the submitted address.
3. Re-resolves freight facts from the connected commerce provider.
4. Re-runs the delivery engine.
5. Confirms the selected service still exists and remains valid for that zone/speed.
6. Records address, resolved zone, service, provider cost, 20% markup, customer charge, billable weight and source state in the quote snapshot.
7. Updates `delivery_minor` and `total_minor` on the server.

Pickup is also explicitly bound to the quote at J$0 delivery.

If the engine or zone resolver returns manual review, SmartCommerce stores the pending manual-review fulfilment state in the quote snapshot, creates a durable logistics review record, and records an auditable `delivery_manual_review_requested` event. Payment/order creation remains blocked until a final transport charge is approved and then rebound to a fresh merchandise quote.

A manual-review shipment no longer requires a fake courier selection. Once the destination is complete, the customer can use `Send for logistics review` directly.

## Manual logistics review queue
Manual delivery cases are persisted separately from the short-lived checkout quote. This is intentional: a staff logistics review may take longer than the merchandise quote should remain valid.

The internal workspace is available at `/operations/delivery-reviews` and requires a signed POS-backed SmartCommerce staff session. Customer sessions cannot enumerate or price delivery reviews.

Authorized staff can record:
- transport provider / internal fleet source
- vehicle or handling class
- provider/operating cost
- customer delivery charge
- proposed delivery date/time
- access, unloading, collection or special-handling notes

The queue stores provider/operating cost, internal margin and customer charge separately. The 20% automatic parcel markup does not automatically control manually reviewed heavy/rental logistics; staff must price the real operational requirement and management policy applies.

A review marked `priced` is not automatically payable. Merchandise pricing and availability must still be freshly revalidated before the reviewed transport charge can be attached to a payable order total.

## Reviewed-delivery reattachment
When a customer returns after staff have priced a manual logistics review, SmartCommerce first creates a fresh provider-verified merchandise quote. It only offers the reviewed transport charge when all of the following still match:
- same authenticated customer
- same products
- same quantities
- same order currency

The reviewed delivery is then explicitly attached to the fresh quote, updates its authoritative `delivery_minor` / `total_minor`, and passes through the same checkout fulfilment gate as an automated courier quote. A changed cart does not inherit the old transport price.

## Order integrity
Commercial-credit order creation independently enforces the fulfilment gate. It rejects a request unless the checkout quote contains a server-bound `pickup` or `delivery` state. The browser cannot bypass this by enabling a button manually.

When a delivery order is created, fulfilment mode, delivery amount, provider/service and destination are carried into order metadata. The commercial ledger records the total authorised order value and delivery identifiers for reconciliation.

## Guest checkout status
Guest checkout can currently view provider-backed, destination-aware courier estimates, but authoritative guest delivery binding remains intentionally disabled until the guest-order/payment contract can revalidate and persist the same server evidence without relying on an authenticated customer quote.

## Sales agent module
Sales agents should know:
- Small parcels can receive automatic courier options when freight and destination-zone data are complete.
- Never ask the customer to decide whether their address is metro/rural/remote.
- Never promise an automated rate for large items or rentals.
- An unresolved town/address goes to logistics review rather than receiving a guessed charge.
- Manual-review orders remain valid sales opportunities; logistics staff must price delivery before final payment/confirmation.
- A courier's underlying cost is not the customer-facing charge; SmartCommerce applies the approved operational markup for automated parcel services.
- A displayed courier estimate is not final until checkout shows that delivery has been verified and attached.
- A manually priced logistics review still requires fresh merchandise revalidation before the customer can pay.

## Logistics / dispatch module
Logistics reviewers should:
1. Confirm the destination, access notes and recipient details.
2. Resolve/confirm the delivery area if SmartCommerce could not classify it from authoritative courier data.
3. Determine the correct vehicle / transport provider and whether loading/unloading assistance is required.
4. Enter the real provider or internal operating cost.
5. Enter the approved customer delivery charge.
6. Add schedule and handling notes.
7. Mark the review priced only after the transport requirement is credible.

Do not alter merchandise price or stock from the delivery review workspace. Do not mark the order paid or fulfilled from this queue.

## Bookkeeping module
Bookkeepers should see separate values for:
- provider/courier/operating cost
- operational markup or manual delivery margin
- customer delivery charge
- provider/service/vehicle
- resolved delivery area/source
- order/reference
- settlement/payment status

This separation enables courier invoice reconciliation and delivery-margin reporting.

## Management module
Management should be able to review:
- delivery revenue
- courier/transport cost
- delivery gross margin
- manual-review volume
- unresolved destination volume
- average delivery charge
- provider usage and service performance
- rate-table and zone-table freshness
- manual-review turnaround time

The 20% markup is a policy setting for automated parcel services and may later become configurable.

## Developer module
Primary implementation:
- `src/server/deliveryFulfilmentEngine.ts`
- `src/server/deliveryProductFacts.ts`
- `src/server/jamaicaDeliveryZones.ts`
- `src/server/customerDeliveryAddresses.ts`
- `src/server/deliveryReviewQueue.ts`
- `src/server/staffSession.ts`
- `src/services/deliveryClient.ts`
- `src/services/checkoutFulfilmentClient.ts`
- `src/services/customerAddressClient.ts`
- `src/services/deliveryReviewClient.ts`
- `api/delivery-quote.ts`
- `api/checkout-fulfilment.ts`
- `api/customer-addresses.ts`
- `api/delivery-reviews.ts`
- `api/staff-session.ts`
- `api/commercial-credit-checkout.ts`
- `src/components/checkout/SavedDeliveryAddressPicker.tsx`
- `src/pages/CheckoutPage.tsx`
- `src/pages/DeliveryReviewPage.tsx`
- `src/styles/delivery-fulfilment.css`
- `src/styles/saved-delivery-addresses.css`
- `src/styles/delivery-review.css`

Engineering rules:
- Provider rates and zone classifications belong in controlled server configuration/data structures, never scattered through checkout components.
- Do not trust client-editable weight/dimension or destination-class values as authoritative checkout facts.
- Freight facts are resolved from the connected commerce provider at the server boundary.
- Destination classes are resolved server-side from authoritative courier-area data.
- Unknown locations fail closed to manual logistics review.
- Round Town pricing requires a verified same-city/town origin and destination.
- Same-day pricing requires a provider-verified route.
- Rates with stale or unconfirmed sources must remain disabled for automatic checkout.
- Preserve explicit source status for every provider service and zone decision.
- Manual review is a valid routing decision, not an error condition.
- Never create an order with an estimated delivery charge that has not been revalidated and persisted into the authoritative checkout quote.
- Every order-creation endpoint must enforce fulfilment binding server-side; UI guards are not security controls.
- Manual delivery review records must outlive short merchandise quotes; pricing a logistics review must never extend stale merchandise pricing.

## Next implementation stages
1. Expand authoritative Jamaica location coverage from provider-maintained sources while preserving unresolved/manual fallback for unknown locations.
2. Add courier collection-point/branch selection for branch-to-branch services.
3. Add provider APIs/contracts where available.
4. Add guest checkout fulfilment binding.
5. Add delivery status, dispatch and proof-of-delivery lifecycle.
6. Add delivery reporting and rate/zone freshness monitoring.
