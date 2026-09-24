import type { CourierServiceInput } from '../../types/courier.js';

/** Server-resolved, single-origin packed shipment facts. Never accept these from checkout JSON. */
export type ShipmentFacts = {
  currency: string; originAreaId: string; destinationAreaId: string;
  mode: CourierServiceInput['mode']; collectionPointId?: string;
  categoryIds: string[]; restricted: boolean | undefined;
  parcel: { weightGrams: number; lengthMm: number; widthMm: number; heightMm: number } | null;
  now: string;
};
type Availability = { approved: boolean; verified: boolean; published: boolean; reserved: number };
type Reason = 'unavailable' | 'capacity' | 'invalid' | 'measurements' | 'restricted' | 'category' | 'currency' | 'coverage' | 'closed' | 'limits' | 'rate';
type Result = { eligible: false; reason: Reason } | { eligible: true; deliveryMinor: number; currency: string; serviceDate: string };
const reject = (reason: Reason): Result => ({ eligible: false, reason });

/** Preliminary eligibility only: reservation and checkout revalidation must be transactional.
 * Rates apply to the whole packed shipment. Mixed categories need identical matching rates;
 * an ambiguous combination requires a manual quote rather than an invented aggregation rule.
 * This returns delivery cost only, never assumes tax, payment or order readiness.
 */
export function rateCourierShipment(service: CourierServiceInput, facts: ShipmentFacts, state: Availability): Result {
  if (state.approved !== true || state.verified !== true || state.published !== true || service.available !== true) return reject('unavailable');
  if (!Number.isSafeInteger(state.reserved) || state.reserved < 0 || !Number.isSafeInteger(service.dailyCapacity) || service.dailyCapacity < 1) return reject('invalid');
  if (state.reserved >= service.dailyCapacity) return reject('capacity');
  if (facts.restricted !== false) return reject('restricted');
  if (!facts.parcel || !Object.values(facts.parcel).every(value => Number.isSafeInteger(value) && value > 0)
    || !['weightGrams','lengthMm','widthMm','heightMm'].every(key => Number.isSafeInteger(facts.parcel?.[key as keyof NonNullable<ShipmentFacts['parcel']>]))) return reject('measurements');
  const parcel = facts.parcel;
  if (![service.maxWeightGrams,service.maxLengthMm,service.maxWidthMm,service.maxHeightMm].every(value => Number.isSafeInteger(value) && value > 0)) return reject('invalid');
  if (parcel.weightGrams > service.maxWeightGrams || parcel.lengthMm > service.maxLengthMm || parcel.widthMm > service.maxWidthMm || parcel.heightMm > service.maxHeightMm) return reject('limits');
  if (!facts.categoryIds.length || facts.categoryIds.some(id => !service.categoryIds.includes(id))) return reject('category');
  if (facts.currency !== service.currency) return reject('currency');
  if (!service.originAreaIds.includes(facts.originAreaId) || !service.destinationAreaIds.includes(facts.destinationAreaId) || service.mode !== facts.mode
    || (facts.mode === 'branch_to_collection_point' && (!facts.collectionPointId || !service.collectionPointIds.includes(facts.collectionPointId)))) return reject('coverage');
  let parts: Record<string, string>;
  try {
    const instant = new Date(facts.now);
    if (!Number.isFinite(instant.getTime())) return reject('invalid');
    parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone:service.timezone,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(instant).map(p => [p.type,p.value]));
  } catch { return reject('invalid'); }
  const serviceDate = `${parts.year}-${parts.month}-${parts.day}`;
  const time = `${parts.hour}:${parts.minute}`;
  const weekday = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.weekday);
  const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  if (!validTime(service.cutoffLocal) || service.hours.some(h => !validTime(h.opens) || !validTime(h.closes) || h.opens >= h.closes)) return reject('invalid');
  if (service.closures.includes(serviceDate) || time >= service.cutoffLocal || !service.hours.some(h => h.weekday === weekday && time >= h.opens && time < h.closes)) return reject('closed');
  const prices: number[] = [];
  for (const categoryId of new Set(facts.categoryIds)) {
    const matching = service.rates.filter(rate => rate.categoryId === categoryId && rate.originAreaId === facts.originAreaId && rate.destinationAreaId === facts.destinationAreaId && parcel.weightGrams >= rate.minWeightGrams && parcel.weightGrams < rate.maxWeightGrams);
    if (matching.length !== 1 || !Number.isSafeInteger(matching[0].priceMinor) || matching[0].priceMinor < 0) return reject('rate');
    prices.push(matching[0].priceMinor);
  }
  if (new Set(prices).size !== 1) return reject('rate');
  return {eligible:true,deliveryMinor:prices[0],currency:service.currency,serviceDate};
}
