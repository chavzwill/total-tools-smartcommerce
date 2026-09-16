import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(root, relative));
const failures = [];
const requireFile = (relative) => {
  if (!exists(relative)) failures.push(`missing ${relative}`);
};

const requiredFiles = [
  "src/integrations/posCommerceSyncContract.ts",
  "src/server/posSyncVersioning.ts",
  "src/server/posCommerceSyncRepository.ts",
  "api/integrations/pos/v1/[...path].ts",
  "migrations/20260915_pos_commerce_sync.sql",
  "docs/POS_COMMERCE_SYNC_ARCHITECTURE.md",
];
requiredFiles.forEach(requireFile);

if (failures.length === 0) {
  const contract = read(requiredFiles[0]);
  const versioning = read(requiredFiles[1]);
  const repository = read(requiredFiles[2]);
  const route = read(requiredFiles[3]);
  const migration = read(requiredFiles[4]);
  const checks = [
    ["stable event identity", /eventId:\s*string/, contract],
    ["authoritative entity identity", /entityId:\s*string/, contract],
    ["authoritative entity version", /entityVersion:\s*number/, contract],
    ["correlation identity", /correlationId:\s*string/, contract],
    ["field authority policy", /POS_COMMERCE_FIELD_AUTHORITY/, contract],
    ["replay classification", /replayed/, versioning],
    ["stale classification", /stale/, versioning],
    ["same-version conflict classification", /conflict/, versioning],
    ["newer version classification", /apply/, versioning],
    ["repository calls atomic database function", /apply_pos_sync_event/, repository],
    ["repository never trusts display names as identity", /posEntityId/, repository],
    ["signed request verification", /timingSafeEqual[\s\S]*createHmac/, route],
    ["timestamp replay window", /MAX_SIGNATURE_AGE_SECONDS/, route],
    ["versioned event route", /\/events/, route],
    ["bounded request body", /MAX_BODY_BYTES/, route],
    ["migration has mapping ledger", /CREATE TABLE pos_sync_entities/i, migration],
    ["migration has immutable event ledger", /CREATE TABLE pos_sync_events/i, migration],
    ["migration has conflict ledger", /CREATE TABLE pos_sync_conflicts/i, migration],
    ["migration has durable outbound outbox", /CREATE TABLE pos_sync_outbox/i, migration],
    ["atomic identity serialization", /pg_advisory_xact_lock/i, migration],
    ["same-version conflicts fail closed", /same_version_conflict/, migration],
  ];
  for (const [name, pattern, source] of checks) {
    if (!pattern.test(source)) failures.push(name);
  }
}

if (failures.length) {
  console.error("POS commerce sync contract regression failed:");
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}
console.log("POS commerce sync contract regression passed.");
