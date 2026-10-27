import {it,expect} from 'vitest';
import {createPaymentRecovery} from '../packages/core/src/paymentRecovery';
const memory=()=>{const values=new Map<string,string>();return {get:async(k:string)=>values.get(k)||null,set:async(k:string,v:string)=>{values.set(k,v);},remove:async(k:string)=>{values.delete(k);}};};
it('restores pending checkout only for the same account and app',async()=>{
 const store=memory(),recovery=createPaymentRecovery(store,'customer');await recovery.save('one','quote_1');
 expect(await createPaymentRecovery(store,'customer').read('one')).toBe('quote_1');expect(await recovery.read('two')).toBeNull();expect(await createPaymentRecovery(store,'courier').read('one')).toBeNull();
});
it('does not report a recoverable checkout when durable storage fails',async()=>{
 const s=memory();s.set=async()=>{throw Error('locked');};await expect(createPaymentRecovery(s,'customer').save('one','quote')).rejects.toThrow('locked');
});
