import {test} from 'node:test';
import assert from 'node:assert/strict';
import {companyIconSources,recordInitials} from '../web/company-icon.ts';
import {readViewModes,viewMode,withViewMode} from '../web/view-preferences.ts';
import {readCompanyConfig} from '../web/config.ts';
import {recoveryBackup,exportRecords} from '../web/crm-data.ts';

test('company configuration enables remote icons only by explicit boolean and validates timezone',()=>{
 const config=readCompanyConfig({name:'Example CRM',timezone:'UTC',boards:[],loadCompanyIcons:'true'});
 assert.equal(config.loadCompanyIcons,false);
 assert.throws(()=>readCompanyConfig({name:'Example CRM',timezone:'not-a-timezone',boards:[]}));
 assert.throws(()=>readCompanyConfig({name:'Example CRM',timezone:'UTC',boards:[{id:'sales',name:'Sales',stages:[null]}]}));
});
test('icons use only credential-free public website origins',()=>{
 assert.deepEqual(companyIconSources('company','http://company.example/private?q=secret'),['https://company.example/favicon.ico','https://company.example/apple-touch-icon.png']);
 for(const website of ['https://username:password@company.example','http://127.0.0.1','http://localhost','https://[::1]','https://private.local','javascript:alert(1)','https://company.example:8443'])assert.deepEqual(companyIconSources('company',website),[]);
 assert.deepEqual(companyIconSources('person','https://company.example'),[]);
 assert.equal(recordInitials(' Example Company '),'EC');
});
test('board preferences stay separate from Directory and survive storage roundtrip',()=>{
 let prefs=withViewMode({},'sales','table');prefs=withViewMode(prefs,'partners','board');
 assert.equal(viewMode(prefs,''),'table');assert.equal(viewMode(prefs,'sales'),'table');assert.equal(viewMode(prefs,'partners'),'board');
 assert.equal(viewMode(readViewModes(JSON.stringify(prefs)),'sales'),'table');
 assert.deepEqual(readViewModes('{broken'),{});assert.deepEqual(readViewModes('["table"]'),{});
});
test('full recovery capture releases only its owned write pause after read failure',async()=>{
 const calls=[];const call=async p=>{calls.push(p);if(p.op==='maintenance')return p.enabled?{backupToken:'test-token'}:{};throw Error('read failure');};
 await assert.rejects(recoveryBackup(call),/read failure/);assert.deepEqual(calls.at(-1),{op:'maintenance',enabled:false,backupToken:'test-token'});
 assert.equal(calls.some(c=>c.force),false);
});
test('export traverses all pages and rejects a repeating cursor',async()=>{
 const exported=await exportRecords(async p=>({documents:[p.cursor],nextCursor:p.cursor==='0'?'100':null}));
 assert.deepEqual(exported.documents,['0','100']);await assert.rejects(exportRecords(async()=>({documents:[],nextCursor:'0'})),/cursor repeated/);
});

test('login fetches authenticated company configuration before opening the workspace',async()=>{
 const {signInWithPassword}=await import('../web/auth.ts');
 const calls=[];
 const request=async(url,options)=>{calls.push({url,options});if(url==='/api/login')return Response.json({ok:true});return Response.json({name:'Example CRM',timezone:'UTC',loadCompanyIcons:false,boards:[{id:'sales',name:'Sales',stages:['Review']}]});};
 const config=await signInWithPassword('synthetic-test-password',request);
 assert.deepEqual(calls.map(c=>c.url),['/api/login','/api/config']);
 assert.equal(calls[1].options.credentials,'same-origin');
 assert.equal(calls[1].options.cache,'no-store');
 assert.equal(config.boards[0].id,'sales');
 const rejected=[];
 await assert.rejects(signInWithPassword('not-a-valid-password',async(url)=>{rejected.push(url);return Response.json({error:'Sign-in failed'},{status:401});}),/Sign-in failed/);
 assert.deepEqual(rejected,['/api/login']);
 await assert.rejects(signInWithPassword('synthetic-test-password',async(url)=>url==='/api/login'?Response.json({ok:true}):Response.json({name:'Missing timezone',boards:[]})),/configuration is invalid/);
});
