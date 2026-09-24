/** Keep the exact command when the server may have committed before a connection failed. */
export function createCourierMutation<T>(send:(command:Record<string,unknown>)=>Promise<T>){
  let pending:Record<string,unknown>|null=null;
  let busy=false;
  async function retry(){
    if(busy)throw new Error('A request is in progress.');
    if(!pending)throw new Error('No pending request.');
    busy=true;
    try{const result=await send(pending);pending=null;return result;}
    catch(error){const status=(error as {status?:number}).status;if(status&&status>=400&&status<500&&status!==408&&status!==429)pending=null;throw error;}
    finally{busy=false;}
  }
  return {get pending(){return pending!==null;},retry,async run(command:Record<string,unknown>){
    if(pending)throw new Error('Resolve the pending request before changing details.');
    pending={...structuredClone(command),idempotencyKey:crypto.randomUUID()};return retry();
  }};
}
