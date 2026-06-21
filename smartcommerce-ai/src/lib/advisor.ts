import { AdvisorResponse, Product } from "../types";
import { products } from "../data/products";

const findProducts = (terms: string[]) =>
  products.filter((product) =>
    product.tags.some((tag) => terms.some((term) => tag.includes(term)))
  );

const firstMatches = (matches: Product[], count: number) => matches.slice(0, count);

export const demoPrompts = [
  "I need a generator for my farm with no electricity",
  "I need to rent a jackhammer next Thursday",
  "My drill is not working and needs repair",
  "I have a picture of a fitting I need",
  "I need garbage bags for a retail store"
];

export function getAdvisorResponse(prompt: string): AdvisorResponse {
  const text = prompt.toLowerCase();

  if (text.includes("generator") || text.includes("farm") || text.includes("electricity")) {
    const matches = findProducts(["generator", "power", "farm"]);
    return {
      needSummary: "You need dependable off-grid power that can handle farm loads and site conditions.",
      recommendedProducts: firstMatches(matches, 2),
      addOns: firstMatches(findProducts(["lead", "safety"]), 2),
      nextAction: "Compare generator wattage, then request in-store assistance for load sizing."
    };
  }

  if (text.includes("jackhammer") || text.includes("rent") || text.includes("rental")) {
    return {
      needSummary: "You want demolition equipment reserved for a specific date.",
      recommendedProducts: firstMatches(findProducts(["jackhammer", "concrete"]), 2),
      addOns: firstMatches(findProducts(["safety", "bits"]), 2),
      nextAction: "Use the rental section to reserve the jackhammer and add PPE before pickup."
    };
  }

  if (text.includes("drill") || text.includes("repair") || text.includes("not working")) {
    return {
      needSummary: "Your drill needs service, and the fault may involve the battery, trigger, or chuck.",
      recommendedProducts: firstMatches(findProducts(["drill", "battery"]), 2),
      addOns: firstMatches(findProducts(["battery", "safety"]), 2),
      nextAction: "Schedule a repair assessment and bring the battery and charger with the drill."
    };
  }

  if (text.includes("picture") || text.includes("photo") || text.includes("fitting")) {
    return {
      needSummary: "You want to identify a fitting from a picture before choosing the right size.",
      recommendedProducts: firstMatches(findProducts(["fitting", "brass"]), 2),
      addOns: firstMatches(findProducts(["gauge", "measure"]), 2),
      nextAction: "Try the image search demo and bring the old fitting in-store for size confirmation."
    };
  }

  if (text.includes("garbage") || text.includes("bags") || text.includes("retail")) {
    return {
      needSummary: "You need commercial cleaning supplies suitable for a retail store.",
      recommendedProducts: firstMatches(findProducts(["garbage", "bags", "retail"]), 2),
      addOns: firstMatches(findProducts(["liner", "cleaning"]), 2),
      nextAction: "Select a bulk pack size and request assistance for recurring store supply planning."
    };
  }

  return {
    needSummary: "You are looking for the right product, rental, or repair path for a job.",
    recommendedProducts: firstMatches(products, 2),
    addOns: firstMatches(products.slice(2), 2),
    nextAction: "Choose a demo prompt or describe the job so the advisor can narrow the options."
  };
}
