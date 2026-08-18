import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

const forbiddenFiles = [
  "vite.config.js",
  "vite.config.cjs",
  "vite.config.mjs",
  "tsconfig.tsbuildinfo",
  "tsconfig.node.tsbuildinfo",
];

for (const relative of forbiddenFiles) {
  if (fs.existsSync(path.resolve(root, relative))) {
    failures.push(`${relative}: generated or shadow build artifact must not be tracked`);
  }
}

const distPath = path.resolve(root, "dist");
if (fs.existsSync(distPath)) {
  failures.push("dist/: build output must not exist before the release build starts");
}

const gitignorePath = path.resolve(root, "../.gitignore");
if (fs.existsSync(gitignorePath)) {
  const gitignore = fs.readFileSync(gitignorePath, "utf8");
  const requiredRules = [
    "smartcommerce-ai/node_modules/",
    "smartcommerce-ai/dist/",
    "*.tsbuildinfo",
  ];

  for (const rule of requiredRules) {
    if (!gitignore.split(/\r?\n/).includes(rule)) {
      failures.push(`.gitignore: missing required build-artifact rule ${rule}`);
    }
  }
}

if (failures.length) {
  console.error("Generated artifact stability regression failures:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Generated artifact stability regression gate passed.");
