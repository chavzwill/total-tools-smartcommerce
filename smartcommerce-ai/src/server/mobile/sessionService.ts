import {createHash,randomBytes} from 'node:crypto';

type Audience='customer'|'courier';
type Db={query:(sql:string,params:unknown[])=>Promise<any[]>};
type Row={id:string;customer_id:string;full_name:string;audience:Audience;access_expires_at:Date|string;refresh_expires_at:Date|string};
const hash=(token:string)=>createHash('sha256').update(token).digest('hex');
const freshToken=()=>randomBytes(32).toString('base64url');
const validToken=(token:unknown):token is string=>typeof token==='string'&&/^[A-Za-z0-9_-]{43}$/.test(token);
const validAudience=(value:unknown):value is Audience=>value==='customer'||value==='courier';
function present(row:Row,accessToken:string,refreshToken:string){return {accessToken,refreshToken,accessExpiresAt:new Date(row.access_expires_at).toISOString(),refreshExpiresAt:new Date(row.refresh_expires_at).toISOString(),account:{id:row.customer_id,fullName:row.full_name},audience:row.audience};}

/** Called only after password and required MFA authentication by the HTTP layer. */
export function createMobileSessionService(db:Db){
 return {
  async issue(accountId:string,audience:Audience,deviceId:string,credentialStamp?:string){
   if(!validAudience(audience)||typeof deviceId!=='string'||!deviceId.trim()||deviceId.length>200)throw Error('INVALID_SESSION_INPUT');
   const accessToken=freshToken(),refreshToken=freshToken(),id=`mob_${freshToken()}`;
   const rows=await db.query(`WITH created AS (
    INSERT INTO mobile_sessions(id,customer_id,audience,device_id,credential_stamp,access_hash,access_expires_at,refresh_expires_at)
    SELECT $1,c.id,$2,$3,c.password_hash,$4,now()+interval '15 minutes',now()+interval '30 days' FROM customer_accounts c WHERE c.id=$5 AND ($7::text IS NULL OR c.password_hash=$7) AND NOT EXISTS (SELECT 1 FROM customer_authenticators a WHERE a.customer_id=c.id AND a.status='active' AND a.revoked_at IS NULL)
    RETURNING *), credential AS (
    INSERT INTO mobile_refresh_credentials(token_hash,session_id) SELECT $6,id FROM created RETURNING session_id)
    SELECT s.*,c.full_name FROM created s JOIN customer_accounts c ON c.id=s.customer_id JOIN credential r ON r.session_id=s.id`,[id,audience,deviceId,hash(accessToken),accountId,hash(refreshToken),credentialStamp??null]);
   if(!rows[0])throw Error('ACCOUNT_UNAVAILABLE');
   return present(rows[0],accessToken,refreshToken);
  },
  async actor(accessToken:string,audience:Audience){
   if(!validToken(accessToken)||!validAudience(audience))return null;
   const rows=await db.query(`SELECT s.id,s.customer_id,s.audience,c.full_name FROM mobile_sessions s JOIN customer_accounts c ON c.id=s.customer_id WHERE s.access_hash=$1 AND s.audience=$2 AND s.revoked_at IS NULL AND s.access_expires_at>now() AND s.refresh_expires_at>now() AND s.credential_stamp=c.password_hash AND NOT EXISTS (SELECT 1 FROM customer_authenticators a WHERE a.customer_id=c.id AND a.status='active' AND a.revoked_at IS NULL)`,[hash(accessToken),audience]);
   return rows[0]?{sessionId:rows[0].id,account:{id:rows[0].customer_id,fullName:rows[0].full_name},audience:rows[0].audience}:null;
  },
  async refresh(token:string,audience:Audience){
   if(!validToken(token)||!validAudience(audience))return null;
   const accessToken=freshToken(),refreshToken=freshToken();
   const result=await db.query('SELECT session_id FROM mobile_rotate_refresh($1,$2,$3,$4)',[hash(token),audience,hash(accessToken),hash(refreshToken)]);
   if(!result[0])return null;
   const rows=await db.query(`SELECT s.*,c.full_name FROM mobile_sessions s JOIN customer_accounts c ON c.id=s.customer_id WHERE s.id=$1 AND s.access_hash=$2 AND s.revoked_at IS NULL AND s.credential_stamp=c.password_hash AND NOT EXISTS (SELECT 1 FROM customer_authenticators a WHERE a.customer_id=c.id AND a.status='active' AND a.revoked_at IS NULL)`,[result[0].session_id,hash(accessToken)]);
   return rows[0]?present(rows[0],accessToken,refreshToken):null;
  },
  async logout(token:string,audience:Audience){
   if(!validToken(token)||!validAudience(audience))return;
   await db.query(`UPDATE mobile_sessions SET revoked_at=now() WHERE audience=$2 AND id IN (SELECT session_id FROM mobile_refresh_credentials WHERE token_hash=$1) AND revoked_at IS NULL`,[hash(token),audience]);
  },
  async logoutAll(accountId:string){await db.query('SELECT mobile_revoke_account_sessions($1,NULL)',[accountId]);}
 };
}
