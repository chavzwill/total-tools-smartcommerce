import {it,expect,beforeEach,afterEach,describe} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {createHmac} from 'node:crypto';
import {Readable} from 'node:stream';
import {createPosDriverHandler,parseDriverDecision} from '../../smartcommerce-ai/src/server/mobile/posDriverDecision';
const driver='00000000-0000-4000-8000-000000000001',org='00000000-0000-4000-8000-000000000002';
const now=Date.parse('2026-10-27T12:00:00Z'),secret='test-secret-with-at-least-32-characters';
const event=(version=1,extra:any={})=>({eventId:'event-'+version,source:'total_tools_pos',entityType:'courier_driver',eventType:'courier_driver.decision',entityId:'pos-driver',entityVersion:version,occurredAt:new Date(now).toISOString(),correlationId:'correlation',payload:{driverId:driver,organizationId:org,accountId:'one',posOrganizationId:'pos-org',organizationStatus:'approved',driverStatus:'approved',actorId:'staff-1',reason:'Reviewed',validUntil:new Date(now+900000).toISOString()},...extra});
async function request(value:any,{enabled=true,signature=true,timestamp=now/1000,bodyOverride,apply=async()=>({disposition:'applied'})}:any={}){
 const body=bodyOverride??JSON.stringify(value);let status=0,payload:any,calls=0;
 const handler=createPosDriverHandler({enabled:()=>enabled,secret:()=>secret,now:()=>now,apply:async e=>{calls++;return apply(e);}});
 const sig=createHmac('sha256',secret).update(timestamp+'.'+body).digest('hex');
 await handler(Object.assign(Readable.from([body]),{method:'POST',headers:{'x-pos-timestamp':String(timestamp),'x-pos-signature':signature?sig:'0'.repeat(64)}}),{statusCode:0,setHeader(){},end(s:string){status=this.statusCode;payload=JSON.parse(s);}});
 return {status,payload,calls};
}
it('requires activation and authenticates raw body before any write',async()=>{
 expect(await request(event(),{enabled:false})).toMatchObject({status:503,calls:0});
 expect(await request(event(),{signature:false})).toMatchObject({status:401,calls:0});
 expect(await request(event(),{timestamp:now/1000-301})).toMatchObject({status:401,calls:0});
 expect(await request(event())).toMatchObject({status:202,calls:1});
});
it('rejects unknown authority fields, expired grants, oversized bodies and malformed JSON',async()=>{
 for(const bad of [event(1,{extra:true}),event(1,{entityType:'driver'}),event(1,{entityVersion:1.5}),event(1,{payload:{...event().payload,driverStatus:['approved']}}),event(1,{payload:{...event().payload,canUpdate:true}}),event(1,{payload:{...event().payload,validUntil:new Date(now-1).toISOString()}})])expect(await request(bad)).toMatchObject({status:400,calls:0});
 expect(await request(null,{bodyOverride:'x'.repeat(17000)})).toMatchObject({status:413,calls:0});
 expect(await request(null,{bodyOverride:'{'})).toMatchObject({status:400,calls:0});
 expect(parseDriverDecision(event(1,{payload:{...event().payload,validUntil:new Date(now+900001).toISOString()}}),now)).toBeNull();
});
it('reports conflict and sanitizes unexpected errors',async()=>{
 expect((await request(event(),{apply:async()=>({disposition:'conflict'})})).status).toBe(409);
 const r=await request(event(),{apply:async()=>{throw Error('private credential');}});expect(r.status).toBe(503);expect(JSON.stringify(r)).not.toContain('credential');
});
describe('database admission',()=>{
let db:PGlite;
beforeEach(async()=>{db=new PGlite();await db.exec(`CREATE TABLE courier_organizations(id uuid PRIMARY KEY);CREATE TABLE courier_drivers(id uuid PRIMARY KEY,organization_id uuid,account_id text,active boolean);INSERT INTO courier_organizations VALUES('${org}');INSERT INTO courier_drivers VALUES('${driver}','${org}','one',true);`);await db.exec(await readFile(new URL('../../smartcommerce-ai/migrations/20261027_pos_driver_decisions.sql',import.meta.url),'utf8'));});
afterEach(async()=>{await db.close();});
async function apply(e:any){return (await db.query<any>('SELECT mobile_apply_pos_driver_decision($1::jsonb) AS result',[JSON.stringify(e)])).rows[0].result;}
it('admits atomically, replays safely and rejects stale/conflicting versions and event collisions',async()=>{
 expect((await apply(event())).disposition).toBe('applied');expect((await apply(event())).disposition).toBe('replayed');
 expect((await apply(event(1,{eventId:'another'}))).disposition).toBe('replayed');
 expect((await apply(event(1,{eventId:'conflict',payload:{...event().payload,driverStatus:'suspended'}}))).disposition).toBe('conflict');
 expect((await apply(event(2,{eventId:'event-1'}))).disposition).toBe('conflict');
 const conflict=event(1,{eventId:'repeat-conflict',payload:{...event().payload,driverStatus:'revoked'}});
 expect((await apply(conflict)).disposition).toBe('conflict');expect((await apply(conflict)).disposition).toBe('conflict');
 expect((await apply(event(2))).disposition).toBe('applied');expect((await apply(event(1,{eventId:'old'}))).disposition).toBe('stale');
 expect(Number((await db.query<any>('SELECT entity_version FROM mobile_pos_driver_decisions')).rows[0].entity_version)).toBe(2);
});
it('binds exact existing membership and never promotes legacy records',async()=>{
 expect((await apply(event(1,{eventId:'blocked-other',payload:{...event().payload,accountId:'other'}}))).disposition).toBe('blocked');
 expect((await db.query('SELECT * FROM mobile_pos_driver_decisions')).rows).toHaveLength(0);expect((await apply(event())).disposition).toBe('applied');
 expect((await apply(event(2,{entityId:'different-pos-driver'}))).disposition).toBe('conflict');
 expect((await apply(event(2,{eventId:'org-remap',payload:{...event().payload,posOrganizationId:'other-pos-org'}}))).disposition).toBe('conflict');
 expect((await db.query<any>('SELECT active FROM courier_drivers')).rows[0].active).toBe(true);
});
it('reads matching accounts only, expires grants and never grants action capability',async()=>{
 await apply(event());
 const read=async(account='one',at=now)=>(await db.query<any>('SELECT mobile_pos_driver_decision($1,$2::timestamptz) AS result',[account,new Date(at).toISOString()])).rows[0].result;
 expect(await read()).toMatchObject({state:'approved',canUpdate:false});expect(await read('other')).toBeNull();
 expect(await read('one',now+900001)).toMatchObject({state:'expired',canUpdate:false});
 await apply(event(2,{payload:{...event().payload,driverStatus:'suspended'}}));expect(await read()).toMatchObject({state:'suspended',canUpdate:false});
 await db.exec(`UPDATE courier_drivers SET account_id='other'`);expect(await read()).toBeNull();expect(await read('other')).toBeNull();
});

it('retains blocked event identity while permitting exact retry after membership provisioning',async()=>{
 const blocked=event(1,{payload:{...event().payload,accountId:'other'}});
 expect((await apply(blocked)).disposition).toBe('blocked');
 expect((await apply(event())).disposition).toBe('conflict');
 await db.exec("UPDATE courier_drivers SET account_id='other'");
 expect((await apply(blocked)).disposition).toBe('applied');
 expect((await apply(blocked)).disposition).toBe('replayed');
});

});
