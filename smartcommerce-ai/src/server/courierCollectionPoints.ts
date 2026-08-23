export type CourierCollectionPoint = {
  id: string;
  provider: "tara" | "knutsford";
  name: string;
  town: string;
  parish: string;
  address: string;
  serviceIds: string[];
  sourceStatus: "published_current";
};

// Provider-published Jamaica courier locations verified 2026-08-23.
// Keep this data isolated from checkout UI so locations can be refreshed without changing commerce flow logic.
export const COURIER_COLLECTION_POINTS: CourierCollectionPoint[] = [
  { id: "tara_kingston_lyndhurst", provider: "tara", name: "TARA Kingston - Lyndhurst Road", town: "Kingston", parish: "Kingston", address: "49 1/2 Lyndhurst Road, Kingston 5", serviceIds: ["tara_branch_to_branch"], sourceStatus: "published_current" },
  { id: "tara_mandeville", provider: "tara", name: "TARA Mandeville", town: "Mandeville", parish: "Manchester", address: "Shop #2, Barham's Plaza, 8 North Race Course Road, Mandeville", serviceIds: ["tara_branch_to_branch"], sourceStatus: "published_current" },
  { id: "tara_montego_bay", provider: "tara", name: "TARA Montego Bay", town: "Montego Bay", parish: "St. James", address: "Sangster International Airport, Old Domestic Terminal, 9 Queens Drive, Montego Bay", serviceIds: ["tara_branch_to_branch"], sourceStatus: "published_current" },
  { id: "tara_ocho_rios", provider: "tara", name: "TARA Ocho Rios", town: "Ocho Rios", parish: "St. Ann", address: "Shop #2, 17 Main Street, Ocho Rios", serviceIds: ["tara_branch_to_branch"], sourceStatus: "published_current" },
  { id: "tara_negril", provider: "tara", name: "TARA Negril", town: "Negril", parish: "Hanover", address: "Negril Aerodrome, Hanover", serviceIds: ["tara_branch_to_branch"], sourceStatus: "published_current" },

  { id: "kex_angels", provider: "knutsford", name: "Knutsford Angels", town: "Spanish Town", parish: "St. Catherine", address: "Shop 39A, Angels Plaza, Angels (Spanish Town)", serviceIds: ["knutsford_courier"], sourceStatus: "published_current" },
  { id: "kex_drax_hall", provider: "knutsford", name: "Knutsford Drax Hall", town: "Drax Hall", parish: "St. Ann", address: "Lot 12 Drax Hall Estates, Drax Hall", serviceIds: ["knutsford_courier"], sourceStatus: "published_current" },
  { id: "kex_falmouth", provider: "knutsford", name: "Knutsford Falmouth", town: "Falmouth", parish: "Trelawny", address: "Florence Hall Business Centre, Rock, Falmouth", serviceIds: ["knutsford_courier"], sourceStatus: "published_current" },
  { id: "kex_gutters", provider: "knutsford", name: "Knutsford Gutters", town: "Gutters", parish: "St. Elizabeth", address: "Texaco Gas Station, Gutters", serviceIds: ["knutsford_courier"], sourceStatus: "published_current" },
  { id: "kex_harbour_view", provider: "knutsford", name: "Knutsford Harbour View", town: "Harbour View", parish: "Kingston", address: "Shop 38, Harbour View Shopping Centre, Harbour View", serviceIds: ["knutsford_courier"], sourceStatus: "published_current" },
  { id: "kex_new_kingston", provider: "knutsford", name: "Knutsford New Kingston", town: "New Kingston", parish: "Kingston", address: "18 Dominica Drive, New Kingston Shopping Center parking lot", serviceIds: ["knutsford_courier"], sourceStatus: "published_current" },
  { id: "kex_luana", provider: "knutsford", name: "Knutsford Luana", town: "Luana", parish: "St. Elizabeth", address: "Luana Main Road, Total Gas Station / Juici Patties Rest Stop", serviceIds: ["knutsford_courier"], sourceStatus: "published_current" },
  { id: "kex_lucea", provider: "knutsford", name: "Knutsford Lucea", town: "Lucea", parish: "Hanover", address: "Shop #3 Tag Plaza, Police Headquarters Road, Lucea", serviceIds: ["knutsford_courier"], sourceStatus: "published_current" },
  { id: "kex_mandeville", provider: "knutsford", name: "Knutsford Mandeville", town: "Mandeville", parish: "Manchester", address: "Shop 1 Pear Tree Plaza, Caledonia Road, Mandeville", serviceIds: ["knutsford_courier"], sourceStatus: "published_current" },
  { id: "kex_may_pen", provider: "knutsford", name: "Knutsford May Pen", town: "May Pen", parish: "Clarendon", address: "Lot 8 Curatoe Hill, Mineral Heights, May Pen", serviceIds: ["knutsford_courier"], sourceStatus: "published_current" },
  { id: "kex_mobay_pier1", provider: "knutsford", name: "Knutsford Montego Bay - Pier 1", town: "Montego Bay", parish: "St. James", address: "10 Harbour Circle, near Pier 1, Montego Bay", serviceIds: ["knutsford_courier"], sourceStatus: "published_current" },
  { id: "kex_mobay_airport", provider: "knutsford", name: "Knutsford Montego Bay Airport", town: "Montego Bay", parish: "St. James", address: "Donald Sangster International Airport, Montego Bay", serviceIds: ["knutsford_courier"], sourceStatus: "published_current" },
  { id: "kex_negril", provider: "knutsford", name: "Knutsford Negril", town: "Negril", parish: "Westmoreland", address: "Access across from Beaches Negril, Negril", serviceIds: ["knutsford_courier"], sourceStatus: "published_current" },
  { id: "kex_ocho_rios", provider: "knutsford", name: "Knutsford Ocho Rios", town: "Ocho Rios", parish: "St. Ann", address: "Shop #18 Ocean Village Shopping Center, Ocho Rios", serviceIds: ["knutsford_courier"], sourceStatus: "published_current" },
  { id: "kex_port_antonio", provider: "knutsford", name: "Knutsford Port Antonio", town: "Port Antonio", parish: "Portland", address: "Shop #30 Bayshore Plaza, Boundbrook, Port Antonio", serviceIds: ["knutsford_courier"], sourceStatus: "published_current" },
  { id: "kex_port_maria", provider: "knutsford", name: "Knutsford Port Maria", town: "Port Maria", parish: "St. Mary", address: "Green Life Llanrumney Farm / Buccaneers Jerk Center, Port Maria", serviceIds: ["knutsford_courier"], sourceStatus: "published_current" },
  { id: "kex_portmore", provider: "knutsford", name: "Knutsford Portmore", town: "Portmore", parish: "St. Catherine", address: "Shop #4 Palms Plaza, 23 West Trade Way, Portmore", serviceIds: ["knutsford_courier"], sourceStatus: "published_current" },
  { id: "kex_savanna_la_mar", provider: "knutsford", name: "Knutsford Savanna-La-Mar", town: "Savanna-La-Mar", parish: "Westmoreland", address: "Shop #15 Howie's Plaza, Dunbar's River, Savanna-La-Mar", serviceIds: ["knutsford_courier"], sourceStatus: "published_current" },
  { id: "kex_washington_boulevard", provider: "knutsford", name: "Knutsford Washington Boulevard", town: "Kingston", parish: "Kingston", address: "Shop 8-9 Sovereign on the Boulevard, Washington Boulevard", serviceIds: ["knutsford_courier"], sourceStatus: "published_current" },
];

export function collectionPointsForService(serviceId: string) {
  return COURIER_COLLECTION_POINTS.filter((point) => point.serviceIds.includes(serviceId));
}

export function resolveCollectionPoint(serviceId: string, pointId: string) {
  return COURIER_COLLECTION_POINTS.find((point) => point.id === pointId && point.serviceIds.includes(serviceId));
}
