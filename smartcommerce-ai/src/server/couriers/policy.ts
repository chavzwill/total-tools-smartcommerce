import type { CourierAction, CourierApplicationInput, CourierStatus } from '../../types/courier.js';

export class CourierError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}

export function canReviewCouriers(actor: {permissions?: Record<string, unknown>} | null | undefined): boolean {
  return actor?.permissions?.couriers_manage === true;
}

export function nextApplicationStatus(status: CourierStatus, action: CourierAction): CourierStatus {
  const transitions: Record<CourierStatus, Partial<Record<CourierAction, CourierStatus>>> = {
    draft: {submit:'submitted'}, rejected: {submit:'submitted'},
    submitted: {approve:'approved', reject:'rejected'}, approved: {suspend:'suspended'},
    suspended: {reinstate:'approved'},
  };
  const next = transitions[status]?.[action];
  if (!next) throw new CourierError('COURIER_STATE_CONFLICT', 409);
  return next;
}

export function normalizeApplication(input: unknown): CourierApplicationInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new CourierError('COURIER_INVALID_APPLICATION');
  const data = input as Record<string, unknown>;
  const limits = {businessName:120, contactName:120, email:254, phone:32, description:2000};
  if (Object.keys(data).some(key => !Object.hasOwn(limits,key))) throw new CourierError('COURIER_INVALID_APPLICATION');
  const result: Record<string,string> = {};
  for (const [key,max] of Object.entries(limits)) {
    const value = data[key];
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new CourierError('COURIER_INVALID_APPLICATION');
    result[key] = value.trim();
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) throw new CourierError('COURIER_INVALID_EMAIL');
  if (!/^\+?[\d ()-]+$/.test(result.phone) || result.phone.replace(/\D/g,'').length < 7 || result.phone.replace(/\D/g,'').length > 15) throw new CourierError('COURIER_INVALID_PHONE');
  return result as CourierApplicationInput;
}
