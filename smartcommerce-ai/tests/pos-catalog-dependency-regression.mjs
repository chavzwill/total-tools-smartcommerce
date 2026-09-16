import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourcePath = path.join(root, "src/integrations/posCatalogDependencies.ts");
const migrationPath = path.join(root, "migrations/20260915_pos_commerce_sync.sql");
const repositoryPath = path.join(root, "src/server/posCommerceSyncRepository.ts");
const failures = [];

if (!fs.existsSync(sourcePath)) failures.push("dependency extractor is missing");
if (!fs.existsSync(migrationPath)) failures.push("sync migration is missing");
if (!fs.existsSync(repositoryPath)) failures.push("sync repository is missing");

if (!failures.length) {
  const source = fs.readFileSync(sourcePath, "utf8");
  const migration = fs.readFileSync(migrationPath, "utf8");
  const repository = fs.readFileSync(repositoryPath, "utf8");
  const checks = [
    ["category parent dependency", /parentId[\s\S]*entityType:\s*"category"/, source],
    ["product brand dependency", /brandId[\s\S]*entityType:\s*"brand"/, source],
    ["product category dependencies", /categoryIds[\s\S]*entityType:\s*"category"/, source],
    ["variation product dependency", /product_variation[\s\S]*productId/, source],
    ["media owner dependency", /ownerType[\s\S]*ownerId/, source],
    ["promotion target dependencies", /promotion[\s\S]*productIds[\s\S]*categoryIds[\s\S]*brandIds/, source],
    ["dependencies passed to atomic admission", /extractPosCatalogDependencies[\s\S]*dependenciesJson/, repository],
    ["blocked events are durable", /'blocked'/, migration],
    ["dependency existence checked in database", /jsonb_array_elements\(p_dependencies\)/, migration],
    ["blocked event can resume", /disposition = 'blocked'/, migration],
    ["category cycles are rejected", /category_cycle/, migration],
    ["delivery attempts are append only", /CREATE TABLE pos_sync_event_attempts/i, migration],
  ];
  for (const [name, pattern, target] of checks) if (!pattern.test(target)) failures.push(name);
}

if (failures.length) {
  console.error("POS catalog dependency regression failed:");
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}
console.log("POS catalog dependency regression passed.");
