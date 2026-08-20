import type { PosAdapter, PosAdapterContext } from "../platform";
import type { RepairType } from "../types";
import { retryPlatformRead } from "./aiReliability.js";

const normalize = (value: unknown) =>
  String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const tokens = (value: unknown) =>
  normalize(value).split(/\s+/).filter((token) => token.length > 2);

function repairTypeScore(repair: RepairType, text: string) {
  const target = normalize(`${repair.toolType} ${repair.commonIssues.join(" ")}`);
  const queryTokens = Array.from(new Set(tokens(text)));
  if (!queryTokens.length) return 0;
  const matches = queryTokens.filter((token) => target.includes(token)).length;
  return matches / queryTokens.length;
}

async function providerRepairContext(
  adapter: PosAdapter,
  context: PosAdapterContext,
  text: string,
) {
  if (!adapter.listRepairCatalog) return undefined;

  const result = await retryPlatformRead(
    "assistant repair catalog",
    () => adapter.listRepairCatalog!(context),
    { timeoutMs: 6_000, retries: 1 },
  );
  if (!result.success || !result.data.items.length) return undefined;

  const ranked = result.data.items
    .map((repair) => ({ repair, score: repairTypeScore(repair, text) }))
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.score > 0 ? ranked[0].repair : undefined;
}

export async function buildRepairIntakeGuidance(
  adapter: PosAdapter,
  context: PosAdapterContext,
  input: {
    job: string;
    productName?: string;
  },
) {
  const job = input.job.trim().slice(0, 700);
  const productName = input.productName?.trim().slice(0, 180);
  const providerRepair = await providerRepairContext(
    adapter,
    context,
    `${productName || ""} ${job}`,
  );

  const parts = [
    "I can help prepare a useful repair intake, but I cannot confirm which component failed from this description alone.",
    productName ? `Equipment candidate from the connected catalogue: ${productName}.` : "",
    job ? `Observed problem: ${job}.` : "",
  ].filter(Boolean);

  if (providerRepair?.commonIssues.length) {
    parts.push(
      `The connected repair catalogue lists these common service-intake symptoms for ${providerRepair.toolType}: ${providerRepair.commonIssues.slice(0, 5).join(", ")}. These are possibilities to compare with what you observe, not a diagnosis.`,
    );
  }

  parts.push(
    "Before submitting, note when the fault happens, any warning code or light, unusual sound/smell/leak, whether load or temperature changes it, and the model or serial number if visible.",
  );

  return parts.join(" ");
}
