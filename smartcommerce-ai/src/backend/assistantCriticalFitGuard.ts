import type { AssistantUnderstanding } from "./assistantIntelligenceEngine.js";
import type { AssistantConversationTurn } from "./platformBackendTypes.js";

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

function boundedConversation(history: AssistantConversationTurn[] | undefined) {
  return (history || [])
    .filter((turn) => (turn.role === "user" || turn.role === "assistant") && typeof turn.content === "string")
    .slice(-6)
    .map((turn) => turn.content.trim().slice(0, 600))
    .filter(Boolean)
    .join(" ");
}

export function criticalFitClarification(
  prompt: string,
  understanding: AssistantUnderstanding,
  history?: AssistantConversationTurn[],
): CriticalFitClarification | undefined {
  const context = `${boundedConversation(history)} ${understanding.job || ""} ${prompt}`.trim();

  if (generatorTrigger.test(context) && !generatorCapacity.test(context)) {
    return {
      kind: "generator_load",
      question: "Before I recommend a generator size, what equipment or appliances need to run at the same time, and do you know their total watts, kW, or kVA?",
    };
  }

  if (waterPumpTrigger.test(context)) {
    const hasFlow = pumpFlow.test(context);
    const hasHead = pumpHead.test(context);
    if (!hasFlow || !hasHead) {
      return {
        kind: "pump_duty",
        question: !hasFlow && !hasHead
          ? "Before I recommend a water pump, what flow rate do you need and what vertical lift/head (including well or tank depth) must the pump overcome?"
          : !hasFlow
            ? "I have the lift/head requirement. What flow rate do you need in GPM, litres per minute, or another known unit?"
            : "I have the flow requirement. What vertical lift/head, including well or tank depth, must the pump overcome?",
      };
    }
  }

  if (liftingTrigger.test(context)) {
    const hasWeight = loadWeight.test(context);
    const hasHeight = liftHeight.test(context);
    if (!hasWeight || !hasHeight) {
      return {
        kind: "lifting_capacity",
        question: !hasWeight && !hasHeight
          ? "Before I recommend lifting equipment, what is the heaviest load you need to lift and what lift height or reach do you require?"
          : !hasWeight
            ? "I have the lift height/reach. What is the heaviest load you need to lift?"
            : "I have the load weight. What lift height or reach do you require?",
      };
    }
  }

  return undefined;
}
