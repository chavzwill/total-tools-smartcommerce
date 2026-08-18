# SmartCommerce Phase 10 — Customer Journey Acceptance Audit

This document is the acceptance gate for the `frontend-consolidation` storefront. It complements the frontend design constitution and release/security regression suite.

## Governing rule

If the UI offers an action, there must be a usable result behind it. Do not ship fake confirmations, fake stock/pricing, fake AI confidence, dead controls, unsupported file pickers, or demo-success redirects.

## Acceptance journey

### 1. Branch context
- Header offers Ocho Rios, Drax Hall, Kingston, and Online.
- Selection persists in local storage.
- Search carries physical branch context into product/rental discovery.
- Desktop Shop/Rent and Explore destinations preserve physical branch context.
- Mobile Shop/Rentals preserve physical branch context.
- Product detail, Repairs, Commercial, and Rental Detail read the saved shopping branch where applicable.

### 2. Product discovery
- Products/Categories/Search routes are operational.
- Query, category, brand, branch, availability, rentable, price, sort, and supported attribute filtering are represented by the discovery state.
- Mobile filters use a dedicated sheet rather than simply compressing desktop controls.
- Empty states provide recovery actions.

### 3. Product decision
- Product cards prioritize product, key specification, availability/price context, and Add to Cart.
- Product Detail exposes quantity, Add to Cart, Save, branch context, Rent alternative, Repair, Commercial, and Ask AI.
- Add to Cart keeps the customer in browsing context and provides feedback.

### 4. Compare and Save
- Compare selection happens in-place rather than navigating away on the first selection.
- A selected product exposes View Compare.
- Compare page provides side-by-side specifications and Add to Cart.
- Guest Compare and Wishlist selections persist across refreshes.

### 5. Cart and guest checkout
- Guest cart persists across refreshes and supports quantity/update/remove.
- Signed-in cart uses the persistent account cart.
- Guest checkout does not require account creation.
- Guest checkout sends product IDs/quantities only; the server re-fetches and revalidates purchasability, current pricing, currency and tax.
- Signed-in checkout creates a provider-verified short-lived quote.
- Payment is deliberately disabled until a real processor and webhook-confirmed paid-order flow exist.

### 6. Rentals
- Rental discovery supports search, branch, dates, fulfillment, category, availability, sort, compare, and job context.
- Rental cards prioritize capability, availability, compact rates, and the reservation action.
- Rental Detail inherits the saved physical branch when no explicit URL branch is supplied.
- Reservation submission calls the connected rental workflow and only confirms after provider acceptance.

### 7. Repairs
- Repair intake supports equipment/model, issue description, branch, preferred date and customer contact.
- Saved physical branch pre-populates where applicable.
- Submission calls the connected repair workflow.
- Unsupported repair-photo upload has been removed from the active workflow until provider file transfer exists.
- Repair-history affordances are not presented as operational while customer-scoped history listing is unavailable.

### 8. Commercial
- Immediate commercial request/pricing submission uses configured provider context.
- Business/account application is separate from verified commercial privileges.
- Sites/projects are planning data and do not grant financial authority.
- Commercial pricing/credit/PO/account terms remain locked until verification.

### 9. SmartCommerce AI
- Assistant responses are provider-grounded.
- Product recommendations render actionable product cards.
- Rental recommendations lead directly to rental availability/actions.
- Add to Cart uses the real cart path.
- Product Match is available directly from the assistant and global shell.

### 10. Product Match
- Uploaded/camera image is prepared client-side and analyzed by the guarded server workflow.
- Results expose visible evidence, detected attributes/text, catalogue reasons, clarification state, candidate confidence, provider availability, alternatives and direct actions.
- No hard-coded product, confidence, availability or accessory result is permitted.

### 11. Account and security
- Signup, login, logout, email verification, password reset, session/security, MFA/passkey pathways are connected to real account APIs.
- Customer activity history tabs remain explicitly non-operational until customer-scoped list APIs exist; they must not fabricate history.

## Accessibility / responsive gate
- Skip navigation and semantic main landmark are present.
- Primary navigation exposes `aria-current`.
- Explore dialog traps keyboard focus, closes on Escape and restores focus.
- Branch selector uses menu/radio semantics.
- Mobile form controls use iOS-safe sizing and primary touch actions target at least 44px.
- Fixed mobile navigation reserves bottom safe-area space and must not obscure content.
- Reduced-motion preferences disable nonessential motion.

## Performance gate
- Product/rental imagery uses lazy loading/async decoding where appropriate.
- Secondary customer journeys are route-split with React lazy/Suspense so the initial storefront does not eagerly load every page.
- Route fallback is an accessible live loading state.

## Release gate
Every production build runs the repository `test:release-gate`, both TypeScript no-emit checks, dependency audit, and Vite production build. A Vercel `READY` build is required before advancing the phase.

## Genuine remaining dependencies
1. **Payment capture/final paid order creation** — no real processor + webhook-confirmed payment implementation exists yet.
2. **Customer order/rental/repair history lists** — provider/POS adapter lacks customer-scoped list operations.
3. **Provider/AI credentials and live business configuration** — real live outcomes require configured provider/business context; Product Match requires the configured AI credential.
4. **Visual device approval** — rendered iPhone/desktop review remains required before merge; a clean compile is not visual approval.

## Merge status
Do not merge this branch into `main` until the latest exact head is Vercel READY and the rendered preview receives explicit visual approval.
