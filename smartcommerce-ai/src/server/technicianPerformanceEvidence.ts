import { createHardenedServerFetch, validateServerIntegrationBaseUrl } from "./hardenedOutboundFetch.js";
import { resolveTechnicianPayPeriod, type MetricKey } from "../lib/technicianCompensation.js";

export type EvidenceMetric = {
  key: MetricKey;
  value: number | null;
  numerator?: number;
  denominator?: number;
  sourceRefs: string[];
  coverage: "verified" | "partial" | "unavailable";
  reason?: string;
};

export type TechnicianEvidenceSnapshot = {
  employeeId: string;
  period: ReturnType<typeof resolveTechnicianPayPeriod>;
  generatedAt: string;
  metrics: Record<MetricKey, EvidenceMetric>;
  sourceCoverage: {
    completedWorkOrders: number;
    technicianTasks: number;
    timedTasks: number;
    sourceExportGaps: string[];
  };
  compensationHours: {
    regularHours: null;
    overtimeHours: null;
    coverage: "unavailable";
    reason: string;
  };
  safetyEligible: null;
  minimumSampleSatisfied: boolean;
  incentiveReady: boolean;
};

type Row = Record<string, any>;

function configuredPos() {
  const raw = process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_URL?.trim();
  if (!raw) throw new Error("POS_NOT_CONFIGURED");
  return validateServerIntegrationBaseUrl(raw).toString().replace(/\/$/, "");
}

function authHeaders() {
  const key = process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_API_KEY?.trim();
  const header = process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_API_KEY_HEADER?.trim() || "X-API-Key";
  return key ? { [header]: key } : {};
}

async function getJson(path: string): Promise<any> {
  const fetchImpl = createHardenedServerFetch({ timeoutMs: 7000, maxResponseBytes: 2_000_000 });
  const response = await fetchImpl(`${configuredPos()}${path}`, { headers: { Accept: "application/json", ...authHeaders() } });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`POS_EVIDENCE_SOURCE_${response.status}`);
  return payload;
}

const pct = (n: number, d: number) => d > 0 ? Math.max(0, Math.min(200, (n / d) * 100)) : null;
const dateOnly = (value: unknown) => String(value || "").slice(0, 10);
const inRange = (value: unknown, start: string, end: string) => {
  const day = dateOnly(value);
  return Boolean(day && day >= start && day <= end);
};

function metric(key: MetricKey, value: number | null, sourceRefs: string[], options: Partial<EvidenceMetric> = {}): EvidenceMetric {
  return { key, value, sourceRefs, coverage: value == null ? "unavailable" : "verified", ...options };
}

