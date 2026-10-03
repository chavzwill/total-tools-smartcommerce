# SmartCommerce Equipment & Parts Fitment Contract

## Purpose

The Equipment & Parts Finder exposes a governed commerce hierarchy:

`Brand → Equipment family → Model → Variant/Revision → Assembly → Part → Subpart`

SmartCommerce must not infer fitment from a product name, SKU shape, or similarity alone. A relationship is shown only when approved catalogue data carries the relationship explicitly.

## Commerce authority

The POS/provider remains authoritative for:

- product and SKU identity
- purchasable state
- pricing and currency
- branch inventory and availability
- product lifecycle state

Fitment enrichment may come from approved manufacturer catalogues, approved distributor catalogues, or TT AI review workflows, but it must be written back as governed catalogue attributes before SmartCommerce presents the relationship as fact.

## Supported product attributes

Attribute matching is case-insensitive. Integrations should prefer the first canonical label in each row.

| Relationship | Preferred attribute | Accepted aliases |
| --- | --- | --- |
| Brand | `Brand` | `Manufacturer`, `Make` |
| Equipment family | `Equipment Type` | `Machine Type`, `Equipment Family`, `Machine Family` |
| Equipment model | `Model` | `Equipment Model`, `Machine Model` |
| Part fitment | `Compatible Models` | `Compatible Model`, `Fits Models`, `Fits Model`, `Equipment Models`, `Machine Models`, `Model Compatibility` |
| Variant/revision | `Model Variant` | `Variant`, `Revision`, `Equipment Revision` |
| Assembly | `Assembly` | `Assembly Group`, `Parts Group`, `Part Group`, `System`, `Component Group` |
| OEM part number | `OEM Part Number` | `Manufacturer Part Number`, `Part Number`, `MPN` |
| Parent/subpart | `Parent Part Number` | `Parent OEM Part Number`, `Parent Part`, `Parent Component` |
| Diagram reference | `Diagram Reference` | `Reference`, `Position`, `Illustration Reference` |
| Record type | `Item Type` | `Product Type`, `Record Type`, `Catalog Type` |

Multi-value fitment fields may be separated by commas, semicolons, pipes, or new lines. Do not use slash as a separator because valid model names can contain slashes.

## Minimum records

### Equipment record

An equipment record should provide:

- Brand
- Equipment Type
- Model
- optional Model Variant/Revision

### Part record

A part record should provide:

- Brand
- Compatible Models or Model
- OEM/Manufacturer Part Number where available
- Assembly where available
- optional Equipment Type
- optional Parent Part Number for subparts
- optional Diagram Reference

A POS SKU may be used as the displayed commerce identifier when an OEM part number is unavailable, but SKU alone must not establish fitment.

## Fail-closed behavior

When a model exists but no governed parts are mapped, SmartCommerce shows the model with an explicit no-fitment-yet state. It does not recommend a compatible part by inference.

When fitment exists but the POS/provider does not return a price or verified branch inventory, SmartCommerce keeps those commerce facts unavailable rather than substituting another branch or a preview value.

## TT AI enrichment workflow

TT AI may:

1. identify likely brand, model, assembly, and part relationships;
2. attach evidence and source provenance;
3. propose category or fitment corrections;
4. flag conflicting or uncertain mappings;
5. submit the relationship for approval.

Only approved relationships should be published into the catalogue attributes consumed by the Equipment & Parts Finder.

## Route

The customer-facing route is `#/parts`.

It preserves the global SmartCommerce shopping branch and supports deep-linkable query state for brand, equipment type, model, variant, assembly, and search terms.
