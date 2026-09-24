/** Staff decisions belong in the POS UI, never a SmartCommerce proxy. */
export function staffDecisionRequiresPos(resource:string, action:string):boolean {
 return resource==='compensation' ? ['approve_period','finalize_period'].includes(action) : resource==='repair' && action==='record_decision';
}
/** Generic upstream writes can carry decisions in arbitrary bodies. Read-only until a non-decision contract is explicitly allowlisted. */
export function operationsReadOnly(method:string):boolean { return !['GET','HEAD'].includes(method.toUpperCase()); }
export const POS_APPROVAL_MESSAGE='Staff approvals and payment decisions must be completed in the POS. Approval synchronization is not connected yet.';
