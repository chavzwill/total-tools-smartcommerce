import {ApiError,type AppAudience} from './contracts';

export type MobileSession={accessToken:string;refreshToken:string;accessExpiresAt:string;refreshExpiresAt:string;account:{id:string;fullName:string};audience:AppAudience};
export type SecureSessionStore={get:(key:string)=>Promise<string|null>;set:(key:string,value:string)=>Promise<void>;remove:(key:string)=>Promise<void>};
export type LoginInput={email:string;password:string;deviceId:string;code?:string};
type Api={login:(input:LoginInput)=>Promise<MobileSession>;refresh:(token:string)=>Promise<MobileSession>;logout:(credential:{refreshToken:string})=>Promise<void>};

export function decodeSession(value:unknown):MobileSession{
 const s=value as MobileSession;
 if(!s||typeof s.accessToken!=='string'||!s.accessToken||typeof s.refreshToken!=='string'||!s.refreshToken||!Number.isFinite(Date.parse(s.accessExpiresAt))||!Number.isFinite(Date.parse(s.refreshExpiresAt))||!s.account||typeof s.account.id!=='string'||!s.account.id||typeof s.account.fullName!=='string'||!['customer','courier'].includes(s.audience))throw Error('Invalid mobile session');
 return {accessToken:s.accessToken,refreshToken:s.refreshToken,accessExpiresAt:s.accessExpiresAt,refreshExpiresAt:s.refreshExpiresAt,account:{id:s.account.id,fullName:s.account.fullName},audience:s.audience};
}

/** Access credentials remain in memory; only the refresh credential is persisted. */
export function createSessionManager({audience,store,api,clearPrivateData=async()=>{}}:{audience:AppAudience;store:SecureSessionStore;api:Api;clearPrivateData?:()=>Promise<void>}){
 const key=`smartcommerce.${audience}.session`;
 let session:MobileSession|null=null,version=0,refreshing:Promise<string|null>|null=null;
 let writes:Promise<void>=Promise.resolve();
 const serialize=(operation:()=>Promise<void>)=>{const next=writes.then(operation,operation);writes=next.catch(()=>{});return next;};
 async function clear(){session=null;version++;await serialize(()=>store.remove(key));await clearPrivateData();}
 async function save(input:MobileSession,expectedVersion:number){
  const next=decodeSession(input);
  if(next.audience!==audience||Date.parse(next.refreshExpiresAt)<=Date.now())throw Error('Invalid session audience or expiry');
  if(version!==expectedVersion)return false;
  await serialize(async()=>{
   if(version!==expectedVersion)return;
   await store.set(key,JSON.stringify({...next,accessToken:'restored-placeholder',accessExpiresAt:'1970-01-01T00:00:00Z'}));
  });
  if(version!==expectedVersion)return false;
  session=next;return true;
 }
 return {
  async restore(){
   const stamp=version;
   const raw=await store.get(key);
   if(version!==stamp||!raw)return null;
   try{const next=decodeSession(JSON.parse(raw));if(next.audience!==audience||Date.parse(next.refreshExpiresAt)<=Date.now())throw Error('expired');session=next;return next.account;}
   catch{await clear();return null;}
  },
  async login(input:LoginInput){
   const stamp=version+1;await clear();if(version!==stamp)return null;
   const next=await api.login(input);
   return await save(next,stamp)?next.account:null;
  },
  async logout(){const token=session?.refreshToken;await clear();if(token)await api.logout({refreshToken:token});},
  async getAccessToken():Promise<string|null>{
   if(!session)return null;
   if(Date.parse(session.accessExpiresAt)>Date.now()+30_000)return session.accessToken;
   if(refreshing)return refreshing;
   const stamp=version,token=session.refreshToken;
   refreshing=(async()=>{
    try{const next=await api.refresh(token);return await save(next,stamp)?next.accessToken:null;}
    catch(error){if(error instanceof ApiError&&error.status===401&&version===stamp)await clear();throw error;}
   })();
   const pending=refreshing;
   try{return await pending;}finally{if(refreshing===pending)refreshing=null;}
  }
 };
}
