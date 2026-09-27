import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const files = [
  "src/backend/assistantComparisonEngine.ts",
  "src/backend/assistantIntelligenceEngine.ts",
  "src/backend/assistantRepairGuidance.ts",
  "src/backend/productMatchEngine.ts",
];

let checks = 0;
for (const relative of files) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  const runtimeImports = [...source.matchAll(/import\s+(?!type\b)[\s\S]*?from\s+["'](\.\.?\/[^"']+)["']/g)]
    .map((match) => match[1]);
  for (const specifier of runtimeImports) {
    checks += 1;
    if (!/\.(?:js|mjs|cjs|json)$/.test(specifier)) {
      throw new Error(`${relative} contains an extensionless runtime import that can fail under Node ESM: ${specifier}`);
    }
  }
}

if (checks === 0) throw new Error("Runtime import regression gate did not inspect any executable relative imports.");
console.log(`Intelligence runtime import regression gate passed (${checks} runtime imports verified).`);
