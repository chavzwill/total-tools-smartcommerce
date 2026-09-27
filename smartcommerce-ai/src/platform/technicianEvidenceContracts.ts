import type { ISODateTime, PlatformEntityId, PlatformMetadata } from "./contracts";

/**
 * Evidence resources required to calculate technician compensation from auditable
 * operational events. These contracts are intentionally separate from the
 * current POS adapter: a resource must not be treated as available until the
 * source POS exposes a matching endpoint.
 */
export type TechnicianHistoricalTimeEntryExport = {
  id: PlatformEntityId;
  technicianId: PlatformEntityId;
  workOrderId: PlatformEntityId;
  taskId: PlatformEntityId;
  startedAt: ISODateTime;
  endedAt?: ISODateTime;
  minutes?: number;
  classification: "productive" | "diagnostic" | "warranty" | "rework" | "training" | "waiting_parts" | "other" | string;
  billable?: boolean;
  overtime?: boolean;
  approvedBy?: PlatformEntityId;
  metadata?: PlatformMetadata;
};

export type TechnicianQcEventExport = {
  id: PlatformEntityId;
  workOrderId: PlatformEntityId;
  technicianId?: PlatformEntityId;
  reviewerId: PlatformEntityId;
  attempt: number;
  outcome: "pass" | "fail";
  reason?: string;
  occurredAt: ISODateTime;
  metadata?: PlatformMetadata;
};

export type TechnicianComebackEventExport = {
  id: PlatformEntityId;
  originalWorkOrderId: PlatformEntityId;
  returnWorkOrderId?: PlatformEntityId;
  technicianId?: PlatformEntityId;
  classification:
    | "workmanship"
    | "diagnostic_error"
    | "defective_part"
    | "customer_misuse"
    | "unrelated_fault"
    | "manufacturer_defect"
    | "incomplete_authorization"
    | "warranty_recurrence"
    | "supervisor_review"
    | string;
  technicianAttributable: boolean;
  reviewedBy?: PlatformEntityId;
  occurredAt: ISODateTime;
  metadata?: PlatformMetadata;
};

export type TechnicianDiagnosticOutcomeExport = {
  id: PlatformEntityId;
  workOrderId: PlatformEntityId;
  technicianId: PlatformEntityId;
  initialDiagnosis: string;
  finalDiagnosis: string;
  outcome: "accurate" | "partially_accurate" | "inaccurate" | "not_scored" | string;
  reviewedBy?: PlatformEntityId;
  occurredAt: ISODateTime;
  metadata?: PlatformMetadata;
};

export type TechnicianDocumentationCheckExport = {
  id: PlatformEntityId;
  workOrderId: PlatformEntityId;
  technicianId: PlatformEntityId;
  checklistVersion: string;
  requiredCount: number;
  completedCount: number;
  complete: boolean;
  checkedAt: ISODateTime;
  metadata?: PlatformMetadata;
};

export type TechnicianPartsCorrectionExport = {
  id: PlatformEntityId;
  workOrderId: PlatformEntityId;
  technicianId?: PlatformEntityId;
  partLineId?: PlatformEntityId;
  eventType: "issued" | "returned" | "corrected" | "wrong_part" | "unused_return" | "damaged" | string;
  attributable: boolean;
  quantity?: number;
  occurredAt: ISODateTime;
  metadata?: PlatformMetadata;
};

export type TechnicianAttendanceEventExport = {
  id: PlatformEntityId;
  technicianId: PlatformEntityId;
  eventType: "scheduled" | "clock_in" | "clock_out" | "leave" | "absence" | "late" | "training" | "overtime" | string;
  startsAt: ISODateTime;
  endsAt?: ISODateTime;
  minutes?: number;
  approved?: boolean;
  approvedBy?: PlatformEntityId;
  metadata?: PlatformMetadata;
};

export type TechnicianSafetyEventExport = {
  id: PlatformEntityId;
  technicianId: PlatformEntityId;
  workOrderId?: PlatformEntityId;
  eventType: "check_passed" | "incident" | "violation" | "training_completed" | "certification_expired" | string;
  severity?: "info" | "minor" | "major" | "critical" | string;
  incentiveEligibleImpact?: boolean;
  reviewedBy?: PlatformEntityId;
  occurredAt: ISODateTime;
  metadata?: PlatformMetadata;
};

export const TECHNICIAN_EVIDENCE_EXPORT_CONTRACTS = [
  { name: "technician_time_entries", endpoint: "/api/platform/operations/technician-time-entries", requiredFor: ["laborEfficiency", "utilization", "payrollHours"] },
  { name: "technician_qc_events", endpoint: "/api/platform/operations/technician-qc-events", requiredFor: ["qcFirstPass"] },
  { name: "technician_comebacks", endpoint: "/api/platform/operations/technician-comebacks", requiredFor: ["firstTimeFix", "reworkRate"] },
  { name: "technician_diagnostics", endpoint: "/api/platform/operations/technician-diagnostics", requiredFor: ["diagnosticAccuracy"] },
  { name: "technician_documentation_checks", endpoint: "/api/platform/operations/technician-documentation-checks", requiredFor: ["documentationCompleteness"] },
  { name: "technician_parts_events", endpoint: "/api/platform/operations/technician-parts-events", requiredFor: ["partsAccuracy"] },
  { name: "technician_attendance", endpoint: "/api/platform/operations/technician-attendance", requiredFor: ["reliability", "utilization", "payrollHours", "overtime"] },
  { name: "technician_safety_events", endpoint: "/api/platform/operations/technician-safety-events", requiredFor: ["safetyEligibility"] },
] as const;
