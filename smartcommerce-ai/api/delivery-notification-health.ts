import { parseCookie, readStaffSession, STAFF_COOKIE_NAME, canStaff } from "../src/server/staffSession.js";
import { enforceDurableRateLimit, requestIp } from "../src/server/securityInfrastructure.js";

function firstHeader(value:string|string[]|undefined){return Array.isArray(value)?value[0]:value;}
function send(response:any,status:number,payload:unknown){response.statusCode=status;response.setHeader("Content-Type","application/json");response.setHeader("Cache-Control","no-store");response.setHeader("X-Content-Type-Options","nosniff");response.end(JSON.stringify(payload));}
function present(name:string){return Boolean(String(process.env[name]||"").trim());}

export default async function handler(request:any,response:any){
  if(String(request.method||"GET").toUpperCase()!=="GET"){response.setHeader("Allow","GET");return send(response,405,{error:{code:"METHOD_NOT_ALLOWED",message:"GET is required."}});}
  try{
    const token=parseCookie(firstHeader(request.headers?.cookie))[STAFF_COOKIE_NAME];const staff=readStaffSession(token);if(!staff)return send(response,401,{error:{code:"STAFF_AUTH_REQUIRED",message:"Staff sign-in is required."}});
    if(!canStaff(staff,"delivery_review"))return send(response,403,{error:{code:"DELIVERY_ACCESS_DENIED",message:"Your staff role cannot view notification readiness."}});
    await enforceDurableRateLimit({request,action:"delivery_notification_health",subject:staff.employeeId||requestIp(request),limit:120,windowSeconds:600});
    const email={enabled:String(process.env.SMARTCOMMERCE_EMAIL_NOTIFICATIONS_ENABLED||"").toLowerCase()==="true",apiKey:present("RESEND_API_KEY"),sender:present("SMARTCOMMERCE_NOTIFICATION_EMAIL_FROM"),webhookSecret:present("RESEND_WEBHOOK_SECRET")};
    const twilioCore=present("TWILIO_ACCOUNT_SID")&&present("TWILIO_AUTH_TOKEN");
    const sms={enabled:String(process.env.SMARTCOMMERCE_SMS_NOTIFICATIONS_ENABLED||"").toLowerCase()==="true",credentials:twilioCore,sender:present("SMARTCOMMERCE_TWILIO_MESSAGING_SERVICE_SID")||present("SMARTCOMMERCE_TWILIO_SMS_FROM"),statusCallback:present("SMARTCOMMERCE_TWILIO_STATUS_CALLBACK_URL")};
    const whatsapp={enabled:String(process.env.SMARTCOMMERCE_WHATSAPP_NOTIFICATIONS_ENABLED||"").toLowerCase()==="true",credentials:twilioCore,sender:present("SMARTCOMMERCE_TWILIO_WHATSAPP_FROM"),template:present("SMARTCOMMERCE_TWILIO_WHATSAPP_CONTENT_SID"),statusCallback:present("SMARTCOMMERCE_TWILIO_STATUS_CALLBACK_URL")};
    return send(response,200,{providers:{email:{...email,ready:Object.values(email).every(Boolean)},sms:{...sms,ready:Object.values(sms).every(Boolean)},whatsapp:{...whatsapp,ready:Object.values(whatsapp).every(Boolean)}},phoneVerificationAvailable:false,checkedAt:new Date().toISOString()});
  }catch(error:any){if(error?.message==="RATE_LIMITED")return send(response,429,{error:{code:"RATE_LIMITED",message:"Too many readiness checks. Please wait and try again."}});console.error("delivery_notification_health_error",{code:error instanceof Error?error.message:"unknown"});return send(response,503,{error:{code:"DELIVERY_NOTIFICATION_HEALTH_UNAVAILABLE",message:"Notification readiness is temporarily unavailable."}});}
}
