export type AppAudience = 'customer' | 'courier';
export class ApiError extends Error {
  readonly code:string;
  readonly status:number;
  readonly retryable:boolean;
  readonly requestId?:string;
  constructor(code:string,status:number,message:string,retryable=false,requestId?:string){
    super(message);this.name='ApiError';this.code=code;this.status=status;this.retryable=retryable;this.requestId=requestId;
  }
}
export type Decoder<T> = (value:unknown)=>T;
