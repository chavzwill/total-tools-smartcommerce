# Total Tools Technician Compensation & Performance Framework

## Purpose

This framework defines how technician compensation, quality standards, productivity targets, and incentives should be calculated in the Total Tools POS / Repairs operating system.

The system must reward productive, high-quality repair work without creating incentives to rush repairs, hide rework, skip documentation, or compromise safety.

All rates, weights, thresholds, caps, and review periods are configurable by authorized administrators. Historical payroll calculations are immutable once finalized; configuration changes apply prospectively through versioned compensation plans.

---

## 1. Compensation structure

Technician compensation is composed of:

1. **Base hourly pay**
2. **Performance incentive**
3. **Skill / certification premiums**
4. **Approved overtime premium**
5. **Approved special-duty / team-job adjustments**
6. **Manual adjustment**, only where an authorized administrator records a reason and audit trail

Formula:

`Total Pay = Base Pay + Performance Incentive + Skill Premiums + Overtime Premium + Approved Adjustments`

Performance incentives may never reduce earned base wages.

---

## 2. Admin-configurable rate controls

Each technician may have an effective-dated compensation profile containing:

- base hourly rate
- overtime multiplier
- maximum incentive percentage
- skill premiums
- certification premiums
- role / technician grade
- branch assignment
- effective-from date
- optional effective-to date
- compensation plan version

Only staff with a dedicated compensation-administration permission may alter these values.

Every rate change must record:

- previous value
- new value
- effective date
- changed by
- timestamp
- reason
- approval reference where required

Historical closed payroll periods must never be recalculated using a later rate.

---

## 3. Time classification

Time must be classified before performance metrics are calculated.

### Productive repair time
Time actively spent performing assigned repair tasks.

### Diagnostic time
Time spent diagnosing a fault before repair authorization or task execution.

### Quality-control time
Time spent carrying out required inspection / testing / sign-off activities.

### Waiting-for-parts time
Excluded from technician efficiency calculations when the technician cannot productively continue the job.

### Customer-approval hold
Excluded from technician efficiency calculations.

### Training time
Paid according to company policy but excluded from repair productivity calculations.

### Warranty work
Tracked separately. It must not automatically count as technician rework unless the system records the cause as workmanship-related.

### Rework / comeback time
Repair time caused by a confirmed workmanship or diagnostic failure on a previous repair. Tracked separately and used as a quality metric.

### Administrative / meeting time
Paid according to policy and excluded from repair efficiency.

### Approved overtime
Paid using the configured overtime multiplier.

### Team-assisted repair
Each technician's actual time is recorded separately. Standard/billable credit may be allocated according to administrator-defined team-job rules rather than duplicated across every technician.

---

## 4. Core performance metrics

### 4.1 First-Time-Fix Rate — 25% default weight

Definition:

`repairs with no workmanship-related comeback within review window / eligible completed repairs`

Default standard:

- Excellent: >= 97%
- Target: >= 95%
- Minimum acceptable: >= 92%
- Below standard: < 92%

This is the primary quality metric.

---

### 4.2 QC First-Pass Rate — 20% default weight

Definition:

`repairs passing required QC on first submission / repairs submitted for QC`

Default standard:

- Excellent: >= 98%
- Target: >= 96%
- Minimum acceptable: >= 93%
- Below standard: < 93%

A failed QC must include a coded reason.

---

### 4.3 Labor Efficiency — 15% default weight

Definition:

`standard / allotted labor minutes earned / actual productive repair minutes`

Examples:

- 120 standard minutes completed in 120 actual minutes = 100% efficiency
- 120 standard minutes completed in 100 actual minutes = 120% efficiency
- 120 standard minutes completed in 150 actual minutes = 80% efficiency

Default standard:

- Excellent: 105%–125%
- Target: 90%–105%
- Minimum acceptable: >= 80%
- Below standard: < 80%

Efficiency above the configurable anti-rush ceiling must not produce additional incentive credit. Default ceiling: 125%.

---

### 4.4 Productive Utilization — 10% default weight

Definition:

`productive repair + diagnostic + QC hours / eligible available working hours`

Excluded from denominator where properly coded:

- approved training
- meetings
- waiting for parts
- customer approval holds
- approved leave
- system downtime

Default standard:

