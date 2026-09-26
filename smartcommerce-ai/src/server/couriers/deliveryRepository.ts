import {createHash} from 'node:crypto';
import type {CourierActor} from '../../types/courier.js';
import {courierDb} from './repository.js';
import {CourierError} from './policy.js';
import {prepareDeliveryCommand,validateDeliveryCommand} from './deliveryValidation.js';
import {unseal} from './privateData.js';
export type DeliveryAudience='courier'|'customer'|'staff';
function safeError(error:unknown):never{
  const code=String((error as Error)?.message);
  const statuses:Record<string,number>={COURIER_NOT_FOUND:404,COURIER_FORBIDDEN:403,COURIER_STATE_CONFLICT:409,COURIER_IDEMPOTENCY_CONFLICT:409,COURIER_VERIFICATION_REQUIRED:409,COURIER_POS_VERIFICATION_PENDING:409,COURIER_INVALID_COMMAND:400,COURIER_REASON_REQUIRED:400,COURIER_PROOF_REQUIRED:400};
  throw new CourierError(statuses[code]?code:'COURIER_UNAVAILABLE',statuses[code]||503);
}
export async function readDeliveries(actor:CourierActor,audience:DeliveryAudience,cursor?:string){
  if(cursor&&!/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(cursor))throw new CourierError('COURIER_INVALID_COMMAND');
  try{const rows=await courierDb()`SELECT courier_delivery_read(${JSON.stringify(actor)}::jsonb,${audience},${cursor||null}::uuid) AS result`;return rows[0].result;}catch(e){safeError(e);}
}
export async function mutateDelivery(actor:CourierActor,audience:DeliveryAudience,raw:Record<string,unknown>){
  const command=validateDeliveryCommand(raw),secret=process.env.SMARTCOMMERCE_COURIER_DATA_KEY||'';
  if(command.action==='read_proof'){
    try{
      const rows=await courierDb()`SELECT courier_delivery_proof_read(${JSON.stringify(actor)}::jsonb,${audience},${command.id}::uuid) AS result`;
      const proof=rows[0].result;
      const plain=unseal(proof.encrypted,secret);
      if(createHash('sha256').update(plain).digest('hex')!==proof.fingerprint)throw new Error('Invalid stored proof');
      const payload=JSON.parse(plain.toString('utf8'));
      return {result:{recipient:payload.recipient,mime:payload.mime,data:payload.data,createdAt:proof.createdAt}};
    }catch(e){safeError(e);}
  }
  if(audience!=='courier'||actor.kind!=='owner')throw new CourierError('COURIER_FORBIDDEN',403);
  const prepared=prepareDeliveryCommand(command,secret);
  try{const rows=await courierDb()`SELECT courier_delivery_mutate(${JSON.stringify(actor)}::jsonb,${JSON.stringify(prepared)}::jsonb) AS result`;return {result:rows[0].result};}catch(e){safeError(e);}
}
