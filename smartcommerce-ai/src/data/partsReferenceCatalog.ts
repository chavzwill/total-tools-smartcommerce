export type ReferenceFitmentSource = {
  title: string;
  url: string;
  sourceType: "manufacturer" | "approved_distributor" | "trusted_catalogue";
  checkedAt: string;
};

export type ReferenceFitmentPart = {
  partNumber: string;
  name: string;
  assembly: string;
  reference?: string;
  parentPartNumber?: string;
};

export type ReferenceFitmentModel = {
  brand: string;
  equipmentType: string;
  model: string;
  variant?: string;
  source: ReferenceFitmentSource;
  parts: ReferenceFitmentPart[];
};

/**
 * Supplementary fitment relationships for navigation and identification.
 *
 * These records do not create sellable products, prices, or stock claims.
 * Commerce remains POS/provider-authoritative. A reference part becomes
 * commercially actionable only when a provider product with matching governed
 * fitment data is present.
 */
export const referenceFitmentCatalog: ReferenceFitmentModel[] = [
  {
    brand: "STIHL",
    equipmentType: "Chainsaws",
    model: "MS 362",
    variant: "MS362 & C",
    source: {
      title: "DIY Spare Parts — STIHL MS 362 parts diagrams",
      url: "https://www.diyspareparts.com/parts/stihl/diagrams/ms-362-c/",
      sourceType: "trusted_catalogue",
      checkedAt: "2026-10-11",
    },
    parts: [
      { assembly: "AV System", reference: "1", partNumber: "1140 791 2800", name: "Stop buffer" },
      { assembly: "AV System", reference: "2", partNumber: "1140 792 2900", name: "AV mount" },
      { assembly: "AV System", reference: "3", partNumber: "1140 791 3100", name: "Spring" },

      { assembly: "Chain Brake", reference: "1", partNumber: "1128 160 5000", name: "Lever" },
      { assembly: "Chain Brake", reference: "2", partNumber: "1121 162 5010", name: "Lever" },
      { assembly: "Chain Brake", reference: "3", partNumber: "0000 997 0628", name: "Helical spring" },
      { assembly: "Chain Brake", reference: "6", partNumber: "1135 160 5400", name: "Brake band" },
      { assembly: "Chain Brake", reference: "8", partNumber: "1135 160 5500", name: "Tension spring" },
      { assembly: "Chain Brake", reference: "19", partNumber: "1140 021 1100", name: "Cover" },

      { assembly: "Cylinder", reference: "1", partNumber: "1140 020 1208", name: "Cylinder with piston 47 mm" },
      { assembly: "Cylinder", reference: "2", partNumber: "1140 030 2002", name: "Piston 47 mm" },
      { assembly: "Cylinder", reference: "3", partNumber: "1140 034 3008", name: "Piston ring 47 x 1.2 mm" },

      { assembly: "Ignition System", reference: "1", partNumber: "1140 400 1209", name: "Flywheel" },
      { assembly: "Ignition System", reference: "3", partNumber: "0000 955 0802", name: "Collar nut" },
      { assembly: "Ignition System", reference: "7", partNumber: "1140 400 1302", name: "Ignition module" },

      { assembly: "Oil Pump", reference: "1", partNumber: "1135 640 3200", name: "Oil pump" },
      { assembly: "Oil Pump", reference: "2", partNumber: "0000 958 0518", name: "Washer" },
      { assembly: "Oil Pump", reference: "3", partNumber: "0000 997 0615", name: "Helical spring" },

      { assembly: "Rewind Starter", reference: "1", partNumber: "1140 080 1800", name: "Fan housing" },
      { assembly: "Rewind Starter", reference: "2", partNumber: "1110 084 9102", name: "Bushing" },
      { assembly: "Rewind Starter", reference: "3", partNumber: "0000 958 0607", name: "Washer" },

      { assembly: "Tank Housing", reference: "1", partNumber: "1140 350 0825", name: "Tank housing" },
      { assembly: "Tank Housing", reference: "4", partNumber: "0000 350 5800", name: "Tank vent" },
      { assembly: "Tank Housing", reference: "5", partNumber: "1140 358 7706", name: "Hose" },
      { assembly: "Tank Housing", reference: "6", partNumber: "0000 350 3518", name: "Pickup body" },
      { assembly: "Tank Housing", reference: "7", partNumber: "0000 350 0533", name: "Filler cap" },
      { assembly: "Tank Housing", reference: "8", partNumber: "9645 948 7734", name: "O-ring 25 x 3.5" },
      { assembly: "Tank Housing", reference: "10", partNumber: "1140 350 2701", name: "Fuel hose" },
      { assembly: "Tank Housing", reference: "11", partNumber: "4224 122 3900", name: "Elbow connector" },
    ],
  },
];