- Excellent: >= 85%
- Target: 75%–85%
- Minimum acceptable: >= 65%
- Below standard: < 65%

Utilization must never punish a technician for lack of assigned work.

---

### 4.5 On-Time Completion — 10% default weight

Definition:

`eligible tasks / repairs completed by the internally committed technician due time / eligible completed work`

Delays caused by parts, customer approvals, management holds, or reassignment are excluded when properly coded.

Default standard:

- Excellent: >= 95%
- Target: >= 90%
- Minimum acceptable: >= 85%
- Below standard: < 85%

---

### 4.6 Diagnostic Accuracy — 8% default weight

Definition:

Percentage of assessed jobs where the original technician diagnosis materially matches the final confirmed fault / required repair.

Default standard:

- Excellent: >= 95%
- Target: >= 90%
- Minimum acceptable: >= 85%
- Below standard: < 85%

Changed diagnoses must have a coded reason so legitimate hidden faults are not incorrectly penalized.

---

### 4.7 Documentation Completeness — 5% default weight

Required records may include:

- diagnosis
- technician notes
- completed checklist
- parts used
- required photos / evidence
- test / QC result
- customer-impacting findings

Default standard:

- Excellent: >= 99%
- Target: >= 97%
- Minimum acceptable: >= 95%
- Below standard: < 95%

Missing mandatory safety or QC documentation is a gate failure, not merely a score reduction.

---

### 4.8 Parts Accuracy / Stewardship — 4% default weight

Measures correct parts selection, consumption, returns, wastage, and unexplained variances.

Default standard:

- Target: >= 97% clean parts transactions
- Minimum acceptable: >= 94%

Customer-supplied parts are tracked separately.

---

### 4.9 Reliability / Attendance — 3% default weight

Supporting metric only. It must not dominate technical performance.

May include:

- scheduled attendance
- punctuality
- unapproved absence
- accepted schedule adherence

Approved leave and protected absence categories must be excluded according to company policy and applicable law.

---

## 5. Quality and safety gates

A technician may have a high productivity score and still be ineligible for performance incentive if a quality gate fails.

Default incentive gates:

- First-Time-Fix Rate must be >= 92%
- QC First-Pass Rate must be >= 93%
- Documentation Completeness must be >= 95%
- no unresolved serious safety violation during the period
- no substantiated fraud / intentional time manipulation

Administrators may configure thresholds, but lowering them requires a logged reason.

A safety-critical failure may place the incentive period into `review_required` rather than automatically assigning a financial penalty.

Base wages are never forfeited by a failed performance gate.

---

## 6. Weighted performance score

Default weights:

| Metric | Weight |
| --- | ---: |
| First-Time-Fix | 25% |
| QC First-Pass | 20% |
| Labor Efficiency | 15% |
| Productive Utilization | 10% |
| On-Time Completion | 10% |
| Diagnostic Accuracy | 8% |
| Documentation Completeness | 5% |
| Parts Accuracy | 4% |
| Reliability / Attendance | 3% |
| **Total** | **100%** |

Administrators may change weights, but the configuration must total 100%.

Quality-oriented metrics (First-Time-Fix + QC First-Pass) should never total less than 40% without an explicit high-level administrative override and audit reason.

---

## 7. Performance bands

Default overall bands after quality gates:

- **Outstanding:** 95–100
- **Exceeds Standard:** 90–94.99
- **Meets Standard:** 80–89.99
- **Needs Improvement:** 70–79.99
- **Below Standard:** < 70

Scores are normalized and capped at 100 for compensation purposes even when an underlying productivity metric exceeds its top target.

---

## 8. Incentive schedule

Default configurable incentive schedule as a percentage of eligible base pay for the review period:

- Outstanding: up to 15%
- Exceeds Standard: up to 10%
- Meets Standard: up to 5%
- Needs Improvement: 0%
- Below Standard: 0%

Example:

If eligible base pay for the period is JMD 120,000 and the technician earns an Exceeds Standard incentive of 10%, incentive pay = JMD 12,000.

The maximum incentive percentage is admin-configurable per compensation plan / technician grade.

---

## 9. Skill and certification premiums

Administrators may define effective-dated premiums for approved skills or certifications.

Examples:

