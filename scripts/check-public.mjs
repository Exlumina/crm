import {spawnSync} from 'node:child_process';
import {readdirSync,readFileSync,lstatSync} from 'node:fs';
import {resolve,relative} from 'node:path';
const root=resolve(new URL('../',import.meta.url).pathname);
const ignored=new Set(['.git','node_modules','dist','data','backups','.env','company.json']);
const problems=[];let count=0;
const patterns=[/appg(?:prj|dep|ver)_[a-z\d]+/i,/page_[a-f\d]{20,}/i,/https?:\/\/[^\s"']+\.chatgpt\.site/i,/\/Users\//,/GoogleDrive-/,/OneDrive-Personal/,/oai-authenticated-user/i,/BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/,/\b(?:ghp|gho|github_pat)_[a-zA-Z0-9_]{20,}/];
function visit(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){
 if(ignored.has(entry.name)||entry.name.startsWith('.env.')&&entry.name!=='.env.example')continue;
 const path=resolve(dir,entry.name),name=relative(root,path);
 if(entry.isSymbolicLink()){problems.push(name+': symlink');continue;}
 if(entry.isDirectory()){visit(path);continue;}
 if(/\.(?:sqlite|db|tar|gz|zip|pem|p12|key|log|png|jpe?g|pdf)$/i.test(name)){problems.push(name+': unexpected binary or runtime artifact');continue;}
 if(lstatSync(path).size>2_000_000){problems.push(name+': unexpected large file');continue;}
 const text=readFileSync(path,'utf8');count++;
 if(name!== 'scripts/check-public.mjs')for(const pattern of patterns)if(pattern.test(text))problems.push(name+': forbidden deployment/secret marker');
 }}
const tracked=spawnSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'});
if(tracked.status===0) for(const file of tracked.stdout.split('\0').filter(Boolean)) {
 if(/(^|\/)(?:data|backups|node_modules|dist)\//.test(file)||/(^|\/)\.env(?:$|\.)/.test(file)&&file!=='.env.example'||file==='config/company.json')problems.push(file+': private/runtime file is tracked');
}
visit(root);
if(problems.length){console.error(problems.join('\n'));process.exitCode=1}else console.log(`Public-source guard passed: ${count} text files; no private deployment markers or runtime artifacts.`);
