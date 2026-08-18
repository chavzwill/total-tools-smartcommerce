import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const scanRoots = ["api", "src/server", "src/platform"].map((entry) => path.join(root, entry));
const files = [];

function walk(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) files.push(full);
  }
}

for (const directory of scanRoots) walk(directory);
if (!files.length) throw new Error("server log hygiene scan found no source files");

const failures = [];
const sensitiveIdentifiers = [
  "password",
  "token",
  "cookie",
  "authorization",
  "headers",
  "input",
  "body",
  "credentials",
  "secret",
  "request",
];

function removeStringLiterals(value) {
  return value
    .replace(/`(?:\\.|[^`])*`/gs, "")
    .replace(/"(?:\\.|[^"\\])*"/gs, "")
    .replace(/'(?:\\.|[^'\\])*'/gs, "");
}

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const relative = path.relative(root, file).replaceAll(path.sep, "/");
  const calls = source.matchAll(/console\.(?:log|info|warn|error|debug)\s*\(([\s\S]*?)\)\s*;?/g);

  for (const match of calls) {
    const rawArgs = match[1] || "";
    const args = removeStringLiterals(rawArgs);

    if (/\bprocess\.env\b/.test(args)) {
      failures.push(`${relative}: console call references process.env`);
      continue;
    }

    for (const identifier of sensitiveIdentifiers) {
      const pattern = new RegExp(`\\b${identifier}\\b`, "i");
      if (pattern.test(args)) {
        failures.push(`${relative}: console call references sensitive identifier ${identifier}`);
        break;
      }
    }
  }
}

if (failures.length) {
  console.error("Server log hygiene regression failures:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Server log hygiene regression gate passed (${files.length} server files scanned).`);
