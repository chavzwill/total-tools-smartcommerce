export const SHOPPING_BRANCH_KEY = "smartcommerce_shopping_branch_v1";
export const SHOPPING_BRANCH_CHANGED_EVENT = "smartcommerce:shopping-branch-changed";
export const SHOPPING_BRANCHES = ["Ocho Rios", "Drax Hall", "Kingston", "Online"] as const;

export type ShoppingBranch = (typeof SHOPPING_BRANCHES)[number];

export function isShoppingBranch(value: unknown): value is ShoppingBranch {
  return typeof value === "string" && SHOPPING_BRANCHES.includes(value as ShoppingBranch);
}

export function getShoppingBranch(fallback: ShoppingBranch = "Online"): ShoppingBranch {
  try {
    const stored = window.localStorage.getItem(SHOPPING_BRANCH_KEY);
    return isShoppingBranch(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}

export function getPhysicalShoppingBranch(): Exclude<ShoppingBranch, "Online"> | undefined {
  const branch = getShoppingBranch();
  return branch === "Online" ? undefined : branch;
}

export function setShoppingBranch(branch: ShoppingBranch) {
  try {
    window.localStorage.setItem(SHOPPING_BRANCH_KEY, branch);
  } catch {
    // Branch switching still updates the current UI caller even when storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent(SHOPPING_BRANCH_CHANGED_EVENT, { detail: { branch } }));
}

export function branchDescription(branch: ShoppingBranch) {
  return branch === "Online" ? "Browse the widest online selection" : `Prioritize ${branch} stock and pickup`;
}

export function branchAwareHref(href: string, branch: ShoppingBranch) {
  const [path, rawQuery = ""] = href.split("?", 2);
  const isBranchScoped = path === "/products" || path === "/search" || path === "/rentals" || path.startsWith("/category/");
  if (!isBranchScoped) return href;

  const query = new URLSearchParams(rawQuery);
  if (branch === "Online") query.delete("branch");
  else query.set("branch", branch);
  const nextQuery = query.toString();
  return `${path}${nextQuery ? `?${nextQuery}` : ""}`;
}
