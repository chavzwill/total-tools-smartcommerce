# Canonical Architecture Flow

## Required flow

Customer
→ SmartCommerce frontend
→ Search / AI request / rental / repair / product workflow
→ SmartCommerce application orchestration
→ Platform service layer
→ Provider/POS adapter
→ Real provider/POS system
→ Normalized trusted response
→ SmartCommerce customer-facing result

## Architectural direction

SmartCommerce is **not**:

- A replacement POS
- A separate source of truth for inventory/pricing
- A static fake catalog

SmartCommerce **is**:

- Intelligent customer experience
- Business-system integration layer
- Commerce orchestration layer
- Canonical contract normalization layer
- AI guidance over trusted live data

## Source-of-truth rules

1. Transaction-critical fields (price, stock, availability, order status) come from provider/POS authority.
2. Canonical contracts are the app-wide boundary model.
3. Missing provider fields must not silently default to misleading values.
4. Provider-specific fields are mapped at adapter boundary, not leaked through app/UI.

## Boundary ownership

- Frontend: rendering, user inputs, UX state.
- Application orchestration: workflow decisions and composition.
- Platform services: capability execution against adapter contracts.
- Adapter/connector: provider schema + protocol translation.
- Provider system: authoritative business data and transactional execution.
