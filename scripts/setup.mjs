import {existsSync,writeFileSync,copyFileSync,mkdirSync,constants} from 'node:fs';
import {randomBytes} from 'node:crypto';
const root=new URL('../',import.meta.url);
const env=new URL('.env',root);
if(!existsSync(env)) {
  writeFileSync(env, `CRM_ADMIN_PASSWORD=${randomBytes(24).toString('hex')}\nCRM_MCP_TOKEN=${randomBytes(32).toString('hex')}\nCRM_HOST=127.0.0.1\nCRM_PORT=3000\nCRM_DATA_DIR=./data\n# For two-terminal local development only. Remove for hosted deployments.\nCRM_DEV_ORIGIN=http://127.0.0.1:5173\n`, {flag:'wx',mode:0o600});
  console.log('Created .env with independent random credentials. Open it locally to retrieve your password; never commit or share it.');
} else console.log('Kept existing .env.');
mkdirSync(new URL('config/',root),{recursive:true});
if(!existsSync(new URL('config/company.json',root))) {
  copyFileSync(new URL('config/company.example.json',root),new URL('config/company.json',root),constants.COPYFILE_EXCL);
  console.log('Created config/company.json. Customize it before your first start.');
} else console.log('Kept existing company configuration.');
