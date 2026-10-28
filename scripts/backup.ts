import {DatabaseSync,backup} from 'node:sqlite';
import {mkdirSync,existsSync,chmodSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {exclusiveDataLock} from '../server/database.ts';
const directory=resolve(process.env.CRM_DATA_DIR??'data'),release=exclusiveDataLock(directory);
try{const source=resolve(directory,'crm.sqlite');if(!existsSync(source))throw Error('No CRM database found in CRM_DATA_DIR');const destination=resolve(process.argv[2]??`backups/CRM_Backup_${new Date().toISOString().replace(/[:.]/g,'_')}.sqlite`);if(existsSync(destination))throw Error('Backup destination already exists; choose a new file.');mkdirSync(dirname(destination),{recursive:true,mode:0o700});const db=new DatabaseSync(source,{readOnly:true});try{await backup(db,destination);chmodSync(destination,0o600)}finally{db.close()}console.log(`Backup saved to ${destination}. Keep company backups private.`)}finally{release()}
