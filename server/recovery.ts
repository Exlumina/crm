import {DatabaseSync} from 'node:sqlite';
import {existsSync,chmodSync,readFileSync,statSync,unlinkSync,openSync,readSync,closeSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {exclusiveDataLock} from './database.ts';

const text=z.string(),integer=z.number().int();
const jsonText=text.refine(value=>{try{JSON.parse(value);return true}catch{return false}},'Invalid stored JSON');
const snapshot=z.object({schemaVersion:z.literal(1),capturedAt:text.optional(),tables:z.object({
 documents:z.array(z.object({id:text,type:z.enum(['record','boards','view']),name:text,data:jsonText,revision:integer.positive(),original:text,filename:text,source_hash:text,operation_id:text,operation_digest:text,actor:text,updated_at:text}).strict()),
 operations:z.array(z.object({id:text,digest:text,document_id:text,revision:integer.positive(),data:jsonText,applied_at:text}).strict()),
 audit:z.array(z.object({id:integer.positive(),document_id:text,operation_id:text,actor:text,before:jsonText.nullable(),after:jsonText,occurred_at:text}).strict()),
 settings:z.array(z.object({key:text,value:text}).strict())
}).strict()}).strict();
const columns={documents:['id','type','name','data','revision','original','filename','source_hash','operation_id','operation_digest','actor','updated_at'],operations:['id','digest','document_id','revision','data','applied_at'],audit:['id','document_id','operation_id','actor','before','after','occurred_at'],settings:['key','value']} as const;

function readSnapshot(source:string){
 const fd=openSync(source,'r'),header=Buffer.alloc(16);try{readSync(fd,header,0,16,0)}finally{closeSync(fd)}
 if(!header.toString().startsWith('SQLite format 3'))return snapshot.parse(JSON.parse(readFileSync(source,'utf8')));
 const db=new DatabaseSync(source,{readOnly:true});
 try{
  db.exec('PRAGMA trusted_schema=OFF; PRAGMA query_only=ON');
  const result=db.prepare('PRAGMA integrity_check').get();
  if(!result||Object.values(result)[0]!=='ok')throw Error('Backup integrity check failed');
  const tables:Record<string,unknown[]>={};
  for(const table of Object.keys(columns) as (keyof typeof columns)[]){
   const entry=db.prepare("SELECT type,sql FROM sqlite_master WHERE name=?").get(table);
   if(entry?.type!=='table'||typeof entry.sql!=='string'||/^CREATE\s+VIRTUAL\s+TABLE/i.test(entry.sql))throw Error('Backup schema is not an ordinary CRM table');
   // These names are fixed application constants. Source schema and triggers are never restored.
   tables[table]=db.prepare(`SELECT ${columns[table].join(',')} FROM ${table}`).all();
  }
  return snapshot.parse({schemaVersion:1,tables});
 }finally{db.close()}
}

export async function restoreBackup(source:string,directory:string){
 source=resolve(source);directory=resolve(directory);
 if(!existsSync(source))throw Error('Backup file not found');
 if(statSync(source).size>100_000_000)throw Error('Backup is larger than the supported 100 MB restore limit');
 const release=exclusiveDataLock(directory),destination=resolve(directory,'crm.sqlite');let created=false;
 try{
  if(existsSync(destination))throw Error('Restore requires a fresh CRM_DATA_DIR. Preserve the current database and choose a new directory.');
  const parsed=readSnapshot(source),db=new DatabaseSync(destination);created=true;
  try{
   const schema=readFileSync(resolve(dirname(fileURLToPath(import.meta.url)),'schema.sql'),'utf8');
   db.exec(schema);db.exec('DROP TRIGGER document_insert; DROP TRIGGER document_update; BEGIN IMMEDIATE');
   for(const table of Object.keys(columns) as (keyof typeof columns)[]){
    const names=columns[table],statement=db.prepare(`INSERT INTO ${table}(${names.join(',')}) VALUES(${names.map(()=>'?').join(',')})`);
    for(const row of parsed.tables[table])statement.run(...names.map(name=>(row as Record<string,any>)[name]));
   }
   db.exec('COMMIT');db.exec(schema.slice(schema.indexOf('CREATE TRIGGER')));
   db.prepare("UPDATE settings SET value='false' WHERE key='maintenance'").run();
   if(Object.values(db.prepare('PRAGMA integrity_check').get()??{})[0]!=='ok')throw Error('Restored database integrity check failed');
  }catch(error){try{db.exec('ROLLBACK')}catch{}throw error}finally{db.close()}
  chmodSync(destination,0o600);return {directory,destination};
 }catch(error){
  if(created)for(const suffix of ['','-wal','-shm']){const path=destination+suffix;if(existsSync(path))unlinkSync(path)}
  throw error;
 }finally{release()}
}
