export class APIError extends Error {
 status:number;code?:string;
 constructor(message:string,status:number,code?:string){super(message);this.status=status;this.code=code;}
}
export async function api<T>(params:Record<string,unknown>,write=false):Promise<T>{
 const query=new URLSearchParams(Object.entries(params).filter(([,v])=>v!==undefined).map(([k,v])=>[k,String(v)]));
 const response=await fetch(write?'/api/crm':`/api/crm?${query}`,write?{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(params)}:{credentials:'same-origin',cache:'no-store'});
 let body:Record<string,unknown>;
 try{body=await response.json() as Record<string,unknown>}catch{throw new APIError('The CRM returned an unexpected response. Sign in or refresh and try again.',response.status,'invalid_response')}
 if(!response.ok){const code=String(body.code??'request_failed');const message=code==='revision_conflict'?'This record changed in another session. Your input is preserved. Close editing and refresh the record before trying again.':String(body.error??'The request could not be completed.');throw new APIError(message,response.status,code)}
 return body as T;
}
