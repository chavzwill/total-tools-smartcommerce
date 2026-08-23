import { processPendingDeliveryNotifications } from "../src/server/deliveryNotificationSender.js";

function firstHeader(value:string|string[]|undefined){return Array.isArray(value)?value[0]:value;}
function send(response:any,status:number,payload:unknown){response.statusCode=status;response.setHeader("Content-Type","application/json");response.setHeader("Cache-Control","no-store");response.setHeader("X-Content-Type-Options","nosniff");response.end(JSON.stringify(payload));}

export default async function handler(request:any,response:any){
  const method=String(request.method||"GET").toUpperCase();
  if(!["GET","POST"].includes(method)){response.setHeader("Allow","GET, POST");return send(response,405,{error:{code:"METHOD_NOT_ALLOWED",message:"GET or POST is required."}});}
  const secret=String(process.env.CRON_SECRET||"").trim();
  if(!secret)return send(response,503,{error:{code:"NOTIFICATION_WORKER_NOT_CONFIGURED",message:"The notification retry worker is not configured."}});
  const authorization=firstHeader(request.headers?.authorization)||"";
  if(authorization!==`Bearer ${secret}`)return send(response,401,{error:{code:"WORKER_AUTH_REQUIRED",message:"This worker request is not authorized."}});
  try{
    const result=await processPendingDeliveryNotifications(30);
    return send(response,200,{ok:true,...result});
  }catch(error){
    console.error("delivery_notification_worker_error",{code:error instanceof Error?error.message:"unknown"});
    return send(response,503,{error:{code:"DELIVERY_NOTIFICATION_WORKER_UNAVAILABLE",message:"The notification worker could not process its queue."}});
  }
}
