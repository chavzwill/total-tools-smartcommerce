import { createHmac, timingSafeEqual } from "node:crypto";

export const STAFF_COOKIE_NAME = "sc_staff_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const STAFF_SESSION_SECRET_ENV = "SMARTCOMMERCE_STAFF_SESSION_SECRET";

export type StaffSession = {
  employeeId: string;
  username: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  securityGroupId?: string;
  securityGroupName?: string;
  defaultBranchId?: string;
  defaultBranchName?: string;
  branches?: Array<{ id: string; name?: string; branch_code?: string; currency?: string; is_default?: number | boolean }>;
  permissions: Record<string, boolean>;
  issuedAt: number;
  expiresAt: number;
};

function secret() {
  const value = process.env[STAFF_SESSION_SECRET_ENV]?.trim() || "";
  if (value.length < 32) throw new Error("STAFF_SESSION_SECRET_NOT_CONFIGURED");
  return value;
}

function signature(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function issueStaffSession(input: Omit<StaffSession, "issuedAt" | "expiresAt">) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const session: StaffSession = { ...input, issuedAt, expiresAt: issuedAt + SESSION_TTL_SECONDS };
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return { session, token: `${payload}.${signature(payload)}` };
}

export function readStaffSession(token?: string): StaffSession | null {
  if (!token) return null;
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;
  const payload = token.slice(0, separator);
  const supplied = token.slice(separator + 1);
  let expected: string;
  try { expected = signature(payload); } catch { return null; }
  if (!safeEqual(supplied, expected)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as StaffSession;
    if (!parsed.employeeId || !parsed.username || !parsed.expiresAt || parsed.expiresAt <= Math.floor(Date.now() / 1000)) return null;
    if (!parsed.permissions || typeof parsed.permissions !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function staffSessionCookie(token: string, expiresAt: number) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${STAFF_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict${secure}; Max-Age=${Math.max(0, expiresAt - Math.floor(Date.now() / 1000))}`;
}

export function clearStaffSessionCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${STAFF_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict${secure}; Max-Age=0`;
}

export function parseCookie(header?: string) {
  const result: Record<string, string> = {};
  for (const part of (header || "").split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try { result[key] = decodeURIComponent(value); } catch { result[key] = value; }
  }
  return result;
}

export function canStaff(session: StaffSession | null, key: string) {
  if (!session) return false;
  const permissions = session.permissions || {};
  if (Object.prototype.hasOwnProperty.call(permissions, key)) return permissions[key] === true;

  const parentMap: Record<string, string> = {
    pos_discounts: "pos", pos_refunds: "pos", pos_void_items: "pos", pos_hold: "pos",
    drawers_manage: "drawers", drawers_open: "drawers", drawers_close: "drawers", void_transactions: "drawers",
    inventory_add: "inventory", inventory_edit: "inventory", inventory_delete: "inventory", inventory_adjust: "inventory",
    customers_add: "customers", customers_edit: "customers", customers_delete: "customers", customers_credit: "customers",
    transactions_export: "transactions", transactions_refund: "transactions", transactions_returns: "transactions",
    reports_export: "reports", reports_financial: "reports",
    employees_add: "employees", employees_edit: "employees", employees_delete: "employees", employees_salaries: "employees",
    suppliers_add: "suppliers", suppliers_edit: "suppliers", suppliers_delete: "suppliers",
    rentals_manage_items: "rentals", rentals_checkout: "rentals", rentals_returns: "rentals", rentals_issue: "rentals", rentals_pause: "rentals",
    wo_intake: "work_orders", wo_assess: "work_orders", wo_assign_parts: "work_orders", wo_technician: "work_orders", wo_signoff: "work_orders",
    pr_create: "purchase_requests", pr_approve: "purchase_requests", pr_convert: "purchase_requests",
    purchasing_create: "purchasing", purchasing_approve: "purchasing", purchasing_receive: "purchasing",
    transfers_create: "transfers", transfers_approve: "transfers", transfers_pickup: "transfers", transfers_dropoff: "transfers",
    quotations_create: "quotations", quotations_approve: "quotations", quotations_convert: "quotations",
    security_manage: "security", security_assign: "security",
  };
  const parent = parentMap[key];
  return parent ? permissions[parent] === true : permissions[key] === true;
}
