import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const excludedDirs = new Set(["node_modules", "dist", ".git", ".vercel"]);
const excludedFiles = new Set(["package-lock.json", "security-secret-hygiene-regression.mjs"]);
const forbiddenNames = new Set([
  "id_rsa",
  "id_ed25519",
]);

const secretPatterns = [
  ["private key material", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ["Stripe live secret", /\bsk_live_[A-Za-z0-9]{20,}\b/],
  ["OpenAI secret key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{30,}\b/],
  ["database URL with embedded credentials", /\b(?:postgres(?:ql)?|mysql):\/\/[^\s:@]+:[^\s@]+@/i],
];

const textExtensions = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md", ".yml", ".yaml", ".html", ".css", ".scss", ".txt", ".sql"
]);

const failures = [];

const isForbiddenSecretFilename = (name) =>
  forbiddenNames.has(name) || (/^\.env(?:\..+)?$/.test(name) && name !== ".env.example");

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (excludedDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const relative = path.relative(root, full).replaceAll(path.sep, "/");

    if (entry.isDirectory()) {
      walk(full);
      continue;
    }

    if (isForbiddenSecretFilename(entry.name)) {
      failures.push(`${relative}: forbidden secret-bearing filename`);
      continue;
    }

    if (excludedFiles.has(entry.name) || !textExtensions.has(path.extname(entry.name).toLowerCase())) continue;

    let source;
    try {
      source = fs.readFileSync(full, "utf8");
    } catch {
      continue;
    }

    for (const [label, pattern] of secretPatterns) {
      if (pattern.test(source)) failures.push(`${relative}: ${label}`);
    }
  }
}

walk(root);

if (failures.length) {
  console.error("Repository secret hygiene regression failures:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Repository secret hygiene regression gate passed.");
