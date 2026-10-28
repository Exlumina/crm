import {api} from './crm-api.ts';
type Page={documents?:unknown[];tables?:Record<string,unknown[]>;nextCursor:string|null};
type Caller=typeof api;
async function pages(op:string,extra:Record<string,unknown>,request:Caller){
 const documents:unknown[]=[];const tables:Record<string,unknown[]>={documents:[],operations:[],audit:[],settings:[]};const seen=new Set<string>();let cursor:string|null='0';
 while(cursor!==null){if(seen.has(cursor))throw Error('The export cursor repeated. Retry the export.');seen.add(cursor);const page:Page=await request<Page>({op,cursor,...extra});
  if(op==='snapshot'){for(const key of Object.keys(tables)){if(!Array.isArray(page.tables?.[key]))throw Error('Incomplete recovery export');tables[key].push(...page.tables[key])}}
  else{if(!Array.isArray(page.documents))throw Error('Incomplete record export');documents.push(...page.documents)}
  cursor=page.nextCursor;
 }
 return op==='snapshot'?{schemaVersion:1,capturedAt:new Date().toISOString(),tables}:{schemaVersion:1,documents};
}
export const exportRecords=(request:Caller=api)=>pages('export',{},request);
export async function recoveryBackup(request:Caller=api){
 const lock=await request<{backupToken:string}>({op:'maintenance',enabled:true},true);if(!lock.backupToken)throw Error('The backup could not acquire its write pause.');
 let result:Awaited<ReturnType<typeof pages>>|undefined;let failed:unknown;
 try{result=await pages('snapshot',{backupToken:lock.backupToken},request)}catch(e){failed=e}
 try{await request({op:'maintenance',enabled:false,backupToken:lock.backupToken},true)}catch{throw Error('The backup ended, but its write pause could not be released. Check the recovery controls before retrying.')}
 if(failed)throw failed;return result!;
}
export function saveFile(body:unknown,name:string){const blob=new Blob([JSON.stringify(body,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href);}
