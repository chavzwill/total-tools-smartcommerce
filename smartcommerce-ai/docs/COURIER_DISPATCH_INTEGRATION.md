# Checkout dispatch integration status

The September 23 migration implements local database foundations, not an enabled live checkout integration. HandyPay checkout endpoints, signed notifications and the payment return screen have since been wired; see HANDYPAY_CHECKOUT.md for the remaining trusted-order, shipping and merchant activation requirements.

Trusted server adapters must supply immutable shipping contexts and rated quotes. Browser-provided amounts, parcel measurements, verification claims or payment success redirects must never populate these records. The existing checkout still lacks a connected payment processor and authoritative packing/address resolver.

`courier_shipping_reserve(customer, quote, request)` binds a hold to the customer and checkout context, serializes capacity checks by service and rejects expired quotes or unavailable services. A context has one selected quote; changing shipping selection currently requires a new checkout context. Confirmed holds consume their service day's capacity.

`courier_dispatch_paid(payment)` is for a future server-side adapter only after verifying both payment and order identity with the chosen processor/order source. It compares the paid amount, currency, customer and quote, preserves conflicting or late confirmations for review, and creates one company dispatch per order and quote. Replayed payment confirmations return their original receipt. It is deliberately not exposed as a public webhook. Settlement processing currently uses a global transaction lock for correctness; throughput should be measured before launch.

`courier_dispatch_assign(owner, job, driver, version)` checks current company and driver verification, then creates the existing pickup record. This connects assignment to the existing QR pickup and delivery lifecycle. Assignment does not itself mean collected or delivered.

Remaining integration work: trusted quote creation and expiry/cart invalidation, checkout selection API/UI, processor-specific payment verification, dispatch queue/API/UI, operational review resolution, cancellation/refund handling, and earnings creation after verified delivery. Database functions revoke PUBLIC execution; deployment must explicitly grant the restricted application role access as needed.

Local regression coverage includes last-slot concurrency, ownership, replayed payments, different payments for the same order, payment mismatches, expired reservations, service suspension, and verified-driver assignment. No production migrations or deployment have been performed.
