import {it,expect} from 'vitest';
import {createSessionManager,type MobileSession} from '../packages/core/src/session';
const expired:MobileSession={accessToken:'old',refreshToken:'refresh',accessExpiresAt:'2020-01-01T00:00:00Z',refreshExpiresAt:'2099-01-01T00:00:00Z',account:{id:'one',fullName:'Customer'},audience:'customer'};
const fresh:MobileSession={...expired,accessToken:'new',refreshToken:'rotated',accessExpiresAt:'2099-01-01T00:00:00Z'};
const memory=()=>{let value:string|null=null;return {get:async()=>value,set:async(_key:string,v:string)=>{value=v;},remove:async()=>{value=null;}};};
it('restores credentials only for the matching app audience',async()=>{
 const store=memory();await store.set('',JSON.stringify({...fresh,audience:'courier'}));
 const manager=createSessionManager({audience:'customer',store,api:{login:async()=>fresh,refresh:async()=>fresh,logout:async()=>{}}});
 expect(await manager.restore()).toBeNull();expect(await store.get()).toBeNull();
});
it('shares one refresh between concurrent callers',async()=>{
 let calls=0;const store=memory();await store.set('',JSON.stringify(expired));
 const manager=createSessionManager({audience:'customer',store,api:{login:async()=>fresh,refresh:async()=>{calls++;await new Promise(r=>setTimeout(r,5));return fresh;},logout:async()=>{}}});
 await manager.restore();expect(await Promise.all(Array.from({length:10},()=>manager.getAccessToken()))).toEqual(Array(10).fill('new'));expect(calls).toBe(1);
});
it('never resurrects a session when refresh finishes after logout',async()=>{
 let resolve!:(s:MobileSession)=>void;const store=memory();await store.set('',JSON.stringify(expired));
 const manager=createSessionManager({audience:'customer',store,api:{login:async()=>fresh,refresh:()=>new Promise(r=>{resolve=r;}),logout:async()=>{}}});
 await manager.restore();const token=manager.getAccessToken();await manager.logout();resolve(fresh);
 expect(await token).toBeNull();expect(await store.get()).toBeNull();
});
it('does not authenticate if secure persistence fails',async()=>{
 const store=memory();store.set=async()=>{throw Error('keychain locked');};
 const manager=createSessionManager({audience:'customer',store,api:{login:async()=>fresh,refresh:async()=>fresh,logout:async()=>{}}});
 await expect(manager.login({email:'a@example.com',password:'password',deviceId:'phone'})).rejects.toThrow();expect(await manager.getAccessToken()).toBeNull();
});
it('does not erase recoverable credentials on a transient refresh failure',async()=>{
 const store=memory();await store.set('',JSON.stringify(expired));
 const manager=createSessionManager({audience:'customer',store,api:{login:async()=>fresh,refresh:async()=>{throw Error('offline');},logout:async()=>{}}});
 await manager.restore();await expect(manager.getAccessToken()).rejects.toThrow('offline');expect(await store.get()).not.toBeNull();
});
it('does not replace a current access token when another screen restores the account',async()=>{
 const manager=createSessionManager({audience:'customer',store:memory(),api:{login:async()=>fresh,refresh:async()=>{throw Error('Unnecessary refresh');},logout:async()=>{}}});
 await manager.login({email:'a@example.com',password:'password',deviceId:'phone'});
 await manager.restore();expect(await manager.getAccessToken()).toBe('new');
});
it('notifies all mounted screens when the account is signed out',async()=>{
 const manager=createSessionManager({audience:'customer',store:memory(),api:{login:async()=>fresh,refresh:async()=>fresh,logout:async()=>{}}});
 const events:Array<string|null>=[];const unsubscribe=manager.subscribe(account=>events.push(account?.id||null));
 await manager.login({email:'a@example.com',password:'password',deviceId:'phone'});await manager.logout();unsubscribe();
 expect(events).toContain('one');expect(events.at(-1)).toBeNull();
});
it('does not sign in after logout interrupts private-data cleanup',async()=>{
 let finish!:()=>void;let clears=0;
 const manager=createSessionManager({audience:'customer',store:memory(),clearPrivateData:async()=>{if(++clears===1)await new Promise<void>(r=>{finish=r;});},api:{login:async()=>fresh,refresh:async()=>fresh,logout:async()=>{}}});
 const login=manager.login({email:'a@example.com',password:'password',deviceId:'phone'});
 await new Promise(r=>setTimeout(r,0));await manager.logout();finish();
 expect(await login).toBeNull();expect(await manager.getAccessToken()).toBeNull();
});
it('uses the refresh credential to revoke a restored session even when access has expired',async()=>{
 const store=memory();let revoked:unknown=null;
 const manager=createSessionManager({audience:'customer',store,api:{login:async()=>fresh,refresh:async()=>fresh,logout:async credential=>{revoked=credential;}}});
 await manager.login({email:'a@example.com',password:'password',deviceId:'phone'});
 const restored=createSessionManager({audience:'customer',store,api:{login:async()=>fresh,refresh:async()=>fresh,logout:async credential=>{revoked=credential;}}});
 await restored.restore();await restored.logout();
 expect(revoked).toEqual({refreshToken:'rotated'});expect(await store.get()).toBeNull();
});
