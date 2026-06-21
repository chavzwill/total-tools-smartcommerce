import rentalImage from "../assets/services/equipment-rentals.jpg";
import generatorImage from "../assets/generator-optimized.jpg";
import excavatorImage from "../assets/products/mini-excavator.jpg";
import forkliftImage from "../assets/products/forklift.jpg";
import concreteMixerImage from "../assets/products/concrete-mixer.jpg";
import backhoeImage from "../assets/rentals/backhoe.jpg";
import boomLiftImage from "../assets/rentals/boom-lift.jpg";
import scissorLiftImage from "../assets/rentals/scissor-lift.jpg";
import telehandlerImage from "../assets/rentals/telehandler.jpg";
import rollerImage from "../assets/rentals/road-roller.jpg";
import skidSteerImage from "../assets/rentals/skid-steer.jpg";
import lightingTowerImage from "../assets/rentals/lighting-tower.jpg";
import waterPumpImage from "../assets/rentals/water-pump.jpg";
import type { RentalItem } from "../types";

const equipment = [
  ["excavator", "CAT 320 Excavator", "Earthmoving", 95000, "Available tomorrow", "22,000 kg", "7.2 m"],
  ["backhoe", "JCB 3CX Backhoe Loader", "Earthmoving", 78000, "Available June 24", "8,070 kg", "5.5 m"],
  ["forklift", "Toyota 2.5T Forklift", "Material Handling", 42000, "3 units available", "2,500 kg", "4.7 m"],
  ["boom-lift", "JLG 45ft Boom Lift", "Access", 52000, "Available today", "230 kg basket", "13.7 m"],
  ["scissor-lift", "Genie 26ft Scissor Lift", "Access", 34000, "2 units available", "454 kg basket", "9.9 m"],
  ["telehandler", "JCB 540-170 Telehandler", "Material Handling", 69000, "Available June 25", "4,000 kg", "17 m"],
  ["roller", "Bomag 5T Smooth Drum Roller", "Compaction", 61000, "Available this week", "5,000 kg", "1.68 m drum"],
  ["skid-steer", "Bobcat S650 Skid Steer", "Earthmoving", 49000, "Available tomorrow", "1,220 kg", "3.1 m"],
  ["concrete-mixer", "Belle 150L Concrete Mixer", "Concrete", 8500, "8 units available", "90 L mix", "Electric"],
  ["lighting-tower", "Atlas Copco LED Lighting Tower", "Site Services", 18000, "Available today", "4 x 350W LED", "8 m mast"],
  ["site-generator", "60 kVA Silent Site Generator", "Power", 26000, "Available today", "60 kVA", "Diesel"],
  ["water-pump", "3 in Diesel Trash Water Pump", "Pumps", 12000, "5 units available", "1,200 L/min", "7 m suction"]
] as const;

const rentalImages: Record<string, string> = {
  excavator: excavatorImage,
  backhoe: backhoeImage,
  forklift: forkliftImage,
  "boom-lift": boomLiftImage,
  "scissor-lift": scissorLiftImage,
  telehandler: telehandlerImage,
  roller: rollerImage,
  "skid-steer": skidSteerImage,
  "concrete-mixer": concreteMixerImage,
  "lighting-tower": lightingTowerImage,
  "site-generator": generatorImage,
  "water-pump": waterPumpImage
};

export const rentals: RentalItem[] = equipment.map(([id, name, category, dailyRate, availability, capacity, reach]) => ({
  id, name, category, dailyRate, weeklyRate: dailyRate * 5, monthlyRate: dailyRate * 16,
  availability, branchAvailability: "Branch availability: Ocho Rios, Kingston, Drax Hall",
  image: rentalImages[id] || rentalImage,
  description: `Commercial-grade ${name.toLowerCase()} maintained by Total Tools Jamaica and ready for islandwide delivery.`,
  specs: { Capacity: capacity, "Reach / power": reach, Delivery: "Islandwide", Support: "24/7 fleet support" }
}));

export const findRental = (id: string) => rentals.find((rental) => rental.id === id);