export async function collectTechnicianPerformanceEvidence(employeeId: string, periodRef: string): Promise<TechnicianEvidenceSnapshot> {
  const period = resolveTechnicianPayPeriod(periodRef);
  const list = await getJson(`/api/work-orders?limit=200`);
  const rows: Row[] = Array.isArray(list) ? list : [];
  const completed = rows.filter((row) => inRange(row.completed_at, period.start, period.end));

  // Fetch detail only for work orders completed inside this pay period. This
  // prevents current open work from contaminating a historical scorecard.
  const details: Row[] = [];
  for (const row of completed.slice(0, 100)) {
    if (row?.id == null) continue;
    try { details.push(await getJson(`/api/work-orders/${encodeURIComponent(String(row.id))}`)); }
    catch { /* coverage is reported below; never invent missing source data */ }
  }

  const tasks = details.flatMap((wo) => (Array.isArray(wo.tasks) ? wo.tasks.map((task: Row) => ({ ...task, __wo: wo })) : []))
    .filter((task) => String(task.technician_id ?? "") === employeeId && String(task.status || "") === "complete");
  const timedTasks = tasks.filter((task) => Number(task.actual_minutes || 0) > 0 && Number(task.allotted_minutes || 0) > 0);
  const actualMinutes = timedTasks.reduce((sum, task) => sum + Number(task.actual_minutes || 0), 0);
  const allottedMinutes = timedTasks.reduce((sum, task) => sum + Number(task.allotted_minutes || 0), 0);
  const taskRefs = timedTasks.map((task) => `work-order:${task.__wo?.id}:task:${task.id}`);

  const deadlineJobs = details.filter((wo) => Array.isArray(wo.tasks) && wo.tasks.some((task: Row) => String(task.technician_id ?? "") === employeeId) && wo.completed_at && wo.pickup_due_date);
  const onTime = deadlineJobs.filter((wo) => dateOnly(wo.completed_at) <= dateOnly(wo.pickup_due_date));
  const deadlineRefs = deadlineJobs.map((wo) => `work-order:${wo.id}`);

  const metrics: Record<MetricKey, EvidenceMetric> = {
    laborEfficiency: metric("laborEfficiency", pct(allottedMinutes, actualMinutes), taskRefs, {
      numerator: allottedMinutes,
      denominator: actualMinutes,
      coverage: timedTasks.length ? "partial" : "unavailable",
      reason: timedTasks.length ? "Calculated from completed tasks on work orders completed in the pay period. Historical time-entry timestamps are not exported, so cross-period task time cannot yet be partitioned exactly." : "No completed timed technician tasks were available from the source POS for this period.",
    }),
    onTimeCompletion: metric("onTimeCompletion", pct(onTime.length, deadlineJobs.length), deadlineRefs, {
      numerator: onTime.length,
      denominator: deadlineJobs.length,
      coverage: deadlineJobs.length ? "verified" : "unavailable",
      reason: deadlineJobs.length ? undefined : "No completed technician work orders with a pickup due date were available in this period.",
    }),
    firstTimeFix: metric("firstTimeFix", null, [], { reason: "Requires a structured comeback/rework attribution export from the POS." }),
    qcFirstPass: metric("qcFirstPass", null, [], { reason: "Supervisor sign-off exists, but the POS does not expose failed/repeated QC attempts as historical events." }),
    utilization: metric("utilization", null, [], { reason: "Requires scheduled/available work hours plus period-exact productive time entries." }),
    diagnosticAccuracy: metric("diagnosticAccuracy", null, [], { reason: "Requires structured initial-diagnosis versus final-fault outcome data." }),
    documentationCompleteness: metric("documentationCompleteness", null, [], { reason: "Requires a versioned required-document/checklist completion export." }),
    partsAccuracy: metric("partsAccuracy", null, [], { reason: "Requires parts issued/returned/corrected attribution events by technician." }),
    reliability: metric("reliability", null, [], { reason: "Requires attendance/schedule adherence data for the payroll period." }),
  };

  const sourceExportGaps = [
    "Historical technician time entries with started_at and ended_at",
    "QC attempt/pass/fail events with technician attribution",
    "Comeback/rework classification and attributable technician",
    "Diagnostic initial/final outcome records",
    "Required documentation/checklist completion events",
    "Parts issue/return/correction events by technician",
    "Attendance, scheduled hours, leave, training and overtime records",
    "Safety/compliance eligibility events",
  ];
  const hardRequired: MetricKey[] = ["firstTimeFix", "qcFirstPass", "documentationCompleteness"];
  const incentiveReady = hardRequired.every((key) => metrics[key].coverage === "verified") && false; // safety evidence is also currently unavailable

  return {
    employeeId,
    period,
    generatedAt: new Date().toISOString(),
    metrics,
    sourceCoverage: { completedWorkOrders: details.length, technicianTasks: tasks.length, timedTasks: timedTasks.length, sourceExportGaps },
    compensationHours: {
      regularHours: null,
      overtimeHours: null,
      coverage: "unavailable",
      reason: "Base and overtime pay require period-exact payroll/attendance hours; repair timers alone must not be treated as payroll hours.",
    },
    safetyEligible: null,
    minimumSampleSatisfied: timedTasks.length >= 3 && deadlineJobs.length >= 3,
    incentiveReady,
  };
}
