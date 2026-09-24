/** POS decision ingestion is not connected. Never infer POS approval from legacy local flags. */
export function courierAuthorityError(action:string):string|null{
 if(['approve','reject','suspend','reinstate','review_document','review_bank','payout_status'].includes(action))return 'COURIER_POS_AUTHORITY_REQUIRED';
 if(['issue_pass','confirm_pickup','accept','assign'].includes(action))return 'COURIER_POS_VERIFICATION_PENDING';
 return null;
}
