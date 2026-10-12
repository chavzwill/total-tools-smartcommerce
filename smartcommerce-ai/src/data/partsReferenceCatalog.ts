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
  source?: ReferenceFitmentSource;
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
const ms362Sources = {
  avSystem: {
    title: "DIY Spare Parts — STIHL MS 362 AV System",
    url: "https://www.diyspareparts.com/parts/stihl/diagrams/ms-362-c/5b5c4919-ef94-48f4-87b8/",
    sourceType: "trusted_catalogue",
    checkedAt: "2026-10-11",
  },
  chainBrake: {
    title: "DIY Spare Parts — STIHL MS 362 Chain Brake",
    url: "https://www.diyspareparts.com/parts/stihl/diagrams/ms-362-c/ca6d3d4b-20fb-4ce0-8293/",
    sourceType: "trusted_catalogue",
    checkedAt: "2026-10-11",
  },
  cylinder: {
    title: "DIY Spare Parts — STIHL MS 362 Cylinder",
    url: "https://www.diyspareparts.com/parts/stihl/diagrams/ms-362-c/25cceb17-531a-4165-863b/",
    sourceType: "trusted_catalogue",
    checkedAt: "2026-10-11",
  },
  ignition: {
    title: "DIY Spare Parts — STIHL MS 362 Ignition System",
    url: "https://www.diyspareparts.com/parts/stihl/diagrams/ms-362-c/afd54f39-a7bb-4836-9857/",
    sourceType: "trusted_catalogue",
    checkedAt: "2026-10-11",
  },
  oilPump: {
    title: "DIY Spare Parts — STIHL MS 362 Oil Pump",
    url: "https://www.diyspareparts.com/parts/stihl/diagrams/ms-362-c/2bdfceea-87e2-4d89-917c/",
    sourceType: "trusted_catalogue",
    checkedAt: "2026-10-11",
  },
  rewindStarter: {
    title: "DIY Spare Parts — STIHL MS 362 Rewind Starter",
    url: "https://www.diyspareparts.com/parts/stihl/diagrams/ms-362-c/2b7a17ea-3888-4343-97b5/",
    sourceType: "trusted_catalogue",
    checkedAt: "2026-10-11",
  },
  tankHousing: {
    title: "DIY Spare Parts — STIHL MS 362 Tank Housing",
    url: "https://www.diyspareparts.com/parts/stihl/diagrams/ms-362-c/34394e16-0675-4442-9722/",
    sourceType: "trusted_catalogue",
    checkedAt: "2026-10-11",
  },
} satisfies Record<string, ReferenceFitmentSource>;

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
      { source: ms362Sources.avSystem, assembly: "AV System", reference: "1", partNumber: "1140 791 2800", name: "Stop buffer" },
      { source: ms362Sources.avSystem, assembly: "AV System", reference: "2", partNumber: "1140 792 2900", name: "AV mount" },
      { source: ms362Sources.avSystem, assembly: "AV System", reference: "3", partNumber: "1140 791 3100", name: "Spring" },

      { source: ms362Sources.chainBrake, assembly: "Chain Brake", reference: "1", partNumber: "1128 160 5000", name: "Lever" },
      { source: ms362Sources.chainBrake, assembly: "Chain Brake", reference: "2", partNumber: "1121 162 5010", name: "Lever" },
      { source: ms362Sources.chainBrake, assembly: "Chain Brake", reference: "3", partNumber: "0000 997 0628", name: "Helical spring" },
      { source: ms362Sources.chainBrake, assembly: "Chain Brake", reference: "6", partNumber: "1135 160 5400", name: "Brake band" },
      { source: ms362Sources.chainBrake, assembly: "Chain Brake", reference: "8", partNumber: "1135 160 5500", name: "Tension spring" },
      { source: ms362Sources.chainBrake, assembly: "Chain Brake", reference: "19", partNumber: "1140 021 1100", name: "Cover" },

      { source: ms362Sources.cylinder, assembly: "Cylinder", reference: "1", partNumber: "1140 020 1208", name: "Cylinder with piston 47 mm" },
      { source: ms362Sources.cylinder, assembly: "Cylinder", reference: "2", partNumber: "1140 030 2002", name: "Piston 47 mm" },
      { source: ms362Sources.cylinder, assembly: "Cylinder", reference: "3", partNumber: "1140 034 3008", name: "Piston ring 47 x 1.2 mm" },

      { source: ms362Sources.ignition, assembly: "Ignition System", reference: "1", partNumber: "1140 400 1209", name: "Flywheel" },
      { source: ms362Sources.ignition, assembly: "Ignition System", reference: "3", partNumber: "0000 955 0802", name: "Collar nut" },
      { source: ms362Sources.ignition, assembly: "Ignition System", reference: "7", partNumber: "1140 400 1302", name: "Ignition module" },

      { source: ms362Sources.oilPump, assembly: "Oil Pump", reference: "1", partNumber: "1135 640 3200", name: "Oil pump" },
      { source: ms362Sources.oilPump, assembly: "Oil Pump", reference: "2", partNumber: "0000 958 0518", name: "Washer" },
      { source: ms362Sources.oilPump, assembly: "Oil Pump", reference: "3", partNumber: "0000 997 0615", name: "Helical spring" },

      { source: ms362Sources.rewindStarter, assembly: "Rewind Starter", reference: "1", partNumber: "1140 080 1800", name: "Fan housing" },
      { source: ms362Sources.rewindStarter, assembly: "Rewind Starter", reference: "2", partNumber: "1110 084 9102", name: "Bushing" },
      { source: ms362Sources.rewindStarter, assembly: "Rewind Starter", reference: "3", partNumber: "0000 958 0607", name: "Washer" },

      { source: ms362Sources.tankHousing, assembly: "Tank Housing", reference: "1", partNumber: "1140 350 0825", name: "Tank housing" },
      { source: ms362Sources.tankHousing, assembly: "Tank Housing", reference: "4", partNumber: "0000 350 5800", name: "Tank vent" },
      { source: ms362Sources.tankHousing, assembly: "Tank Housing", reference: "5", partNumber: "1140 358 7706", name: "Hose" },
      { source: ms362Sources.tankHousing, assembly: "Tank Housing", reference: "6", partNumber: "0000 350 3518", name: "Pickup body" },
      { source: ms362Sources.tankHousing, assembly: "Tank Housing", reference: "7", partNumber: "0000 350 0533", name: "Filler cap" },
      { source: ms362Sources.tankHousing, assembly: "Tank Housing", reference: "8", partNumber: "9645 948 7734", name: "O-ring 25 x 3.5" },
      { source: ms362Sources.tankHousing, assembly: "Tank Housing", reference: "10", partNumber: "1140 350 2701", name: "Fuel hose" },
      { source: ms362Sources.tankHousing, assembly: "Tank Housing", reference: "11", partNumber: "4224 122 3900", name: "Elbow connector" },
    ],
  },
];
