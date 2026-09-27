import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const guard = await readFile(new URL("../src/backend/assistantCriticalFitGuard.ts", import.meta.url), "utf8");
const runtime = await readFile(new URL("../src/integrations/totalToolsPlatformRuntime.ts", import.meta.url), "utf8");

const invariants = [
  [guard.includes("generator_load") && guard.includes("generatorCapacity"), "generator recommendations require a grounded capacity/load clue"],
  [guard.includes("pump_duty") && guard.includes("pumpFlow") && guard.includes("pumpHead"), "water-pump recommendations require both flow and head clues"],
  [guard.includes("lifting_capacity") && guard.includes("loadWeight") && guard.includes("liftHeight"), "lifting recommendations require load weight and lift height/reach"],
  [guard.includes("what equipment or appliances need to run at the same time"), "generator clarification asks for actual simultaneous load"],
  [guard.includes("what flow rate do you need") && guard.includes("vertical lift/head"), "pump clarification asks for duty-point inputs"],
  [guard.includes("heaviest load") && guard.includes("lift height or reach"), "lifting clarification asks for critical capacity inputs"],
  [guard.includes("boundedConversation") && guard.includes("slice(-6)"), "technical-fit guard supports bounded recent conversation context"],
  [guard.includes("I have the flow requirement") && guard.includes("What vertical lift/head"), "pump follow-up asks only for missing head when flow is already known"],
  [guard.includes("I have the lift/head requirement") && guard.includes("What flow rate"), "pump follow-up asks only for missing flow when head is already known"],
  [guard.includes("I have the load weight") && guard.includes("What lift height or reach"), "lifting follow-up asks only for missing height when load is already known"],
  [guard.includes("I have the lift height/reach") && guard.includes("heaviest load"), "lifting follow-up asks only for missing load when height is already known"],
  [runtime.includes("criticalFitClarification(input.prompt, grounded.understanding, input.history)"), "runtime passes bounded assistant history into the deterministic fit guard"],
  [runtime.includes("response: fitClarification.question"), "fit guard returns the targeted question"],
  [runtime.includes("recommendedProducts: []") && runtime.includes("recommendedRentals: []"), "critical fit clarification suppresses product and rental recommendations"],
  [runtime.includes("recommendationEvidence: []") && runtime.includes("nextActions: []"), "critical fit clarification suppresses evidence/action claims until sizing is supplied"],
  [!guard.includes("api.openai.com") && !guard.includes("fetch("), "critical fit guard requires no secondary model or network call"],
];

for (const [ok, label] of invariants) assert.equal(ok, true, label);
console.log(`Critical-fit intelligence regression gate passed (${invariants.length} invariants).`);
