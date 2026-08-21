import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

const invariants = [
  [app.includes('SHOPPING_BRANCH_CHANGED_EVENT') && app.includes('isShoppingBranch'), "app shell listens to validated shared branch changes"],
  [app.includes('path === "/products"') && app.includes('path === "/search"') && app.includes('path === "/rentals"') && app.includes('path.startsWith("/category/")'), "branch task preservation is limited to branch-scoped commerce discovery routes"],
  [!app.includes('path === "/cart" || path === "/checkout"') && !app.includes('path === "/repairs" || path === "/commercial"'), "cart, checkout, repair and commercial workflows are not branch-rewritten by the discovery sync"],
  [app.includes("const query = new URLSearchParams(current.query)"), "existing route query and filters are preserved when branch changes"],
  [app.includes('if (branch === "Online") query.delete("branch")') && app.includes('else query.set("branch", branch)'), "branch sync replaces only the branch parameter and removes it for Online context"],
  [app.includes("window.history.replaceState") && app.includes("setRoute(getRoute())"), "branch sync updates the current route in place without a destructive navigation"],
  [app.includes('key={`products:${branchRouteKey}`}') && app.includes('key={`rentals:${branchRouteKey}`}'), "products and rentals remount against the new branch context"],
  [app.includes('key={`search:${branchRouteKey}`}') && app.includes('key={`category:${path}:${branchRouteKey}`}'), "search and category discovery remount against the new branch context"],
  [app.includes('const branchRouteKey = route.query.get("branch") || "Online"'), "branch-sensitive remount key is derived from the route context"],
];

for (const [ok, label] of invariants) assert.equal(ok, true, label);
console.log(`Branch task-preservation regression gate passed (${invariants.length} invariants).`);
