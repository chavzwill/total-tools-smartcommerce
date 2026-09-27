import {createHash,createHmac} from 'node:crypto';
import type {CourierActor} from '../../types/courier.js';
import {courierDb} from './repository.js';
import {CourierError} from './policy.js';
import {seal,unseal,validateDocument,credentialHash} from './privateData.js';
const uuid=/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const actions=['upload_document','read_document','review_document','save_bank','read_bank','read_payout_bank','review_bank','invite_driver','accept_invite','remove_driver','issue_pass','revoke_pass','scan_pass','confirm_pickup','request_payout','payout_status'];
export function validatePrivateCommand(input:unknown){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new CourierError('COURIER_INVALID_COMMAND');
  const c=input as Record<string,unknown>;
  if(Object.keys(c).some(k=>!['action','id','organizationId','expectedVersion','kind','mime','data','bank','email','token','currency','status','reason','transferReference','idempotencyKey'].includes(k))||!actions.includes(String(c.action))||!uuid.test(String(c.idempotencyKey)))throw new CourierError('COURIER_INVALID_COMMAND');
  for(const k of ['id','organizationId'])if(c[k]!==undefined&&!uuid.test(String(c[k])))throw new CourierError('COURIER_INVALID_COMMAND');
  const action=String(c.action);
  if(['upload_document','read_document','read_payout_bank','review_document','accept_invite','remove_driver','confirm_pickup','request_payout','payout_status'].includes(action)&&!uuid.test(String(c.id)))throw new CourierError('COURIER_INVALID_COMMAND');
  if(['save_bank','read_bank','review_bank','invite_driver','remove_driver','request_payout'].includes(action)&&!uuid.test(String(c.organizationId)))throw new CourierError('COURIER_INVALID_COMMAND');
  if(['upload_document','review_document','save_bank','review_bank','remove_driver','confirm_pickup','payout_status'].includes(action)&&(!Number.isSafeInteger(c.expectedVersion)||Number(c.expectedVersion)<0))throw new CourierError('COURIER_INVALID_COMMAND');
  if(c.expectedVersion!==undefined&&(!Number.isSafeInteger(c.expectedVersion)||Number(c.expectedVersion)<0))throw new CourierError('COURIER_INVALID_COMMAND');
  for(const k of ['reason','transferReference','email','currency','status','kind','mime','token'])if(c[k]!==undefined&&(typeof c[k]!=='string'||String(c[k]).length>(k==='reason'?1000:254)))throw new CourierError('COURIER_INVALID_COMMAND');
  return c;
}
export async function readCourierPrivate(actor:CourierActor,cursor?:string){
  const db=courierDb();
  if(actor.kind==='staff'){
    if(cursor&&!/^(document|bank|payout):[a-f\d-]{36}$/.test(cursor))throw new CourierError('COURIER_INVALID_COMMAND');
    const verify=actor.permissions.couriers_verify===true,pay=actor.permissions.couriers_payments===true;
    const rows=await db`SELECT * FROM (
      SELECT 'document:'||d.id::text AS cursor,jsonb_build_object('type','document','id',d.id,'accountId',d.account_id,'name',c.full_name,'kind',d.kind,'status',d.status,'version',d.version,'reason',d.reason) AS record FROM courier_identity_documents d JOIN customer_accounts c ON c.id::text=d.account_id WHERE ${verify}
      UNION ALL SELECT 'bank:'||b.organization_id::text,jsonb_build_object('type','bank','id',b.organization_id,'organizationId',b.organization_id,'name',o.profile->>'businessName','status',b.status,'version',b.version,'masked',b.masked,'reason',b.reason) FROM courier_bank_accounts b JOIN courier_organizations o ON o.id=b.organization_id WHERE ${pay}
      UNION ALL SELECT 'payout:'||p.id::text,jsonb_build_object('type','payout','id',p.id,'organizationId',p.organization_id,'name',o.profile->>'businessName','status',p.status,'version',p.version,'amountMinor',p.amount_minor::text,'currency',p.currency,'transferReference',p.transfer_reference) FROM courier_payouts p JOIN courier_organizations o ON o.id=p.organization_id WHERE ${pay}
    ) records WHERE (${cursor||null}::text IS NULL OR records.cursor>${cursor||null}) ORDER BY cursor LIMIT 51`;
    return {records:rows.slice(0,50).map(r=>r.record),nextCursor:rows.length>50?rows[49].cursor:null,canScan:actor.permissions.couriers_pickup===true,handoverAvailable:false};
  }
  const docs=await db`SELECT id,kind,status,version,reason FROM courier_identity_documents WHERE account_id=${actor.customerId} ORDER BY kind`;
  const orgs=await db`SELECT id FROM courier_organizations WHERE owner_customer_id::text=${actor.customerId}`;
  const organizationId=orgs[0]?.id;
  const bank=organizationId?await db`SELECT organization_id AS id,masked,version,status,reason FROM courier_bank_accounts WHERE organization_id=${organizationId}::uuid`:[];
  const drivers=organizationId?await db`SELECT d.id,c.full_name AS name,d.active,d.version,COALESCE(v.status,'unsubmitted') AS verification FROM courier_drivers d JOIN customer_accounts c ON c.id::text=d.account_id LEFT JOIN courier_identity_documents v ON v.account_id=d.account_id AND v.kind='identity' WHERE d.organization_id=${organizationId}::uuid ORDER BY d.created_at LIMIT 100`:[];
  const membership=await db`SELECT d.id,d.active,o.profile->>'businessName' AS "businessName",o.status AS "organizationStatus" FROM courier_drivers d JOIN courier_organizations o ON o.id=d.organization_id WHERE d.account_id=${actor.customerId}`;
  const earnings=organizationId?await db`SELECT currency,status,sum(amount_minor)::text AS "amountMinor" FROM courier_earnings WHERE organization_id=${organizationId}::uuid GROUP BY currency,status`:[];
  const payouts=organizationId?await db`SELECT id,status,currency,amount_minor::text AS "amountMinor",transfer_reference AS "transferReference" FROM courier_payouts WHERE organization_id=${organizationId}::uuid ORDER BY created_at DESC LIMIT 50`:[];
  return {documents:docs,bank:bank[0]||null,drivers,membership:membership[0]||null,earnings,payouts,bookingAvailable:false,handoverAvailable:false};
}
export async function mutateCourierPrivate(actor:CourierActor,raw:Record<string,unknown>){
  const command={...raw};const secret=process.env.SMARTCOMMERCE_COURIER_DATA_KEY||'';
  let issuedToken:string|undefined;
  if(['upload_document','save_bank','issue_pass','invite_driver'].includes(String(command.action))&&Buffer.from(secret,'base64').length!==32)throw new CourierError('COURIER_UNAVAILABLE',503);
  if(command.action==='upload_document'){
    if(typeof command.data!=='string'||command.data.length>3*1024*1024||!['identity','business'].includes(String(command.kind)))throw new CourierError('COURIER_INVALID_COMMAND');
    const bytes=Buffer.from(command.data,'base64');try{validateDocument(bytes,String(command.mime));}catch{throw new CourierError('COURIER_INVALID_DOCUMENT');}
    command.encrypted=seal(bytes,secret);command.fingerprint=createHash('sha256').update(bytes).digest('hex');delete command.data;
  }
  if(command.action==='save_bank'){
    const bank=command.bank as Record<string,unknown>;
    if(!bank||typeof bank!=='object'||Array.isArray(bank)||Object.keys(bank).some(k=>!['bankName','accountName','accountNumber','routing','currency'].includes(k))||['bankName','accountName','accountNumber','currency'].some(k=>typeof bank[k]!=='string'||!String(bank[k]).trim()||String(bank[k]).length>150)||typeof bank.routing!=='string'||bank.routing.length>150||! /^[A-Z]{3}$/.test(String(bank.currency)))throw new CourierError('COURIER_INVALID_COMMAND');
    const data=Buffer.from(JSON.stringify(bank));command.encrypted=seal(data,secret);command.fingerprint=createHash('sha256').update(data).digest('hex');command.currency=bank.currency;command.masked=String(bank.bankName)+' **'+String(bank.accountNumber).slice(-4);delete command.bank;
  }
  if(command.action==='invite_driver'){
    if(typeof command.email!=='string'||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(command.email))throw new CourierError('COURIER_INVALID_COMMAND');command.email=command.email.trim().toLowerCase();
  }
  if(['issue_pass','invite_driver'].includes(String(command.action))){
    issuedToken=createHmac('sha256',Buffer.from(secret,'base64')).update(JSON.stringify([actor,command.action,command.idempotencyKey])).digest('base64url');command.tokenHash=credentialHash(issuedToken);
  }
  if(['accept_invite','scan_pass','confirm_pickup'].includes(String(command.action))){if(typeof command.token!=='string'||! /^[A-Za-z0-9_-]{43}$/.test(command.token))throw new CourierError('COURIER_INVALID_COMMAND');command.tokenHash=credentialHash(command.token);delete command.token;}
  if(command.action==='accept_invite'){
    if(actor.kind!=='owner')throw new CourierError('COURIER_FORBIDDEN',403);
    const rows=await courierDb()`SELECT email,email_verified FROM customer_accounts WHERE id::text=${actor.customerId}`;command.authenticatedEmail=rows[0]?.email;command.emailVerified=rows[0]?.email_verified===true;
  }
  try{
    const rows=await courierDb()`SELECT courier_private_mutate(${JSON.stringify(actor)}::jsonb,${JSON.stringify(command)}::jsonb) AS result`;
    const result=rows[0].result;
    if(result.encrypted){const plain=unseal(result.encrypted,secret);delete result.encrypted;if(command.action==='read_document')result.data=plain.toString('base64');else result.bank=JSON.parse(plain.toString());}
    if(issuedToken)result.token=issuedToken;
    return {result};
  }catch(e){const message=String((e as Error).message);if(/^COURIER_[A-Z_]+$/.test(message))throw new CourierError(message,message.includes('FORBIDDEN')?403:409);throw new CourierError('COURIER_UNAVAILABLE',503);}
}
