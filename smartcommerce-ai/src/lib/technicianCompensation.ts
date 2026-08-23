export type MetricKey =
  | "firstTimeFix"
  | "qcFirstPass"
  | "laborEfficiency"
  | "utilization"
  | "onTimeCompletion"
  | "diagnosticAccuracy"
  | "documentationCompleteness"
  | "partsAccuracy"
  | "reliability";

export type MetricRule = {
  key: MetricKey;
  label: string;
  weight: number;
  minimum: number;
  target: number;
  excellent: number;
  direction?: "higher" | "band";
  bandHigh?: number;
  hardGate?: boolean;
};

export type IncentiveBand = { minScore: number; maxPercent: number; label: string };

export type CompensationPlan = {
  id: string;
  version: number;
  name: string;
  effectiveFrom: string;
  currency: string;
  overtimeMultiplier: number;
  maxIncentivePercent: number;
  metrics: MetricRule[];
  incentiveBands: IncentiveBand[];
};

export type TechnicianPeriodInput = {
  employeeId: string;
  baseHourlyRate: number;
  regularHours: number;
  overtimeHours: number;
  skillPremiumAmount?: number;
  metrics: Partial<Record<MetricKey, number>>;
  safetyEligible: boolean;
  minimumSampleSatisfied: boolean;
};

export type MetricResult = {
  key: MetricKey;
  label: string;
  value: number | null;
  score: number;
  weightedScore: number;
  gatePassed: boolean;
};

export type CompensationResult = {
  baseRegularPay: number;
  overtimePay: number;
  skillPremium: number;
  eligibleBasePay: number;
  performanceScore: number;
  incentivePercent: number;
  incentiveAmount: number;
  totalPay: number;
  incentiveEligible: boolean;
  gateFailures: string[];
  metrics: MetricResult[];
};

export const DEFAULT_TECHNICIAN_PLAN: CompensationPlan = {
  id: "total-tools-technician-standard",
  version: 1,
  name: "Total Tools Technician Standard",
  effectiveFrom: "2026-08-23",
  currency: "JMD",
  overtimeMultiplier: 1.5,
  maxIncentivePercent: 15,
  metrics: [
    { key: "firstTimeFix", label: "First-time fix", weight: 25, minimum: 90, target: 95, excellent: 98, hardGate: true },
    { key: "qcFirstPass", label: "QC first-pass", weight: 20, minimum: 92, target: 96, excellent: 99, hardGate: true },
    { key: "laborEfficiency", label: "Labor efficiency", weight: 15, minimum: 80, target: 90, excellent: 105, direction: "band", bandHigh: 115 },
    { key: "utilization", label: "Productive utilization", weight: 10, minimum: 65, target: 75, excellent: 85, direction: "band", bandHigh: 92 },
    { key: "onTimeCompletion", label: "On-time completion", weight: 10, minimum: 80, target: 90, excellent: 96 },
    { key: "diagnosticAccuracy", label: "Diagnostic accuracy", weight: 8, minimum: 82, target: 90, excellent: 96 },
    { key: "documentationCompleteness", label: "Documentation completeness", weight: 5, minimum: 90, target: 97, excellent: 100, hardGate: true },
    { key: "partsAccuracy", label: "Parts accuracy", weight: 4, minimum: 90, target: 96, excellent: 99 },
    { key: "reliability", label: "Reliability", weight: 3, minimum: 85, target: 95, excellent: 99 },
  ],
  incentiveBands: [
    { minScore: 95, maxPercent: 15, label: "Outstanding" },
    { minScore: 90, maxPercent: 10, label: "Exceeds standard" },
    { minScore: 80, maxPercent: 5, label: "Meets standard" },
    { minScore: 0, maxPercent: 0, label: "Below standard" },
  ],
};

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

function scoreMetric(rule: MetricRule, raw: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return 0;
  if (rule.direction === "band") {
    const high = rule.bandHigh ?? rule.excellent;
    if (value < rule.minimum) return clamp((value / Math.max(rule.minimum, 1)) * 60);
    if (value < rule.target) return 60 + ((value - rule.minimum) / Math.max(rule.target - rule.minimum, 1)) * 20;
    if (value <= rule.excellent) return 80 + ((value - rule.target) / Math.max(rule.excellent - rule.target, 1)) * 20;
    if (value <= high) return 100;
    return clamp(100 - ((value - high) / Math.max(high, 1)) * 50);
  }
  if (value < rule.minimum) return clamp((value / Math.max(rule.minimum, 1)) * 60);
  if (value < rule.target) return 60 + ((value - rule.minimum) / Math.max(rule.target - rule.minimum, 1)) * 20;
  if (value < rule.excellent) return 80 + ((value - rule.target) / Math.max(rule.excellent - rule.target, 1)) * 20;
  return 100;
}

export function calculateTechnicianCompensation(plan: CompensationPlan, input: TechnicianPeriodInput): CompensationResult {
  const totalWeight = plan.metrics.reduce((sum, metric) => sum + metric.weight, 0) || 1;
  const metricResults = plan.metrics.map((rule): MetricResult => {
    const raw = input.metrics[rule.key];
    const value = raw == null || !Number.isFinite(Number(raw)) ? null : Number(raw);
    const score = value == null ? 0 : scoreMetric(rule, value);
    const gatePassed = !rule.hardGate || (value != null && value >= rule.minimum);
    return { key: rule.key, label: rule.label, value, score, weightedScore: score * (rule.weight / totalWeight), gatePassed };
  });

  const performanceScore = metricResults.reduce((sum, metric) => sum + metric.weightedScore, 0);
  const gateFailures = metricResults.filter((metric) => !metric.gatePassed).map((metric) => metric.label);
  if (!input.safetyEligible) gateFailures.push("Safety/compliance eligibility");
  if (!input.minimumSampleSatisfied) gateFailures.push("Minimum sample size");

  const incentiveEligible = gateFailures.length === 0;
  const band = [...plan.incentiveBands].sort((a, b) => b.minScore - a.minScore).find((candidate) => performanceScore >= candidate.minScore);
  const incentivePercent = incentiveEligible ? Math.min(plan.maxIncentivePercent, band?.maxPercent ?? 0) : 0;

  const baseRegularPay = Math.max(0, input.regularHours) * Math.max(0, input.baseHourlyRate);
  const overtimePay = Math.max(0, input.overtimeHours) * Math.max(0, input.baseHourlyRate) * Math.max(1, plan.overtimeMultiplier);
  const skillPremium = Math.max(0, input.skillPremiumAmount || 0);
  const eligibleBasePay = baseRegularPay + overtimePay;
  const incentiveAmount = eligibleBasePay * (incentivePercent / 100);

  return {
    baseRegularPay,
    overtimePay,
    skillPremium,
    eligibleBasePay,
    performanceScore,
    incentivePercent,
    incentiveAmount,
    totalPay: eligibleBasePay + skillPremium + incentiveAmount,
    incentiveEligible,
    gateFailures,
    metrics: metricResults,
  };
}
