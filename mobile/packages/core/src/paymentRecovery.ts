import type {AppAudience} from './contracts';
import type {SecureSessionStore} from './session';
export function createPaymentRecovery(store:SecureSessionStore,audience:AppAudience){
 const key=(accountId:string)=>{if(!/^[A-Za-z0-9_-]{1,160}$/.test(accountId))throw Error('Invalid account identity');return `smartcommerce.${audience}.payment.${accountId}`;};
 return {
  async save(accountId:string,quoteId:string){if(!/^[A-Za-z0-9_-]{1,160}$/.test(quoteId))throw Error('Invalid checkout identity');await store.set(key(accountId),quoteId);},
  async read(accountId:string){const value=await store.get(key(accountId));if(value&&!/^[A-Za-z0-9_-]{1,160}$/.test(value)){await store.remove(key(accountId));return null;}return value;},
  async clear(accountId:string){await store.remove(key(accountId));}
 };
}
