export type JamaicaDeliveryClass = "metro" | "regular" | "rural" | "remote";
export type TaraAreaClass = "REG" | "RUR" | "REM";

export type JamaicaDeliveryZone =
  | {
      status: "resolved";
      countryCode: "JM";
      parish: string;
      town: string;
      taraAreaClass: TaraAreaClass;
      destinationClass: JamaicaDeliveryClass;
      sameTownAsOrigin: boolean;
      sameDayEligible: boolean;
      source: "tara_where_we_go";
      sourceStatus: "published_current";
    }
  | {
      status: "unresolved";
      countryCode: "JM";
      parish: string;
      town: string;
      reasonCode: "DELIVERY_ZONE_UNRESOLVED" | "FULFILMENT_ORIGIN_UNRESOLVED";
      message: string;
      source: "tara_where_we_go";
      sourceStatus: "published_current";
    };

const PARISH_ALIASES: Record<string, string> = {
  kingston: "Kingston",
  "st andrew": "St. Andrew",
  "saint andrew": "St. Andrew",
  "st catherine": "St. Catherine",
  "saint catherine": "St. Catherine",
  clarendon: "Clarendon",
  manchester: "Manchester",
  "st elizabeth": "St. Elizabeth",
  "saint elizabeth": "St. Elizabeth",
  westmoreland: "Westmoreland",
  hanover: "Hanover",
  "st james": "St. James",
  "saint james": "St. James",
  trelawny: "Trelawny",
  "st ann": "St. Ann",
  "saint ann": "St. Ann",
  "st mary": "St. Mary",
  "saint mary": "St. Mary",
  portland: "Portland",
  "st thomas": "St. Thomas",
  "saint thomas": "St. Thomas",
};

function normalized(value: unknown) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[’']/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function parishName(value: unknown) {
  return PARISH_ALIASES[normalized(value)] || String(value || "").trim();
}

function key(parish: string, town: string) {
  return `${normalized(parish)}|${normalized(town)}`;
}

// Initial production-safe subset of TARA's published "Where We Go" REG/RUR/REM table.
// Unknown towns deliberately remain unresolved instead of inheriting a guessed parish-level rate.
// Expand this table only from an authoritative provider classification source.
const TARA_AREA_BY_LOCATION = new Map<string, TaraAreaClass>([
  // Kingston
  [key("Kingston", "Kingston"), "REG"],
  [key("Kingston", "Kingston Downtown"), "REG"],
  [key("Kingston", "Denham Town"), "REG"],
  [key("Kingston", "Vineyard Town"), "REG"],
  [key("Kingston", "Port Royal"), "RUR"],
  [key("Kingston", "Palisadoes"), "REG"],

  // St. Andrew
  [key("St. Andrew", "Half Way Tree"), "REG"],
  [key("St. Andrew", "New Kingston"), "REG"],
  [key("St. Andrew", "Liguanea"), "REG"],
  [key("St. Andrew", "Constant Spring"), "REG"],
  [key("St. Andrew", "Manor Park"), "REG"],
  [key("St. Andrew", "Papine"), "REG"],
  [key("St. Andrew", "Harbour View"), "REG"],
  [key("St. Andrew", "Red Hills"), "REG"],
  [key("St. Andrew", "Irish Town"), "RUR"],
  [key("St. Andrew", "Lawrence Tavern"), "RUR"],
  [key("St. Andrew", "Mavis Bank"), "REM"],
  [key("St. Andrew", "Newcastle"), "REM"],
  [key("St. Andrew", "Clydesdale"), "REM"],
  [key("St. Andrew", "Guava Ridge"), "REM"],

  // St. Catherine
  [key("St. Catherine", "Portmore"), "REG"],
  [key("St. Catherine", "Greater Portmore"), "REG"],
  [key("St. Catherine", "Spanish Town"), "REG"],
  [key("St. Catherine", "Old Harbour"), "REG"],
  [key("St. Catherine", "Old Harbour Bay"), "REG"],
  [key("St. Catherine", "Linstead"), "REG"],
  [key("St. Catherine", "Bog Walk"), "REG"],
  [key("St. Catherine", "Ewarton"), "REG"],
  [key("St. Catherine", "Hellshire"), "REG"],
  [key("St. Catherine", "Sligoville"), "RUR"],
  [key("St. Catherine", "Guys Hill"), "RUR"],
  [key("St. Catherine", "Above Rocks"), "REM"],
  [key("St. Catherine", "Troja"), "REM"],

  // Clarendon
  [key("Clarendon", "May Pen"), "REG"],
  [key("Clarendon", "Clarendon Park"), "REG"],
  [key("Clarendon", "Hayes"), "REG"],
  [key("Clarendon", "Spaldings"), "REG"],
  [key("Clarendon", "Chapelton"), "RUR"],
  [key("Clarendon", "Frankfield"), "RUR"],
  [key("Clarendon", "Rocky Point"), "RUR"],
  [key("Clarendon", "Mocho"), "REM"],
  [key("Clarendon", "Thompson Town"), "REM"],

  // Portland
  [key("Portland", "Port Antonio"), "REG"],
  [key("Portland", "Buff Bay"), "REG"],
  [key("Portland", "Hope Bay"), "REG"],
  [key("Portland", "Long Bay"), "RUR"],
  [key("Portland", "Boston Bay"), "RUR"],
  [key("Portland", "Manchioneal"), "RUR"],
  [key("Portland", "Moore Town"), "REM"],
  [key("Portland", "Hagley Gap"), "REM"],
  [key("Portland", "Silver Hill"), "REM"],

  // St. Mary
  [key("St. Mary", "Port Maria"), "REG"],
  [key("St. Mary", "Annotto Bay"), "REG"],
  [key("St. Mary", "Oracabessa"), "REG"],
  [key("St. Mary", "Highgate"), "REG"],
  [key("St. Mary", "Gayle"), "RUR"],
  [key("St. Mary", "Islington"), "RUR"],
  [key("St. Mary", "Lucky Hill"), "REM"],
  [key("St. Mary", "Enfield"), "REM"],

  // St. Thomas
  [key("St. Thomas", "Morant Bay"), "REG"],
  [key("St. Thomas", "Yallahs"), "REG"],
  [key("St. Thomas", "Bull Bay"), "REG"],
  [key("St. Thomas", "Bath"), "RUR"],
  [key("St. Thomas", "Seaforth"), "RUR"],
  [key("St. Thomas", "Golden Grove"), "RUR"],

  // Major western/central towns used by TARA service eligibility.
  [key("Manchester", "Mandeville"), "REG"],
  [key("St. James", "Montego Bay"), "REG"],
  [key("Trelawny", "Falmouth"), "REG"],
  [key("Westmoreland", "Negril"), "REG"],
  [key("Westmoreland", "Savanna-La-Mar"), "REG"],
  [key("Westmoreland", "Savannah-La-Mar"), "REG"],
  [key("St. Ann", "Ocho Rios"), "REG"],
  [key("St. Elizabeth", "Black River"), "REG"],
  [key("St. Elizabeth", "Santa Cruz"), "REG"],
  [key("St. Elizabeth", "Accompong"), "REM"],
  [key("St. Elizabeth", "Aberdeen"), "REM"],
]);

