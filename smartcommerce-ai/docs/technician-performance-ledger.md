# Technician Performance & Compensation Ledger

## Purpose

The ledger is the auditable system of record for technician compensation, standards, performance calculations, reviews, adjustments, and payouts. It must make every score and payout traceable to the underlying work orders, tasks, time entries, quality events, parts usage, attendance records, and administrative configuration that produced it.

## Principles

1. Never rewrite history. Finalized periods are immutable.
2. Every configuration change is versioned with an effective date.
3. Every metric calculation stores its source evidence and formula version.
4. Every manual override requires permission, reason, actor, timestamp, and before/after values.
5. Technician-attributable quality failures must be explicitly classified before they affect pay.
6. Waiting for parts, customer approval, approved training, leave, meetings, and system downtime are excluded from productive-utilization penalties when properly classified.
7. Base wages are never reduced by performance scoring. Performance affects incentives only, subject to applicable payroll rules.

## Core records

### compensation_plans
- id
- name
- branch_id nullable
- technician_grade nullable
- currency
- review_period_type: weekly | biweekly | monthly | custom
- incentive_cap_percent
- overtime_multiplier
- effective_from
- effective_to nullable
- status: draft | active | retired
- created_by
- created_at

### compensation_plan_versions
Immutable snapshots of all plan settings.
- id
- compensation_plan_id
- version_number
- effective_from
- metric_weights_json
- thresholds_json
- quality_gates_json
- incentive_bands_json
- exclusions_json
- created_by
- reason
- created_at

### technician_compensation_assignments
- id
- employee_id
- compensation_plan_id
- hourly_rate
- overtime_multiplier_override nullable
- technician_grade
- effective_from
- effective_to nullable
- created_by
- change_reason
- created_at

### technician_skill_premiums
- id
- employee_id
- skill_id or certification_id
- premium_type: hourly | fixed_period | percentage
- premium_value
- effective_from
- effective_to nullable
- approved_by
- created_at

### technician_time_classifications
Every time entry used for compensation or utilization must have a normalized category.
- id
- employee_id
- work_order_id nullable
- task_id nullable
- time_entry_id nullable
- classification: productive_repair | diagnosis | qc | waiting_parts | waiting_customer | training | meeting | leave | system_downtime | warranty | rework | overtime | team_assist | other
- started_at
- ended_at
- minutes
- billable_minutes nullable
- standard_minutes nullable
- classified_by
- classification_reason nullable
- created_at

### technician_quality_events
- id
- employee_id
- work_order_id
- task_id nullable
- type: qc_pass | qc_fail | comeback | rework | diagnostic_match | diagnostic_miss | documentation_pass | documentation_fail | parts_accuracy_pass | parts_accuracy_fail | safety_event | customer_escalation
- attribution: technician | defective_part | customer_misuse | manufacturer | unrelated_fault | authorization_gap | supervisor | system | unassigned
- severity: info | minor | major | critical
- occurred_at
- reviewed_by nullable
- review_notes nullable
- finalized_at nullable

### technician_periods
One record per technician per evaluation/pay period.
- id
- employee_id
- compensation_plan_version_id
- period_start
- period_end
- status: open | calculating | review | approved | finalized | adjusted
- base_hours
- overtime_hours
- productive_hours
- excluded_hours
- billable_or_standard_hours
- base_pay
- overtime_pay
- skill_premiums
- performance_score
- incentive_percent
- incentive_amount
- adjustments_total
- gross_technician_compensation
- quality_gate_status
- calculated_at nullable
- approved_by nullable
- approved_at nullable
- finalized_by nullable
- finalized_at nullable

### technician_metric_results
One row per metric in a technician period.
- id
- technician_period_id
- metric_key
- raw_value
- normalized_score
- weight
- weighted_score
- target_value
- minimum_value
- excellent_value
- eligible_sample_size
- formula_version
- evidence_json
- calculated_at

`evidence_json` stores references only, not duplicated source records, for example work_order_ids, task_ids, time_entry_ids, quality_event_ids and attendance record ids.

