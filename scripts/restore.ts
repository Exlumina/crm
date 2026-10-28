import {resolve} from 'node:path';
import {restoreBackup} from '../server/recovery.ts';
if(!process.argv[2])throw Error('Usage: npm run restore -- /absolute/path/to/backup.sqlite-or-json (CRM_DATA_DIR must be a new directory)');
const result=await restoreBackup(process.argv[2],resolve(process.env.CRM_DATA_DIR??'data'));
console.log(`Restored into ${result.directory}. Point CRM_DATA_DIR there and start the server with your separate credentials.`);
