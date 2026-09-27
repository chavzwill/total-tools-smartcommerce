import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const branch = await readFile(new URL("../src/lib/shoppingBranch.ts", import.meta.url), "utf8");
const header = await readFile(new URL("../src/components/layout/Header.tsx", import.meta.url), "utf8");
const mobileNav = await readFile(new URL("../src/components/layout/MobileCommerceNav.tsx", import.meta.url), "utf8");
const advisor = await readFile(new URL("../src/lib/advisor.ts", import.meta.url), "utf8");
const productMatch = await readFile(new URL("../src/lib/productMatch.ts", import.meta.url), "utf8");
const assistant = await readFile(new URL("../src/pages/AssistantPage.tsx", import.meta.url), "utf8");

const invariants = [
  [branch.includes('SHOPPING_BRANCH_KEY = "smartcommerce_shopping_branch_v1"'), "shared utility owns the persisted shopping-branch key"],
  [branch.includes('SHOPPING_BRANCH_CHANGED_EVENT = "smartcommerce:shopping-branch-changed"'), "shared utility owns the branch-change event"],
  [branch.includes('SHOPPING_BRANCHES = ["Ocho Rios", "Drax Hall", "Kingston", "Online"]'), "shared utility owns the supported branch list"],
  [branch.includes("setShoppingBranch") && branch.includes("window.dispatchEvent"), "shared branch setter persists and broadcasts branch changes"],
  [branch.includes('path === "/products"') && branch.includes('path === "/search"') && branch.includes('path === "/rentals"'), "branch-aware href recognizes core discovery routes even when they carry query parameters"],
  [branch.includes("new URLSearchParams(rawQuery)") && branch.includes('query.set("branch", branch)'), "branch-aware href preserves existing query parameters while applying branch context"],
  [branch.includes('if (branch === "Online") query.delete("branch")'), "Online branch-aware href removes a physical branch without discarding the task query"],
  [header.includes('from "../../lib/shoppingBranch"'), "header consumes shared branch state"],
  [header.includes("window.addEventListener(SHOPPING_BRANCH_CHANGED_EVENT, syncBranch)"), "header reacts to branch changes initiated elsewhere"],
  [header.includes("setShoppingBranch(next)"), "header branch selection uses the shared setter"],
  [mobileNav.includes('from "../../lib/shoppingBranch"'), "mobile navigation consumes shared branch state"],
  [mobileNav.includes("window.addEventListener(SHOPPING_BRANCH_CHANGED_EVENT, syncBranch)"), "mobile navigation reacts to branch changes initiated elsewhere"],
  [advisor.includes('from "./shoppingBranch"') && advisor.includes("getPhysicalShoppingBranch()"), "Ask AI resolves branch context from the shared utility"],
  [productMatch.includes('from "./shoppingBranch"') && productMatch.includes("getPhysicalShoppingBranch()"), "Product Match resolves branch context from the shared utility"],
  [assistant.includes('from "../lib/shoppingBranch"') && assistant.includes("setShoppingBranch(branchName)"), "AI alternate-branch actions use the shared setter"],
  [assistant.includes("Switch to {item.branchName}"), "provider-confirmed alternate branches are actionable"],
  [assistant.includes("void submitPrompt(prompt)"), "switching branch refreshes the current AI request against the new branch"],
  [!advisor.includes('const SHOPPING_BRANCH_KEY = "smartcommerce_shopping_branch_v1"'), "advisor no longer duplicates the branch storage key"],
  [!productMatch.includes('const SHOPPING_BRANCH_KEY = "smartcommerce_shopping_branch_v1"'), "Product Match no longer duplicates the branch storage key"],
  [!mobileNav.includes('const SHOPPING_BRANCH_KEY = "smartcommerce_shopping_branch_v1"'), "mobile navigation no longer duplicates the branch storage key"],
];

for (const [ok, label] of invariants) assert.equal(ok, true, label);
console.log(`Shopping-branch continuity regression gate passed (${invariants.length} invariants).`);