### technician_period_adjustments
Never edit finalized pay totals directly.
- id
- technician_period_id
- adjustment_type: correction | bonus | clawback_incentive | overtime_correction | rate_correction | approved_exception | other
- amount
- reason
- evidence_json
- created_by
- approved_by nullable
- created_at

Adjustments to a finalized period are posted to the next open payroll period while retaining a link to the original period.

### technician_review_events
- id
- technician_period_id
- stage: supervisor_review | technician_acknowledgement | payroll_review | admin_review | dispute | resolution
- decision: pending | accepted | returned | approved | rejected | resolved
- notes
- actor_employee_id
- created_at

### technician_compensation_audit
Append-only audit stream.
- id
- entity_type
- entity_id
- action
- old_value_json nullable
- new_value_json nullable
- reason nullable
- actor_employee_id
- created_at

## Period workflow

1. Open period
2. Ingest eligible time entries and completed work
3. Normalize time classifications
4. Ingest QC, comeback, diagnostic, documentation, parts and safety events
5. Freeze the compensation-plan version effective for the period
6. Calculate metrics
7. Apply minimum sample-size rules
8. Evaluate quality gates
9. Calculate base pay, overtime and premiums
10. Calculate performance incentive
11. Enter supervisor review
12. Resolve exceptions and technician disputes
13. Approve
14. Finalize and lock
15. Export to payroll/accounting

## Dashboard tracking

Management dashboard should show:
- total technician payroll exposure for current period
- projected incentives
- finalized incentives
- technicians meeting standard
- technicians below standard
- quality-gate failures
- first-time-fix trend
- QC trend
- rework/comeback trend
- utilization trend
- efficiency trend
- overtime trend
- waiting-parts hours
- unclassified time needing review
- disputes awaiting resolution
- periods awaiting approval

## Technician profile

Each technician gets a historical performance record containing:
- current rate and grade
- rate history
- active skill/certification premiums
- current-period projected compensation
- finalized compensation history
- metric history by period
- work-order evidence drill-down
- QC outcomes
- comeback/rework cases and attribution
- attendance/reliability data
- training and certifications
- supervisor reviews
- disputes and resolutions

## Work-order traceability

From a work order, authorized supervisors can see:
- technicians who worked on it
- tasks completed
- clocked time
- standard/allotted time
- billable labor
- QC result
- rework/comeback linkage
- metric impact
- period(s) affected

From a metric result, supervisors can drill down to every source work order or event that affected the score.

## Alerts

Generate operational alerts for:
- technician approaching incentive-quality threshold failure
- repeat comeback pattern
- repeated QC failures
- unusually high efficiency with declining quality
- excessive unclassified time
- repeated overtime
- high waiting-parts time
- missing documentation
- missing supervisor review
- expiring certification
- rate/plan effective-date conflict
- finalized-period adjustment posted

Alerts are management signals, not automatic disciplinary decisions.

## Exports

Authorized exports should support CSV/XLSX or API JSON for:
- technician period summary
- metric-detail ledger
- time-classification ledger
- rate history
- incentive history
- quality-event ledger
- compensation adjustments
- payroll-ready period totals

Every export records who exported it, filters/date range, and timestamp.

## Permissions

Recommended granular permissions:
- technician_comp_view_self
- technician_comp_view_team
- technician_comp_view_pay
- technician_comp_manage_rates
- technician_comp_manage_plans
- technician_comp_classify_time
- technician_comp_review_quality
- technician_comp_approve_period
- technician_comp_finalize_period
- technician_comp_adjust_finalized
- technician_comp_export
- technician_comp_audit_view

Technicians may view their own scorecard and evidence but cannot edit calculated metrics, attribution decisions, rates, or finalized periods.

## Retention

Compensation records, plan versions, finalized periods and audit events should be retained according to company payroll/legal retention requirements and never be deleted through normal UI actions. Retired plans and inactive technician assignments remain queryable for historical calculations.
