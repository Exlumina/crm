import {McpServer} from '@modelcontextprotocol/server';
import {z} from 'zod';
import {CrmService,CrmError} from './service.ts';
import {dispatch} from './dispatch.ts';
const str=z.string().min(1).max(200), opId=str.describe('Unique operation identifier. Reuse only to retry the same intent.');
const target={id:str.describe('Exact record ID returned by search'),expectedRevision:str.describe('Current revision from get; stale edits fail'),operationId:opId};
const object=z.record(z.string(),z.unknown());
export function createMcpServer(service:CrmService){const server=new McpServer({name:'company-crm',version:'0.1.0'});
const definitions=[
 ['search_records','Search a bounded page of company/person records.',z.object({query:z.string().max(200).optional(),kind:z.enum(['company','person']).optional(),boardId:str.optional(),limit:z.number().int().min(1).max(200).optional(),cursor:z.string().max(30).optional()}).strict(),'search',true],
 ['get_record','Read the exact record and current revision.',z.object({id:str}).strict(),'get',true],
 ['create_record','Create one person or company. Does not send messages or merge existing identities.',z.object({record:object,operationId:opId}).strict(),'create',false],
 ['update_record','Update permitted fields with current revision and retry protection.',z.object({...target,changes:object}).strict(),'update',false],
 ['move_record','Set one board stage/order while preserving other memberships.',z.object({...target,boardId:str,stage:str,order:z.number().finite().min(0).max(1e12)}).strict(),'move',false],
 ['append_note','Append an explicit note without replacing earlier notes.',z.object({...target,text:z.string().min(1).max(10000)}).strict(),'append_note',false],
 ['set_follow_up','Set reply obligation, explicit due date and next action independently of stage.',z.object({...target,replyStatus:z.enum(['needs_reply','waiting_on_them','done']).nullable(),replyDueAt:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().describe('Date in the configured company timezone'),nextAction:z.string().max(4000)}).strict(),'follow_up',false],
 ['list_boards','Read all configured pipelines, stages and board revision.',z.object({}).strict(),'boards',true],
 ['configure_board','Create or update a board; existing stage names cannot be removed.',z.object({board:object,expectedRevision:str,operationId:opId}).strict(),'configure_board',false],
 ['get_history','Read up to 50 audited mutations for one record.',z.object({id:str}).strict(),'history',true],
 ['list_views','Read saved CRM views.',z.object({}).strict(),'views',true],
 ['save_view','Save query, board, kind and display preferences.',z.object({view:object,id:str.optional(),expectedRevision:str.optional(),operationId:opId}).strict(),'save_view',false],
 ['export','Export a bounded lossless page. Returned records may contain company-sensitive data.',z.object({cursor:z.string().max(30).optional()}).strict(),'export',true],
 ['status','Read this installation storage, counts and configured timezone. No external CRM connection exists.',z.object({}).strict(),'status',true]
] as const;
for(const [name,description,inputSchema,operation,readOnly] of definitions)server.registerTool('crm_'+name,{description,inputSchema,annotations:{readOnlyHint:readOnly,destructiveHint:false,idempotentHint:true,openWorldHint:false}},async(args:any)=>{try{const output=await dispatch(service,operation,args);return {content:[{type:'text' as const,text:JSON.stringify(output)}],structuredContent:output}}catch(error){return {content:[{type:'text' as const,text:JSON.stringify({error:error instanceof CrmError?error.message:'CRM operation failed',code:error instanceof CrmError?error.code:'internal_error'})}],isError:true}}});return server;}
