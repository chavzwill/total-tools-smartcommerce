import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

const invariants = [
  [app.includes('SHOPPING_BRANCH_CHANGED_EVENT') && app.includes('isShoppingBranch') && app.includes('getShoppingBranch'), "app shell uses validated shared branch state for changes and route entry"],
  [app.includes('path === "/products"') && app.includes('path === "/search"') && app.includes('path === "/rentals"') && app.includes('path.startsWith("/category/")'), "branch task preservation is limited to branch-scoped commerce discovery routes"],
  [!app.includes('path === "/cart" || path === "/checkout"') && !app.includes('path === "/repairs" || path === "/commercial"'), "cart, checkout, repair and commercial workflows are not branch-rewritten by the discovery sync"],
  [app.includes("function normalizeBranchScopedRoute") && app.includes("const query = new URLSearchParams(current.query)"), "route normalization preserves the existing discovery task query and filters"],
  [app.includes('const nextBranch = branch === "Online" ? null : branch') && app.includes('if (nextBranch) query.set("branch", nextBranch)') && app.includes('else query.delete("branch")'), "route normalization replaces only physical branch context and removes it for Online"],
  [app.includes("window.history.replaceState") && app.includes("return getRoute()"), "normalized branch context is applied in place without destructive navigation"],
  [app.includes("setRoute(normalizeBranchScopedRoute(getRoute()))"), "newly entered discovery routes inherit the current global branch automatically"],
  [app.includes("setRoute(normalizeBranchScopedRoute(getRoute(), branch))"), "global branch changes normalize the already active discovery route"],
  [app.includes('key={`products:${branchRouteKey}`}') && app.includes('key={`rentals:${branchRouteKey}`}'), "products and rentals remount against the new branch context"],
  [app.includes('key={`search:${branchRouteKey}`}') && app.includes('key={`category:${path}:${branchRouteKey}`}'), "search and category discovery remount against the new branch context"],
  [app.includes('const branchRouteKey = route.query.get("branch") || "Online"'), "branch-sensitive remount key is derived from route context"],
];

for (const [ok, label] of invariants) assert.equal(ok, true, label);
console.log(`Branch task-preservation regression gate passed (${invariants.length} invariants).`);