- advanced electrical diagnostics
- generator repair
- welding / fabrication
- refrigeration / HVAC qualification
- manufacturer certification
- senior technician / master technician grade

Premium types may be:

- hourly premium
- fixed amount per period
- fixed amount per qualifying job

A premium must only apply while the technician's skill / certification status is active and valid.

---

## 10. Rework / comeback policy

A comeback must be classified before affecting technician performance:

- workmanship failure
- diagnostic error
- defective replacement part
- customer misuse
- unrelated failure
- manufacturer defect
- incomplete original authorization
- warranty recurrence
- undetermined / supervisor review

Only technician-attributable categories affect First-Time-Fix and rework metrics.

No comeback should be attributed automatically solely because the same customer or equipment returns.

---

## 11. Minimum sample-size protection

Small sample sizes can create misleading scores.

Default rule:

A metric becomes compensation-bearing only when its minimum sample size is met.

Recommended defaults:

- First-Time-Fix: 10 eligible repairs
- QC First-Pass: 10 QC submissions
- Diagnostic Accuracy: 10 assessed repairs
- On-Time Completion: 10 eligible tasks / repairs

When a minimum is not met, the metric is marked `insufficient_sample` and its weight is proportionally redistributed among eligible scored metrics or the period is held for supervisor review according to admin configuration.

---

## 12. Review periods

Supported review periods:

- weekly (operational feedback only by default)
- biweekly
- monthly (recommended compensation period)
- quarterly

The system should show rolling 30-day and 90-day trends even when payroll incentive calculation is monthly.

---

## 13. Admin controls

Authorized admins must be able to configure:

- technician base hourly rate
- overtime multiplier
- technician grade
- incentive cap
- performance band percentages
- individual metric weights
- target / minimum / excellent thresholds
- anti-rush efficiency cap
- review period
- comeback observation window
- minimum sample sizes
- skill / certification premiums
- branch-specific plans
- effective dates

Admin UI must include a preview showing how a proposed configuration would score representative historical data before activation where historical data is available.

---

## 14. Employee visibility

Technicians should be able to see:

- their current base rate where company policy permits
- current compensation plan / grade
- metric definitions
- target thresholds
- current score
- trend vs previous period
- jobs contributing to each metric
- excluded jobs and exclusion reasons
- quality-gate state
- projected incentive (clearly labeled as projected until period close)
- finalized incentive after approval

The score must never be a black box.

---

## 15. Supervisor review and disputes

Before finalization, supervisors may review exceptions such as:

- incorrectly attributed comeback
- waiting time not coded
- team-job labor allocation
- incorrect standard labor time
- approved training / meetings
- technician reassignment
- extraordinary equipment condition

Every override requires a reason and is recorded in the audit log.

Technician disputes should attach to a specific metric / job / payroll period rather than editing raw records invisibly.

---

## 16. Payroll-period lifecycle

Recommended states:

`open -> calculated -> supervisor_review -> approved -> finalized -> exported`

A finalized period is immutable.

Any post-finalization correction creates an adjustment in a later period with a reference to the original period.

---

## 17. Required system data

The compensation engine will rely on:

- employee / technician identity
- effective-dated pay rate
- scheduled / eligible working time
- work-order task assignment
- actual task time entries
- standard / allotted task minutes
- work-order completion date
- internal promised / target date
- QC result and reason codes
- comeback record and attribution code
- diagnosis and final repair result
- documentation checklist completion
- parts usage / returns / variance
- safety / compliance exceptions
- approved time exclusions
- skill / certification records

No compensation result should be calculated from manually typed aggregate scores when underlying operational data is available.

---

## 18. API / SmartCommerce export requirements

The POS integration contract should eventually expose:

- `technician_compensation_plans`
- `technician_rates`
- `technician_performance_periods`
- `technician_metric_results`
- `technician_incentive_results`
- `technician_skills`
- `technician_certifications`
- `technician_time_classifications`
- `technician_performance_exceptions`
- `technician_compensation_adjustments`

SmartCommerce may display authorized performance information, but the POS / operations system remains the authoritative source for compensation calculations and approvals.

---

## 19. Default governance rule

The system's governing principle is:

> Quality first, productivity second, transparency always.

No technician should earn more merely by rushing work, and no technician should lose performance credit because of delays outside their reasonable control.
