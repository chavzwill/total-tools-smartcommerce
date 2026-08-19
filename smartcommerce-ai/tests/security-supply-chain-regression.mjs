import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));

assert.equal(lock.lockfileVersion, 3, "package-lock must remain on lockfileVersion 3");
assert.equal(lock.requires, true, "package-lock dependency graph must remain enabled");
assert.ok(lock.packages && typeof lock.packages === "object", "package-lock packages graph is missing");

let registryPackages = 0;
for (const [name, entry] of Object.entries(lock.packages)) {
  if (!entry || typeof entry !== "object") continue;
  const resolved = typeof entry.resolved === "string" ? entry.resolved : "";

  assert.ok(!resolved.startsWith("http:"), `${name || "root"} uses an insecure HTTP dependency source`);
  assert.ok(!/^git(?:\+|:)/i.test(resolved), `${name || "root"} uses an unpinned Git dependency source`);
  assert.ok(!resolved.startsWith("file:"), `${name || "root"} uses a local file dependency source`);

  if (resolved.startsWith("https://registry.npmjs.org/")) {
    registryPackages += 1;
    assert.match(String(entry.integrity || ""), /^sha512-[A-Za-z0-9+/=]+$/, `${name} is missing SHA-512 package integrity metadata`);
  }
}

assert.ok(registryPackages > 0, "no npm registry packages were verified");
console.log(`Supply-chain security regression gate passed: ${registryPackages} registry packages verified.`);
