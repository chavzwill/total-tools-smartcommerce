import fs from "node:fs";
import path from "node:path";

const root = path.join(process.cwd(), "api");
const files = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(?:ts|js|mjs|cjs)$/.test(entry.name)) files.push(full);
  }
}

walk(root);

const forbidden = [
  ["raw error message in response", /(?:send|json)\s*\([^;\n]*\berror\s*\.\s*message\b/i],
  ["raw error stack in response", /(?:send|json)\s*\([^;\n]*\berror\s*\.\s*stack\b/i],
  ["stack property serialized", /\bstack\s*:\s*(?:error|err|e)\s*\.\s*stack\b/i],
  ["error object serialized directly", /(?:send|json)\s*\([^;\n]*\{[^}\n]*\berror\s*:\s*(?:error|err|e)\b/i],
];

const failures = [];
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const relative = path.relative(process.cwd(), file).replaceAll(path.sep, "/");
  for (const [label, pattern] of forbidden) {
    if (pattern.test(source)) failures.push(`${relative}: ${label}`);
  }
}

if (failures.length) {
  console.error("API error exposure regression failures:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`API error exposure regression gate passed (${files.length} server files scanned).`);
