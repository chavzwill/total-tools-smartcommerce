import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.join(process.cwd(), "src");
const files = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(?:ts|tsx|js|jsx)$/.test(entry.name)) files.push(full);
  }
}

walk(root);
assert.ok(files.length > 0, "client security scan found no source files");

const failures = [];
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const relative = path.relative(process.cwd(), file);

  const forbidden = [
    ["dangerouslySetInnerHTML", /dangerouslySetInnerHTML\s*=/],
    ["eval", /\beval\s*\(/],
    ["Function constructor", /\bnew\s+Function\s*\(/],
    ["javascript URL", /(?:href|src)\s*=\s*["'{`]\s*javascript\s*:/i],
    ["document.write", /\bdocument\.write\s*\(/],
  ];

  for (const [label, pattern] of forbidden) {
    if (pattern.test(source)) failures.push(`${relative}: ${label}`);
  }

  const blankTags = source.match(/<a\b[^>]*target=["']_blank["'][^>]*>/gi) || [];
  for (const tag of blankTags) {
    const rel = tag.match(/rel=["']([^"']+)["']/i)?.[1] || "";
    if (!/\b(?:noopener|noreferrer)\b/i.test(rel)) {
      failures.push(`${relative}: target=_blank link missing opener isolation`);
    }
  }
}

if (failures.length) {
  console.error("Client surface security regression failures:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Client surface security regression gate passed (${files.length} source files scanned).`);
