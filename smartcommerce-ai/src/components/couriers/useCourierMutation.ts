import {useRef,useState} from 'react';
import {createCourierMutation} from '../../lib/courierRetry';
import {CourierClientError} from '../../lib/couriers';
export function useCourierMutation<T>(send:(command:Record<string,unknown>)=>Promise<T>,onSuccess:(result:T)=>void){
  const mutation=useRef(createCourierMutation(send));
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function execute(command?:Record<string,unknown>){
    setBusy(true);setError('');
    try{const result=await(command?mutation.current.run(command):mutation.current.retry());onSuccess(result);}
    catch(e){setError(e instanceof CourierClientError?e.message:'The result could not be confirmed. Retry the same request to check safely.');}
    finally{setBusy(false);}
  }
  return {busy,error,pending:mutation.current.pending,execute};
}
