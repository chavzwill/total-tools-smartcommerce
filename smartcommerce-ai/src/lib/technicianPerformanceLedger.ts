import type { CompensationPlan, CompensationResult, MetricKey } from "./technicianCompensation";

export type TechnicianRateVersion = {
  id: string;
  employeeId: string;
  hourlyRate: number;
  overtimeMultiplier: number;
  grade?: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  changedBy: string;
  changeReason: string;
  createdAt: string;
};

export type TechnicianMetricSnapshot = {
  key: MetricKey;
  value: number;
  numerator?: number;
  denominator?: number;
  sourceRefs: string[];
};

export type TechnicianPerformancePeriod = {
  id: string;
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  status: "draft" | "review" | "approved" | "finalized" | "adjusted";
  planId: string;
  planVersion: number;
  rateVersionId: string;
  regularHours: number;
  overtimeHours: number;
  productiveHours: number;
  waitingPartsHours: number;
  trainingHours: number;
  warrantyHours: number;
  reworkHours: number;
  metrics: TechnicianMetricSnapshot[];
  result: CompensationResult;
  reviewedBy?: string;
  reviewedAt?: string;
  finalizedBy?: string;
  finalizedAt?: string;
  createdAt: string;
};

export type TechnicianAdjustment = {
  id: string;
  employeeId: string;
  sourcePeriodId: string;
  appliedPeriodId: string;
  amount: number;
  reason: string;
  createdBy: string;
  createdAt: string;
};

export type TechnicianLedgerEvent = {
  id: string;
  employeeId: string;
  eventType:
    | "rate_changed"
    | "plan_changed"
    | "metric_recalculated"
    | "period_submitted"
    | "period_approved"
    | "period_finalized"
    | "adjustment_created"
    | "quality_exception"
    | "dispute_opened"
    | "dispute_resolved";
  actorId: string;
  occurredAt: string;
  reason?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
};

export type TechnicianCompensationStore = {
  plans: CompensationPlan[];
  rates: TechnicianRateVersion[];
  periods: TechnicianPerformancePeriod[];
  adjustments: TechnicianAdjustment[];
  events: TechnicianLedgerEvent[];
};

export function activeRateForDate(rates: TechnicianRateVersion[], employeeId: string, date: string) {
  const at = new Date(date).getTime();
  return rates
    .filter((rate) => rate.employeeId === employeeId)
    .filter((rate) => {
      const from = new Date(rate.effectiveFrom).getTime();
      const to = rate.effectiveTo ? new Date(rate.effectiveTo).getTime() : Number.POSITIVE_INFINITY;
      return at >= from && at < to;
    })
    .sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime())[0] || null;
}

export function assertPeriodMutable(period: TechnicianPerformancePeriod) {
  if (period.status === "finalized" || period.status === "adjusted") {
    throw new Error("Finalized technician periods are immutable. Create a linked adjustment instead.");
  }
}