const KINGSTON_SAME_DAY_DESTINATIONS = new Set([
  "ocho rios", "mandeville", "montego bay", "falmouth", "negril", "savanna la mar", "savannah la mar",
  "may pen", "portmore", "spanish town", "santa cruz", "kingston",
]);

const SAME_DAY_TO_KINGSTON_ORIGINS = new Set([
  "montego bay", "ocho rios", "mandeville", "portmore", "spanish town", "may pen", "kingston",
]);

function configuredOrigin() {
  const town = String(process.env.SMARTCOMMERCE_FULFILMENT_ORIGIN_TOWN || "").trim();
  const parish = parishName(process.env.SMARTCOMMERCE_FULFILMENT_ORIGIN_PARISH || "");
  return { town, parish };
}

function isKingstonMetroTown(town: string, parish: string) {
  const p = normalized(parish);
  const t = normalized(town);
  return (p === "kingston" || p === "st andrew") && [
    "kingston", "kingston downtown", "new kingston", "half way tree", "cross roads", "liguanea",
  ].includes(t);
}

export function resolveJamaicaDeliveryZone(input: {
  town?: string;
  parish?: string;
  originTown?: string;
  originParish?: string;
}): JamaicaDeliveryZone {
  const town = String(input.town || "").trim();
  const parish = parishName(input.parish);
  const origin = input.originTown || input.originParish
    ? { town: String(input.originTown || "").trim(), parish: parishName(input.originParish) }
    : configuredOrigin();

  const area = TARA_AREA_BY_LOCATION.get(key(parish, town));
  if (!town || !parish || !area) {
    return {
      status: "unresolved",
      countryCode: "JM",
      parish,
      town,
      reasonCode: "DELIVERY_ZONE_UNRESOLVED",
      message: "This delivery area has not yet been matched to an authoritative courier zone. Logistics staff must verify the destination before pricing.",
      source: "tara_where_we_go",
      sourceStatus: "published_current",
    };
  }

  const originConfigured = Boolean(origin.town && origin.parish);
  const sameTownAsOrigin = originConfigured && normalized(origin.town) === normalized(town) && normalized(origin.parish) === normalized(parish);
  const destinationClass: JamaicaDeliveryClass = area === "REM" ? "remote" : area === "RUR" ? "rural" : sameTownAsOrigin ? "metro" : "regular";

  let sameDayEligible = false;
  if (originConfigured) {
    const originTown = normalized(origin.town);
    const destinationTown = normalized(town);
    const originIsKingston = isKingstonMetroTown(origin.town, origin.parish);
    const destinationIsKingston = isKingstonMetroTown(town, parish);
    sameDayEligible =
      (originIsKingston && KINGSTON_SAME_DAY_DESTINATIONS.has(destinationTown)) ||
      (destinationIsKingston && SAME_DAY_TO_KINGSTON_ORIGINS.has(originTown)) ||
      (sameTownAsOrigin && (originTown === "kingston" || originTown === "montego bay"));
  }

  return {
    status: "resolved",
    countryCode: "JM",
    parish,
    town,
    taraAreaClass: area,
    destinationClass,
    sameTownAsOrigin,
    sameDayEligible,
    source: "tara_where_we_go",
    sourceStatus: "published_current",
  };
}
