import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {createHash,randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {NodeStreamableHTTPServerTransport} from '@modelcontextprotocol/node';
import {CrmService,CrmError,type Data} from './service.ts';
import {openDatabase,initializeBoards,exclusiveDataLock} from './database.ts';
import {loadCompanyConfig,validateCompanyConfig,type CompanyConfig} from './config.ts';
import {dispatch,readOperations} from './dispatch.ts';
import {createMcpServer} from './mcp.ts';
const digest=(value:string)=>createHash('sha256').update(value).digest();
const equal=(left:Buffer,right:Buffer)=>left.length===right.length&&timingSafeEqual(left,right);
export type ServerOptions={root?:string;dataDir?:string;config?:CompanyConfig;env?:NodeJS.ProcessEnv};
export async function createCRMServer(options:ServerOptions={}){
 const root=resolve(options.root??process.cwd()),env=options.env??process.env,config=options.config?validateCompanyConfig(options.config):loadCompanyConfig(root);
 const password=env.CRM_ADMIN_PASSWORD??'',mcpToken=env.CRM_MCP_TOKEN??'';
 if(password.length<16||mcpToken.length<32||password===mcpToken)throw Error('Set distinct CRM_ADMIN_PASSWORD (16+ characters) and CRM_MCP_TOKEN (32+ characters). Run npm run setup.');
 let publicOrigin:string|undefined; if(env.CRM_PUBLIC_URL){const url=new URL(env.CRM_PUBLIC_URL);if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||!(url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))))throw Error('CRM_PUBLIC_URL must be a plain HTTPS origin (HTTP allowed only on loopback)');publicOrigin=url.origin;}
 const devOrigin=env.CRM_DEV_ORIGIN;if(devOrigin&&!['http://127.0.0.1:5173','http://localhost:5173'].includes(devOrigin))throw Error('CRM_DEV_ORIGIN must be the explicit local Vite origin');
 const salt=randomBytes(32),passwordHash=scryptSync(password,salt,64),tokenHash=digest(mcpToken);
 const dataDir=resolve(options.dataDir??env.CRM_DATA_DIR??resolve(root,'data')),releaseLock=exclusiveDataLock(dataDir);let database:ReturnType<typeof openDatabase>;
 try{database=openDatabase(dataDir);await initializeBoards(database.db,config)}catch(error){releaseLock();throw error}
 const sessions=new Map<string,number>(),attempts=new Map<string,{count:number;until:number}>();
 const sessionTTL=12*60*60*1000;
 function authenticated(req:IncomingMessage){const cookie=String(req.headers.cookie??'').split(';').map(s=>s.trim()).find(s=>s.startsWith('crm_session='))?.slice(12);if(!cookie||cookie.length!==64)return false;const key=digest(cookie).toString('hex'),expires=sessions.get(key);if(!expires||expires<Date.now()){sessions.delete(key);return false}return true;}
 function json(res:ServerResponse,body:unknown,status=200){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body))}
 async function body(req:IncomingMessage):Promise<Data>{if(!String(req.headers['content-type']).toLowerCase().startsWith('application/json'))throw new CrmError('JSON required',415);let size=0;const chunks:Buffer[]=[];for await(const chunk of req){const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=bytes.length;if(size>1_500_000)throw new CrmError('Request too large',413);chunks.push(bytes)}try{const parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error();return parsed}catch{throw new CrmError('Invalid JSON',400)}}
 const server=createServer(async(req,res)=>{
  res.setHeader('x-content-type-options','nosniff');res.setHeader('referrer-policy','no-referrer');res.setHeader('x-frame-options','DENY');res.setHeader('x-robots-tag','noindex, nofollow');res.setHeader('content-security-policy',`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:${config.loadCompanyIcons?' https:':''}; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'`);
  try{
   const addr=server.address(),port=typeof addr==='object'&&addr?addr.port:Number(env.CRM_PORT??3000);
   const localOrigins=[`http://127.0.0.1:${port}`,`http://localhost:${port}`,`http://[::1]:${port}`];
   const allowedOrigins=new Set(publicOrigin?[publicOrigin]:localOrigins);if(devOrigin)allowedOrigins.add(devOrigin);
   const allowedHosts=new Set([...allowedOrigins].map(origin=>new URL(origin).host));
   const host=String(req.headers.host??'');if(!allowedHosts.has(host))throw new CrmError('Untrusted request host',403,'forbidden');
   const origin=req.headers.origin;if(origin&&!allowedOrigins.has(origin))throw new CrmError('Untrusted request origin',403,'forbidden');
   const url=new URL(req.url??'/',publicOrigin??localOrigins[0]);
   if(url.pathname==='/api/config'&&req.method==='GET'){json(res,authenticated(req)?config:{name:config.name,timezone:config.timezone,loadCompanyIcons:config.loadCompanyIcons,boards:[]});return}
   if(url.pathname==='/api/session'&&req.method==='GET'){json(res,{authenticated:authenticated(req)});return}
   if(url.pathname==='/api/login'&&req.method==='POST'){
    if(!origin)throw new CrmError('Browser origin required',403,'forbidden');
    const now=Date.now(),ip=req.socket.remoteAddress??'unknown';for(const [key,item] of attempts)if(item.until<now)attempts.delete(key);if(attempts.size>1000&&!attempts.has(ip))throw new CrmError('Too many login attempts',429,'rate_limited');
    const attempt=attempts.get(ip)??{count:0,until:now+15*60*1000};attempts.set(ip,attempt);if(++attempt.count>10)throw new CrmError('Too many login attempts. Retry in 15 minutes.',429,'rate_limited');
    const input=await body(req);if(typeof input.password!=='string'||input.password.length>1024||!equal(scryptSync(input.password,salt,64),passwordHash))throw new CrmError('Incorrect password',401,'unauthenticated');
    for(const [key,expires] of sessions)if(expires<now)sessions.delete(key);if(sessions.size>=256)sessions.delete(sessions.keys().next().value!);
    const token=randomBytes(32).toString('hex');sessions.set(digest(token).toString('hex'),now+sessionTTL);attempts.delete(ip);
    res.setHeader('set-cookie',`crm_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sessionTTL/1000}${publicOrigin?.startsWith('https:')?'; Secure':''}`);json(res,{authenticated:true});return;
   }
   if(url.pathname==='/api/logout'&&req.method==='POST'){
    if(!origin)throw new CrmError('Browser origin required',403,'forbidden');
    const cookie=String(req.headers.cookie??'').split(';').map(s=>s.trim()).find(s=>s.startsWith('crm_session='))?.slice(12);if(cookie)sessions.delete(digest(cookie).toString('hex'));res.setHeader('set-cookie',`crm_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${publicOrigin?.startsWith('https:')?'; Secure':''}`);json(res,{authenticated:false});return;
   }
   if(url.pathname==='/mcp'){
    const auth=req.headers.authorization??'';if(!auth.startsWith('Bearer ')||!equal(digest(auth.slice(7)),tokenHash)){res.setHeader('www-authenticate','Bearer realm="company-crm"');throw new CrmError('MCP bearer token required',401,'unauthenticated')}
    if(req.method!=='POST')throw new CrmError('Use POST for stateless MCP',405);
    const parsed=await body(req),mcp=createMcpServer(new CrmService(database.db,'mcp',config.timezone)),transport=new NodeStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
    res.on('close',()=>{void transport.close();void mcp.close()});await mcp.connect(transport);await transport.handleRequest(req,res,parsed);return;
   }
   if(url.pathname==='/api/crm'){
    if(!authenticated(req))throw new CrmError('Sign in to your company CRM.',401,'unauthenticated');const service=new CrmService(database.db,'browser',config.timezone);
    if(req.method==='GET'){const args=Object.fromEntries(url.searchParams);if(!readOperations.has(args.op??''))throw new CrmError('Read operation required',405);json(res,await dispatch(service,args.op!,args));return}
    if(req.method!=='POST')throw new CrmError('Method not allowed',405);if(!origin)throw new CrmError('Browser origin required',403,'forbidden');const args=await body(req);json(res,await dispatch(service,args.op,args));return;
   }
   if(url.pathname.startsWith('/api/'))throw new CrmError('Not found',404,'not_found');
   if(req.method!=='GET'&&req.method!=='HEAD')throw new CrmError('Method not allowed',405);
   const base=resolve(root,'dist');let path=resolve(base,'.'+decodeURIComponent(url.pathname));if(path!==base&&!path.startsWith(base+sep))throw new CrmError('Not found',404,'not_found');
   try{if(!(await stat(path)).isFile())throw Error()}catch{if(extname(url.pathname))throw new CrmError('Not found',404,'not_found');path=resolve(base,'index.html')}
   let bytes:Buffer;try{bytes=await readFile(path)}catch{throw new CrmError('Frontend not built. Run npm run build.',503,'frontend_unavailable')}
   const types:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2'};
   res.writeHead(200,{'content-type':types[extname(path)]??'application/octet-stream','cache-control':extname(path)==='.html'?'no-cache':'public,max-age=3600'});res.end(req.method==='HEAD'?undefined:bytes);
  }catch(error){if(!res.headersSent)json(res,{error:error instanceof CrmError?error.message:'Request could not be completed',code:error instanceof CrmError?error.code:'internal_error'},error instanceof CrmError?error.status:500);else res.end()}
 });
 let closed=false;const close=async()=>{if(closed)return;closed=true;try{if(server.listening)await new Promise<void>((done,reject)=>server.close(err=>err?reject(err):done()))}finally{database.close();releaseLock()}};
 return {server,config,database,dataDir,close};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const host=process.env.CRM_HOST??'127.0.0.1',port=Number(process.env.CRM_PORT??3000);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid CRM_PORT');const app=await createCRMServer();
 app.server.once('error',()=>{console.error('CRM could not bind its configured address. Check host/port and whether another process is listening.');void app.close().then(()=>process.exit(1))});
 app.server.listen(port,host,()=>console.log(`Company CRM listening on ${host}:${port}`));
 for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void app.close().then(()=>process.exit(0))});
}
