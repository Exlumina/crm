import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,copyFileSync,readFileSync,writeFileSync,statSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('setup makes private fresh credentials and never replaces existing company settings',()=>{
 const root=mkdtempSync(join(tmpdir(),'crm-setup-'));
 try{
  mkdirSync(join(root,'scripts'));mkdirSync(join(root,'config'));
  copyFileSync(new URL('../scripts/setup.mjs',import.meta.url),join(root,'scripts/setup.mjs'));
  copyFileSync(new URL('../config/company.example.json',import.meta.url),join(root,'config/company.example.json'));
  const run=()=>spawnSync(process.execPath,[join(root,'scripts/setup.mjs')],{cwd:root,encoding:'utf8'});
  const first=run();assert.equal(first.status,0,first.stderr);
  const env=readFileSync(join(root,'.env'),'utf8');const password=env.match(/^CRM_ADMIN_PASSWORD=(.+)$/m)[1];const token=env.match(/^CRM_MCP_TOKEN=(.+)$/m)[1];
  assert.ok(password.length>=32);assert.ok(token.length>=32);assert.notEqual(password,token);assert.ok(!first.stdout.includes(password)&&!first.stdout.includes(token));
  if(process.platform!=='win32')assert.equal(statSync(join(root,'.env')).mode&0o777,0o600);
  writeFileSync(join(root,'config/company.json'),'{"name":"Keep me"}');
  assert.equal(run().status,0);assert.equal(readFileSync(join(root,'.env'),'utf8'),env);assert.equal(readFileSync(join(root,'config/company.json'),'utf8'),'{"name":"Keep me"}');
 }finally{rmSync(root,{recursive:true,force:true})}
});
