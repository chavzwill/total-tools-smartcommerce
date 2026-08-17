import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const commerce = await readFile(new URL("../api/commerce.ts", import.meta.url), "utf8");

const checks = [];
function guard(name, pattern, message) {
  checks.push(name);
  assert.match(commerce, pattern, message || `${name} invariant is missing`);
}
function reject(name, pattern, message) {
  checks.push(name);
  assert.doesNotMatch(commerce, pattern, message || `${name} forbidden pattern returned`);
}

guard("persistent commerce requires a live unrevoked session", /customer_sessions[\s\S]*?token_hash = \$\{hashToken\(token\)\}[\s\S]*?revoked_at IS NULL[\s\S]*?expires_at > NOW\(\)/);
guard("commerce mutations enforce same origin", /method !== "POST"[\s\S]*?!sameOrigin\(request\)[\s\S]*?ORIGIN_REJECTED/);
guard("commerce request bodies are bounded", /const MAX_BODY_BYTES = 24_000[\s\S]*?total > MAX_BODY_BYTES/);
guard("cart lookup is scoped to authenticated customer", /FROM customer_carts[\s\S]*?customer_id = \$\{customerId\}[\s\S]*?status = 'active'/);
guard("cart item reads are scoped to the active cart", /FROM customer_cart_items[\s\S]*?WHERE cart_id = \$\{cartId\}/);
guard("quantity changes are scoped to the active cart", /UPDATE customer_cart_items SET quantity = \$\{quantity\}[\s\S]*?WHERE id = \$\{itemId\} AND cart_id = \$\{cart\.id\}/);
guard("cart item deletes are scoped to the active cart", /DELETE FROM customer_cart_items WHERE id = \$\{itemId\} AND cart_id = \$\{cart\.id\}/);
guard("cart quantities are bounded", /quantity < 0 \|\| quantity > 999/);
guard("caller supplied provider identity is ignored", /const trustedProviderId = process\.env\.SMARTCOMMERCE_PROVIDER_ID/);
guard("provider identity comes from server environment", /trustedPlatformHeaders[\s\S]*?SMARTCOMMERCE_PROVIDER_ID/);
guard("product lookup uses fixed internal platform origin", /https:\/\/smartcommerce\.internal\/api\/platform\/products\//);
guard("quote creation revalidates live provider products", /createQuote[\s\S]*?fetchProduct\(request, row\.provider_item_id\)[\s\S]*?ITEM_REVALIDATION_FAILED/);
guard("inactive or non-purchasable products are rejected", /product\.active === false \|\| product\.purchasable === false/);
guard("mixed currency carts are rejected", /MIXED_CURRENCY_CART/);
guard("quote IDs are derived from server-side quote fingerprints", /quoteFingerprint = stableHash\([\s\S]*?const id = `qte_\$\{quoteFingerprint\.slice\(0, 32\)\}`/);
guard("quote fingerprints bind customer and cart", /stableHash\(\{ customerId, cartId, quoteBucket, snapshotItems, subtotalMinor, taxMinor, totalMinor \}\)/);
guard("authenticated quote generation is customer rate limited", /commerce_quote_customer[\s\S]*?subject: customerId[\s\S]*?QUOTE_CUSTOMER_LIMIT/);
guard("authenticated quote generation is IP rate limited", /commerce_quote_ip[\s\S]*?subject: requestIp\(request\)[\s\S]*?QUOTE_IP_LIMIT/);
guard("cart mutations are rate limited", /commerce_cart_mutation[\s\S]*?subject: customerId[\s\S]*?CART_MUTATION_LIMIT/);
guard("rate limiting returns Retry-After", /response\.setHeader\("Retry-After"/);
guard("commerce security events record quote creation", /eventType: "commerce_quote_created"/);
guard("payment availability is not fabricated", /paymentAvailable: false/);
reject("browser cannot select provider id for persistence", /provider_id, provider_item_id, quantity\)\s*VALUES \([^\n]*input\.providerId/);
reject("browser submitted prices are not accepted", /input\.(price|unitPrice|subtotal|total|currency)/);

console.log(`Authenticated commerce security regression gate passed: ${checks.length} invariants verified.`);
