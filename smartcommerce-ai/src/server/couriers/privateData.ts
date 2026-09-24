import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
type Box={iv:string;tag:string;body:string};
function key(value:string){const bytes=Buffer.from(value,'base64');if(bytes.length!==32)throw new Error('COURIER_PRIVATE_STORAGE_UNAVAILABLE');return bytes;}
export function seal(data:Buffer,secret:string):Box{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(secret),iv);const body=Buffer.concat([cipher.update(data),cipher.final()]);return {iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),body:body.toString('base64')};}
export function unseal(box:Box,secret:string){const cipher=createDecipheriv('aes-256-gcm',key(secret),Buffer.from(box.iv,'base64'));cipher.setAuthTag(Buffer.from(box.tag,'base64'));return Buffer.concat([cipher.update(Buffer.from(box.body,'base64')),cipher.final()]);}
export function validateDocument(data:Buffer,mime:string){
  if(!data.length||data.length>2*1024*1024)throw new Error('COURIER_INVALID_DOCUMENT');
  const valid=mime==='image/jpeg'?data.subarray(0,3).equals(Buffer.from([255,216,255])):mime==='image/png'?data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mime==='application/pdf'?data.subarray(0,5).toString()==='%PDF-':false;
  if(!valid)throw new Error('COURIER_INVALID_DOCUMENT');return mime;
}
export const newPickupCredential=()=>randomBytes(32).toString('base64url');
export const credentialHash=(value:string)=>createHash('sha256').update(value).digest('hex');
