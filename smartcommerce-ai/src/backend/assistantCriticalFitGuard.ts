import type { AssistantUnderstanding } from "./assistantIntelligenceEngine.js";

export type CriticalFitClarification = {
  kind: "generator_load" | "pump_duty" | "lifting_capacity";
  question: string;
};

const generatorTrigger = /\b(generator|genset)\b/i;
const generatorCapacity = /\b\d+(?:\.\d+)?\s*(?:w|kw|kva|watts?|kilowatts?)\b/i;

const waterPumpTrigger = /\b(?:water|trash|well|submersible|transfer|dewatering)\s+pump\b|\bpump\s+(?:for\s+)?(?:water|well|tank|cistern|irrigation|dewatering)\b/i;
const pumpFlow = /\b\d+(?:\.\d+)?\s*(?:l\/?min|lit(?:er|re)s?\/?min|gpm|gallons?\/?min|m3\/?h|m³\/?h)\b/i;
const pumpHead = /\b(?:head|lift|rise|vertical|depth)\s*(?:of|is|:)?\s*\d+(?:\.\d+)?\s*(?:m|met(?:er|re)s?|ft|feet)\b|\b\d+(?:\.\d+)?\s*(?:m|met(?:er|re)s?|ft|feet)\s+(?:head|lift|rise|vertical|deep|depth)\b/i;

const liftingTrigger = /\b(forklift|telehandler|crane|hoist)\b/i;
const loadWeight = /\b\d+(?:\.\d+)?\s*(?:kg|kilograms?|t|tonnes?|tons?|lb|lbs|pounds?)\b/i;
const liftHeight = /\b(?:height|reach|lift)\s*(?:of|is|:)?\s*\d+(?:\.\d+)?\s*(?:m|met(?:er|re)s?|ft|feet)\b|\b\d+(?:\.\d+)?\s*(?:m|met(?:er|re)s?|ft|feet)\s+(?:high|height|reach|lift)\b/i;

export function criticalFitClarification(
  prompt: string,
  understanding: AssistantUnderstanding,
): CriticalFitClarification | undefined {
  const context = `${understanding.job || ""} ${prompt}`.trim();

  if (generatorTrigger.test(context) && !generatorCapacity.test(context)) {
    return {
      kind: "generator_load",
      question: "Before I recommend a generator size, what equipment or appliances need to run at the same time, and do you know their total watts, kW, or kVA?",
    };
  }

  if (waterPumpTrigger.test(context) && (!pumpFlow.test(context) || !pumpHead.test(context))) {
    return {
      kind: "pump_duty",
      question: "Before I recommend a water pump, what flow rate do you need and what vertical lift/head (including well or tank depth) must the pump overcome?",
    };
  }

  if (liftingTrigger.test(context) && (!loadWeight.test(context) || !liftHeight.test(context))) {
    return {
      kind: "lifting_capacity",
      question: "Before I recommend lifting equipment, what is the heaviest load you need to lift and what lift height or reach do you require?",
    };
  }

  return undefined;
}
