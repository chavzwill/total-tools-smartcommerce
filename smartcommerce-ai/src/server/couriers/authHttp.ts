type Account={id:string;[key:string]:unknown};
type Deps={enabled:()=>boolean;read:(token:string)=>Promise<Account|null>;limit:(request:any,email:string)=>Promise<void>;signup:(input:{email:string;password:string;fullName:string;phone?:string})=>Promise<Account|undefined>;login:(email:string,password:string)=>Promise<Account|undefined>;session:(id:string,oldToken:string)=>Promise<string>;logout:(token:string)=>Promise<void>};
export function createCourierAuthHandler(deps:Deps){return async(req:any,res:any)=>{
  const send=(status:number,data:unknown)=>{res.statusCode=status;res.end(JSON.stringify(data));};
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const raw=String(req.headers?.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('sc_courier_session='));const token=raw?.slice('sc_courier_session='.length)||'';
  const cookie=(value:string)=>`sc_courier_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${value?28800:0}${process.env.NODE_ENV==='production'?'; Secure':''}`;
  try{
    if(!deps.enabled())return send(503,{error:true});
    if(req.method==='GET'){const account=await deps.read(token);return send(200,{authenticated:!!account,account});}
    if(req.method!=='POST')return send(405,{error:true});
    let origin=false;try{const u=new URL(req.headers.origin),expected=process.env.SMARTCOMMERCE_PUBLIC_ORIGIN;origin=expected?u.origin===new URL(expected).origin:u.protocol==='http:'&&u.host===req.headers.host&&/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(u.host)&&process.env.NODE_ENV!=='production';}catch{/* deny */}
    if(!origin)return send(403,{error:true});
    if(!String(req.headers['content-type']||'').startsWith('application/json'))return send(400,{error:true});
    const chunks:Buffer[]=[];let size=0;for await(const chunk of req){const bytes=Buffer.from(chunk);size+=bytes.length;if(size>16000)return send(413,{error:true});chunks.push(bytes);}
    let body:any;try{body=JSON.parse(Buffer.concat(chunks).toString());}catch{return send(400,{error:true});}
    if(!body||typeof body!=='object'||Array.isArray(body))return send(400,{error:true});
    const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
    await deps.limit(req,email);
    if(body.action==='logout'){await deps.logout(token);res.setHeader('Set-Cookie',cookie(''));return send(200,{authenticated:false,account:null});}
    const password=typeof body.password==='string'?body.password:'';
    if(!['signup','login'].includes(body.action)||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||!password||password.length>128)return send(400,{error:true});
    const fullName=typeof body.fullName==='string'?body.fullName.trim():'';
    if(body.action==='signup'&&(password.length<10||fullName.length<2||fullName.length>120))return send(400,{error:true});
    const account=body.action==='signup'?await deps.signup({email,password,fullName}):await deps.login(email,password);
    if(!account)return send(body.action==='signup'?409:401,{error:true});
    const fresh=await deps.session(account.id,token);res.setHeader('Set-Cookie',cookie(fresh));return send(200,{authenticated:true,account});
  }catch(e){return send((e as {status?:number})?.status===429?429:503,{error:true});}
};}
