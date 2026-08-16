# SmartCommerce Frontend Audit and Acceptance Matrix

This document governs the redesign of the customer-facing SmartCommerce AI / Total Tools Jamaica experience.

## Non-negotiable product direction

SmartCommerce must be bright, precise, powerful, human, energetic, industrial, intelligent, mobile-first and commercially effective. Premium does not mean dark. Futuristic does not mean neon. Modern does not mean oversized typography. AI does not mean sparkles everywhere.

Brand source of truth:
- Use the actual Total Tools Jamaica logo assets in the repository. Do not redraw, recreate or substitute the wordmark.
- Established Total Tools green: `#08763f`.
- Supporting palette: yellow/gold, white, warm off-white/cream, light neutral gray and charcoal only where a true dark neutral is useful.
- Products and equipment photography should provide much of the visual energy.

## Active customer surfaces

The current application exposes these active journeys:
- Home
- Products
- Categories / Category
- Search
- Product Detail
- Compare
- Deals
- Cart
- Wishlist
- Checkout
- Order confirmation
- Rentals
- Rental Detail
- Rental confirmation
- Repairs
- Repair confirmation
- Commercial
- Commercial confirmation
- SmartCommerce Assistant
- Product Match
- Account

## Phase 1 issue matrix

| Surface | Visual / UX issue | Functional / technical issue | Responsive / accessibility issue | Required outcome |
|---|---|---|---|---|
| Global shell | Multiple generations of CSS still compete for final authority; visual identity has drifted between dark, light and patched states | Shell depends on layered overrides instead of semantic primitives | Fixed mobile navigation and browser chrome have previously overlapped content | One canonical shell system with explicit ownership of header, branch selector, search, promo, footer and mobile nav |
| Brand | Previous branch work attempted substitute wordmark and off-brand greens | Real raster logo may contain distressed texture but must remain brand source of truth | Logo must scale without clipping | Render the actual logo only; never invent/retype it; use `#08763f` as established UI green |
| Header | Too much vertical chrome in some mobile states; hierarchy can feel crowded | Branch selector exists but must consistently drive branch-aware discovery where provider data supports it | Mobile must stay balanced: branch / logo / account, then search | Compact two-row mobile commerce header with persistent branch context and direct Product Match / AI entry |
| Promo | Signal/ticker has been visually louder than commerce content | Context should never masquerade as verified live data | Must not consume excessive mobile viewport | Compact merchandising strip that adds value without dominating |
| Home | Risk of card-stack monotony and giant marketing typography | Working Shop/Rent/Repair/Commercial/AI paths must remain direct | Mobile must surface real actions above the fold | Editorial retail rhythm, strong photography, immediate path selection and intelligent discovery |
| Product discovery | Filters/search/results can feel like admin tooling rather than premium retail | Branch, price, brand, category, availability and attribute filters must remain operational | Mobile filters should be sheet/drawer based, not long inline forms | Fast scan-and-decide experience with applied chips, compact sort/results and excellent product merchandising |
| Product cards | Metadata and secondary controls can compete with price and purchase action | Add to Cart, Compare, Save and View Details must all have real results | Cards must not consume an entire phone viewport | Image-led hierarchy: name, key spec, availability, price, primary Add to Cart, restrained secondary actions |
| Product detail | Purchase decision can be buried by supporting content | Add to Cart / wishlist / alternatives must remain wired | Buy decision must appear early on mobile | World-class purchase panel with gallery, branch/availability, price, quantity, fulfillment and AI help |
| Cart | Decorative hero treatment has previously consumed too much space | Guest cart persistence and quantities must remain; signed-in persistent cart remains provider-backed | Fixed nav must never cover controls or totals | Transactional workspace: item, quantity, remove, subtotal, checkout; minimal decoration |
| Guest checkout | Required and already server-verified | Browser price/stock must never be trusted; server re-fetch/revalidation required | Mobile should not be one giant form | Clear guest/sign-in choice and focused Contact -> Fulfillment -> Review -> Payment/verified-quote progression |
| Checkout | Current repository has no real payment processor/webhook completion | Must stop honestly at verified quote until processor exists | Summary and primary action must remain visible without obstruction | Trustworthy checkout that never fakes payment success |
| Compare | Functional destination exists but needs stronger decision design | Comparison state should remain connected to active product actions | Mobile comparison must remain usable without horizontal chaos | Decision-oriented comparison emphasizing meaningful differences and Add to Cart |
| Wishlist | Current state is session-level | Empty state should help discovery; persistence semantics must be explicit | Mobile actions must remain clear | Useful saved-items workspace without pretending cross-device persistence unless available |
| Rentals | Too many stacked context/search boxes and tall cards have been observed | Branch/date/fulfillment/filter/compare/reservation flows must remain operational | Cards, sticky controls and fixed nav must not overlap; context should be compact | First-class rental journey: compact context bar, job/equipment discovery, concise rates, availability, Select Dates/Reserve |
| Rental detail | Can become brochure-like and overly tall | Reservation must submit to real provider endpoint | Primary reservation action must appear early | Equipment decision view with rates, availability, dates/fulfillment and real submission |
| Repairs | Must feel reassuring rather than technical/backend-oriented | Real repair request submission must remain | Forms need accessible labels/errors and mobile sequencing | Guided repair intake with issue description, equipment, branch/service method, photos where supported, contact and confirmation |
| Commercial | Risk of consumer landing-page treatment | Real quote/account request workflows must remain | Dense business forms should be staged | Professional contractor/business workflow focused on speed, bulk quantities, pricing and service |
| Assistant | Risk of standalone chatbot page instead of commerce operating layer | Provider-grounded responses only; no invented price/stock/products | Interactive result cards must remain usable on phones | AI produces actionable commerce objects and context-aware next actions |
| Product Match | Grounded workflow now exists | Must never regress to fake confidence or predetermined products | Upload/analyze/results must be accessible and resilient | Trustworthy visual identification with evidence, clarification and actionable catalogue matches |
| Deals | Must feel merchandised rather than generic | Only verified configured campaigns | Mobile hierarchy and expiration/status must be clear | High-impact but truthful promotions with direct commerce actions |
| Account | Multiple account/auth states need one coherent system | Signup/login/logout/reset/verification/security remain real; history list APIs still incomplete | Forms and tabs must remain accessible and compact | Clear account center; incomplete history areas must be honest, not fake |
| Empty states | Generic emptiness reduces conversion | Must offer valid next actions only | Must remain concise on mobile | Context-aware recovery: change branch, remove filters, shop categories, Ask AI, etc. |
| Loading | Generic spinners reduce perceived quality | Do not fake completed state | Respect reduced motion | Skeleton/progressive/contextual loading and safe optimistic feedback |
| Footer | Previous dark-green wall and mobile overlap were unacceptable | Links/contact/branches must remain real | Mobile should not dump four long columns; fixed nav needs reserved safe area | Bright/warm-neutral footer, actual logo, progressive/accordion mobile structure, no overlap |

