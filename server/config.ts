import {readFileSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {z} from 'zod';
const BoardSchema=z.object({id:z.string().regex(/^[A-Za-z0-9_.:-]{1,100}$/),name:z.string().trim().min(1).max(100),stages:z.array(z.string().trim().min(1).max(100)).min(1).max(40),stageDescriptions:z.record(z.string(),z.string().max(2000)).optional()}).strict();
const ConfigSchema=z.object({name:z.string().trim().min(1).max(100),timezone:z.string().refine(value=>{try{new Intl.DateTimeFormat('en',{timeZone:value});return true}catch{return false}},'Use an IANA timezone'),loadCompanyIcons:z.boolean().default(false),boards:z.array(BoardSchema).max(30)}).strict().superRefine((value,ctx)=>{if(new Set(value.boards.map(b=>b.id)).size!==value.boards.length)ctx.addIssue({code:'custom',message:'Board identifiers must be unique'});for(const b of value.boards)if(new Set(b.stages).size!==b.stages.length)ctx.addIssue({code:'custom',message:'Stage names must be unique'})});
export type CompanyConfig=z.infer<typeof ConfigSchema>;
export function loadCompanyConfig(root:string):CompanyConfig{const local=resolve(root,'config/company.json');return ConfigSchema.parse(JSON.parse(readFileSync(existsSync(local)?local:resolve(root,'config/company.example.json'),'utf8')))}
export function validateCompanyConfig(value:unknown):CompanyConfig{return ConfigSchema.parse(value)}
