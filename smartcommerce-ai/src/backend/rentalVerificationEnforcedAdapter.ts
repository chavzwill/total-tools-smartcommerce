import type { PosAdapter } from "../platform/posAdapter";
import { createVerifiedRentalReservation } from "../platform/rentalVerificationEngine";

/**
 * Wraps a provider adapter so rental reservation writes cannot bypass the
 * SmartCommerce verification gate. All other provider operations are delegated
 * unchanged.
 *
 * Compose this outside the raw provider adapter and inside any capability guard:
 * raw provider -> capability guard -> rental verification enforcement -> backend.
 */
export const createRentalVerificationEnforcedAdapter = (
  adapter: PosAdapter
): PosAdapter => ({
  ...adapter,
  createRentalReservation(context, request) {
    return createVerifiedRentalReservation(adapter, context, request);
  },
});
