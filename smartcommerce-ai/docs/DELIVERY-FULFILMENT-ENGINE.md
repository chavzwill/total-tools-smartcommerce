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

## Parcel eligibility gate
Automatic courier pricing is allowed only when all of the following are true:
1. Item is a sale, not a rental.
2. Item is explicitly marked parcel-eligible by trusted product/provider data.
3. Weight is known and positive.
4. Required dimensions are available where dimensional-weight rules apply.
5. Item is not oversized, hazardous or flagged as fragile freight/special handling.

If any requirement fails, route the shipment to manual review.

## Rental logistics
Rental orders must be manually reviewed because the logistics cost can include both delivery and collection, vehicle class, job-site access, scheduling and equipment handling. SmartCommerce must not treat rental transport as a normal parcel shipment.

## Large-item logistics
Large machines, generators, ladders, heavy tools, bulk electrical materials and similar freight are not to be priced through parcel courier tables. They enter a manual logistics queue where staff determine vehicle, route, delivery window, unloading requirements and final customer charge.

## Checkout behavior
Checkout should eventually request fulfilment options from the server after inventory and freight facts are revalidated. The server returns either:
- quoted: one or more verified courier options with provider cost, markup and customer charge; or
- manual_review: a clear reason code and no automatic delivery price.

Payment must not proceed using an unverified delivery price.

## Sales agent module
Sales agents should know:
- Small parcels can receive automatic courier options when freight data is complete.
- Never promise an automated rate for large items or rentals.
- Manual-review orders remain valid sales opportunities; logistics staff must price delivery before final payment/confirmation.
- A courier's underlying cost is not the customer-facing charge; SmartCommerce applies the approved operational markup.

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
- `api/delivery-quote.ts`

Engineering rules:
- Provider rates belong in configuration/data structures, never scattered through checkout components.
- Do not trust client-editable weight/dimension values as authoritative checkout facts.
- Rates with stale or unconfirmed sources must remain disabled for automatic checkout.
- Preserve explicit source status for every provider service.
- Manual review is a valid successful routing decision, not an error condition.

## Next implementation stages
1. Connect checkout cart SKUs to authoritative freight attributes from the commerce provider/catalogue.
2. Add fulfilment selection UI: pickup, parcel courier, manual delivery review.
3. Persist selected quote and revalidate it immediately before payment.
4. Add delivery/manual-review work queue for staff.
5. Add address/job-site records and route/zone intelligence.
6. Add provider APIs/contracts where available.
7. Add delivery status, dispatch and proof-of-delivery lifecycle.
