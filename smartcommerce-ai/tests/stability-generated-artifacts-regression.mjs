import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

const forbiddenFiles = [
  "vite.config.js",
  "vite.config.cjs",
  "vite.config.mjs",
  "vite.config.d.ts",
  "tsconfig.tsbuildinfo",
  "tsconfig.node.tsbuildinfo",
  "vite.log",
  "vite.err.log",
];

for (const relative of forbiddenFiles) {
  if (fs.existsSync(path.resolve(root, relative))) {
    failures.push(`${relative}: generated or shadow build artifact must not be tracked`);
  }
}

const srcPath = path.resolve(root, "src");

function walkForGeneratedSiblings(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkForGeneratedSiblings(full);
      continue;
    }

    const relative = path.relative(root, full).replaceAll(path.sep, "/");
    if (entry.name.endsWith(".js")) {
      const tsSibling = full.slice(0, -3) + ".ts";
      const tsxSibling = full.slice(0, -3) + ".tsx";
      if (fs.existsSync(tsSibling) || fs.existsSync(tsxSibling)) {
        failures.push(`${relative}: generated JavaScript shadows a TypeScript source sibling`);
      }
    }

    if (entry.name.endsWith(".d.ts")) {
      const tsSibling = full.slice(0, -5) + ".ts";
      const tsxSibling = full.slice(0, -5) + ".tsx";
      if (fs.existsSync(tsSibling) || fs.existsSync(tsxSibling)) {
        failures.push(`${relative}: generated declaration file duplicates a TypeScript source sibling`);
      }
    }
  }
}

if (fs.existsSync(srcPath)) walkForGeneratedSiblings(srcPath);

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
    "*.log",
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