## Technical architecture findings

1. Routing is still a manual path switch in `App.tsx`. It works, but route growth makes it increasingly brittle. A formal router migration belongs in production hardening, not inside an uncontrolled visual redesign.
2. Guest cart is localStorage-backed and signed-in cart is server-backed. The UX should present one coherent cart while preserving the security boundary.
3. Wishlist and comparison are currently in-memory application state. Do not imply persistence that does not exist.
4. Payment capture is not implemented. Checkout must remain honest at the verified-quote boundary until a real payment processor and webhook confirmation path exist.
5. Customer activity history APIs are incomplete. Account history must not fabricate records.
6. CSS patch accumulation remains the largest frontend maintainability risk. New versioned patch files are prohibited.

## Canonical acceptance tests

Before a phase can be called complete, validate at minimum:

### Mobile widths
- 360px
- 390px
- 430px

### Additional widths
- 768px
- 1024px
- 1440px+

### End-to-end journey
A customer can:
1. Open SmartCommerce on an iPhone.
2. Select Drax Hall.
3. Search for a drill.
4. Filter and sort results.
5. Compare products.
6. Add one to cart and receive immediate feedback.
7. Change quantity/remove from guest cart.
8. Continue to checkout as guest without creating an account.
9. Receive a server-verified checkout quote without trusting browser price/stock.
10. Switch to Rentals.
11. Set branch, dates and pickup/delivery context.
12. Select/compare equipment and submit a real reservation.
13. Ask SmartCommerce AI for help.
14. Upload a photo to Product Match and receive grounded results/clarification.
15. Navigate to Repairs, Commercial and Account without visual breakage or dead controls.

At no point may there be:
- dead buttons
- fake success
- fake price/stock/availability
- fabricated AI confidence
- clipped headings or inputs
- horizontal page overflow
- content hidden under sticky/fixed chrome
- bottom navigation covering actions/footer
- low-contrast body text
- substitute/invented Total Tools branding

## Next implementation order

1. Canonical design tokens and UI primitives.
2. Global shell ownership and responsive geometry.
3. Shopping journey.
4. Rentals.
5. Repairs and Commercial.
6. Assistant and Product Match integration.
7. Accessibility/responsive QA.
8. Performance/microinteraction polish.
9. Full workflow regression pass.

No merge to `main` until the rendered preview earns approval.