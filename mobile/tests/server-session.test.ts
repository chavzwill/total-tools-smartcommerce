import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {beforeEach,afterEach,it,expect} from 'vitest';
import {createMobileSessionService} from '../../smartcommerce-ai/src/server/mobile/sessionService';
let db:PGlite;
beforeEach(async()=>{
 db=new PGlite();
 await db.exec("CREATE TABLE customer_accounts(id text PRIMARY KEY,full_name text,password_hash text); INSERT INTO customer_accounts VALUES ('one','Chavez','password-stamp');");
 await db.exec("CREATE TABLE customer_authenticators(customer_id text,status text,revoked_at timestamptz); CREATE TABLE customer_sessions(id text,customer_id text,revoked_at timestamptz); CREATE TABLE courier_sessions(account_id text,revoked_at timestamptz);");
 await db.exec(await readFile(new URL('../../smartcommerce-ai/migrations/20261027_mobile_sessions.sql',import.meta.url),'utf8'));
});
afterEach(async()=>{await db.close();});
const service=()=>createMobileSessionService({query:async(sql,params)=>(await db.query(sql,params)).rows});
it('stores only hashes, separates audiences and rotates refresh credentials',async()=>{
 const svc=service();const session=await svc.issue('one','customer','phone');
 expect(await svc.actor(session.accessToken,'courier')).toBeNull();
 expect((await svc.actor(session.accessToken,'customer'))?.account.id).toBe('one');
 const rows=await db.query('SELECT * FROM mobile_refresh_credentials');
 expect(JSON.stringify(rows.rows)).not.toContain(session.refreshToken);
 const rotated=await svc.refresh(session.refreshToken,'customer');expect(rotated?.refreshToken).not.toBe(session.refreshToken);
 expect(await svc.actor(session.accessToken,'customer')).toBeNull();
 expect((await svc.actor(rotated!.accessToken,'customer'))?.account.id).toBe('one');
});
it('revokes the entire family when an old refresh credential is replayed',async()=>{
 const svc=service();const s=await svc.issue('one','customer','phone');const next=await svc.refresh(s.refreshToken,'customer');
 expect(await svc.refresh(s.refreshToken,'customer')).toBeNull();
 expect(await svc.actor(next!.accessToken,'customer')).toBeNull();expect(await svc.refresh(next!.refreshToken,'customer')).toBeNull();
});
it('can log out using an old rotated credential without affecting another device',async()=>{
 const svc=service(),s=await svc.issue('one','customer','phone'),other=await svc.issue('one','customer','tablet');
 const next=await svc.refresh(s.refreshToken,'customer');await svc.logout(s.refreshToken,'customer');
 expect(await svc.actor(next!.accessToken,'customer')).toBeNull();expect(await svc.actor(other.accessToken,'customer')).not.toBeNull();
});
it('rejects expired access and refresh credentials and password-reset sessions',async()=>{
 const svc=service(),s=await svc.issue('one','customer','phone');
 await db.exec("UPDATE mobile_sessions SET access_expires_at=now()-interval '1 second'");expect(await svc.actor(s.accessToken,'customer')).toBeNull();
 await db.exec("UPDATE mobile_sessions SET refresh_expires_at=now()-interval '1 second'");expect(await svc.refresh(s.refreshToken,'customer')).toBeNull();
 const n=await svc.issue('one','customer','phone');await db.exec("UPDATE customer_accounts SET password_hash='reset'");
 expect(await svc.actor(n.accessToken,'customer')).toBeNull();expect(await svc.refresh(n.refreshToken,'customer')).toBeNull();
});
it('does not rotate or revoke a session for the wrong audience',async()=>{
 const svc=service(),s=await svc.issue('one','customer','phone');
 expect(await svc.refresh(s.refreshToken,'courier')).toBeNull();await svc.logout(s.refreshToken,'courier');
 expect(await svc.actor(s.accessToken,'customer')).not.toBeNull();
});
it('rejects a password change between verification and session issuance',async()=>{
 await expect(service().issue('one','customer','phone','old-password-stamp')).rejects.toThrow('ACCOUNT_UNAVAILABLE');
 expect((await db.query('SELECT id FROM mobile_sessions')).rows).toEqual([]);
});
it('logout-all revokes both app audiences for an account',async()=>{
 await db.exec("INSERT INTO customer_sessions VALUES ('browser','one',NULL); INSERT INTO courier_sessions VALUES ('one',NULL);");
 const svc=service(),one=await svc.issue('one','customer','phone'),two=await svc.issue('one','courier','phone');
 await svc.logoutAll('one');expect(await svc.actor(one.accessToken,'customer')).toBeNull();expect(await svc.actor(two.accessToken,'courier')).toBeNull();
 expect((await db.query<{revoked_at:Date|null}>('SELECT revoked_at FROM customer_sessions')).rows[0].revoked_at).not.toBeNull();
 expect((await db.query<{revoked_at:Date|null}>('SELECT revoked_at FROM courier_sessions')).rows[0].revoked_at).not.toBeNull();
});
it('enabling MFA invalidates existing password-only mobile sessions',async()=>{
 const svc=service(),s=await svc.issue('one','customer','phone');
 await db.exec("INSERT INTO customer_authenticators VALUES ('one','active',NULL)");
 expect(await svc.actor(s.accessToken,'customer')).toBeNull();expect(await svc.refresh(s.refreshToken,'customer')).toBeNull();
 await expect(svc.issue('one','customer','phone')).rejects.toThrow('ACCOUNT_UNAVAILABLE');
});
it('concurrent refresh reuse cannot leave a valid session behind',async()=>{
 const svc=service(),s=await svc.issue('one','customer','phone');
 const results=await Promise.all([svc.refresh(s.refreshToken,'customer'),svc.refresh(s.refreshToken,'customer')]);
 for(const result of results)if(result)expect(await svc.actor(result.accessToken,'customer')).toBeNull();
 expect(await svc.refresh(s.refreshToken,'customer')).toBeNull();
});
it('browser revocation preserves only its initiating session and never another account',async()=>{
 const svc=service(),s=await svc.issue('one','customer','phone');
 await db.exec("INSERT INTO customer_sessions VALUES ('keep','one',NULL),('other','one',NULL),('unrelated','two',NULL); INSERT INTO courier_sessions VALUES ('one',NULL),('two',NULL);");
 await db.query('SELECT mobile_revoke_account_sessions($1,$2)',['one','keep']);
 expect(await svc.actor(s.accessToken,'customer')).toBeNull();
 const rows=(await db.query<{id:string;revoked_at:Date|null}>('SELECT id,revoked_at FROM customer_sessions ORDER BY id')).rows;
 expect(rows.find(r=>r.id==='keep')?.revoked_at).toBeNull();expect(rows.find(r=>r.id==='other')?.revoked_at).not.toBeNull();expect(rows.find(r=>r.id==='unrelated')?.revoked_at).toBeNull();
 expect((await db.query<{revoked_at:Date|null}>('SELECT revoked_at FROM courier_sessions WHERE account_id=$1',['two'])).rows[0].revoked_at).toBeNull();
});
