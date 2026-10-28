import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdirSync,openSync,closeSync,unlinkSync,chmodSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CrmService,type Database,type Data} from './service.ts';
import type {CompanyConfig} from './config.ts';
export function exclusiveDataLock(directory:string){mkdirSync(directory,{recursive:true,mode:0o700});const path=resolve(directory,'process.lock');let fd:number;try{fd=openSync(path,'wx',0o600)}catch{throw new Error('CRM data is already locked. Stop the server or other data command first. If a prior process crashed, confirm it is stopped before removing data/process.lock.')}return ()=>{closeSync(fd);unlinkSync(path)}}
export function openDatabase(directory:string){mkdirSync(directory,{recursive:true,mode:0o700});const path=resolve(directory,'crm.sqlite');const sql=new DatabaseSync(path);chmodSync(path,0o600);sql.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON');if(!sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='documents'").get())sql.exec(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)),'schema.sql'),'utf8'));
const db:Database={prepare(query){let args:any[]=[];return {bind(...values:any[]){args=values;return this},async first<T=Data>(){return (sql.prepare(query).get(...args)??null) as T|null},async all<T=Data>(){return {results:sql.prepare(query).all(...args) as T[]}},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}}}}}};
return {sql,db,path,close:()=>sql.close()};}
export async function initializeBoards(db:Database,config:CompanyConfig){const service=new CrmService(db,'setup',config.timezone);if(await service.row('boards'))return;let rev='0';for(const board of config.boards){const result=await service.configureBoard(board,rev,'setup:board:'+board.id);rev=result.revision;}await service.lockMigration();}
