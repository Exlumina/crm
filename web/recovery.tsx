import {useEffect,useState} from 'react';
import {api,APIError} from './crm-api';
import {exportRecords,recoveryBackup,saveFile} from './crm-data';
import type {CompanyConfig} from './config';

type Status={service:string;storage:string;counts:{type:string;count:number}[];writesPaused:boolean;timezone:string};
export function DataRecovery({config,onLogout,onExpired}:{config:CompanyConfig;onLogout:()=>void;onExpired:()=>void}){
  const [status,setStatus]=useState<Status|null>(null);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  useEffect(()=>{void api<Status>({op:'status'}).then(setStatus).catch(e=>{if(e instanceof APIError&&e.status===401)onExpired();else setError(e instanceof Error?e.message:'Could not load status.');});},[onExpired]);
  async function download(full:boolean){
    setBusy(true);setNotice('');setError('');
    try{
      const body=full?await recoveryBackup():await exportRecords();
      saveFile(body,`${full?'CRM_Recovery':'CRM_Records'}_${new Date().toISOString().slice(0,10)}.json`);
      setNotice(full?'Full recovery backup downloaded. Store it privately.':'Record export downloaded. Store it privately.');
      setStatus(await api<Status>({op:'status'}));
    }catch(e){if(e instanceof APIError&&e.status===401)onExpired();else setError(e instanceof Error?e.message:'Could not download the export.');}
    finally{setBusy(false);}
  }
  return <main className="data-shell"><header><a href="/">Back to CRM</a><button className="quiet-button" onClick={onLogout} disabled={busy}>Sign out</button></header><h1>Data &amp; recovery</h1><section className="data-section"><h2>Your workspace</h2><p>{config.name} keeps its records in this installation’s own database. Browser edits and authenticated MCP tools use the same records.</p>{status?<dl className="detail-facts"><div><dt>Storage</dt><dd>{status.storage}</dd></div><div><dt>Records</dt><dd>{status.counts.find(c=>c.type==='record')?.count||0}</dd></div><div><dt>Follow-up timezone</dt><dd>{config.timezone}</dd></div><div><dt>Writes</dt><dd>{status.writesPaused?'Paused for a backup':'Available'}</dd></div></dl>:<p role="status">Loading workspace status…</p>}</section><section className="data-section"><h2>Exports &amp; backups</h2><p>Download records for portability, or a full recovery backup with revisions, retry receipts and history. A full backup briefly pauses writes to keep the capture consistent.</p><div className="data-actions"><button className="quiet-button" disabled={busy||!status} onClick={()=>void download(false)}>Download records</button><button className="primary-button" disabled={busy||!status||status.writesPaused} onClick={()=>void download(true)}>{busy?'Preparing download…':'Download full backup'}</button></div>{notice&&<p role="status">{notice}</p>}{error&&<p className="inline-error" role="alert">{error}</p>}</section><section className="data-section"><h2>Restore &amp; customization</h2><p>Stop the server before restoring a backup. Follow the repository’s recovery guide, preserve a fresh backup of the current database, and verify the restored records before resuming edits.</p><p>Company branding, timezone and initial pipelines are configured by the installation owner. Existing pipelines can be adjusted in the CRM. Remote company icons are {config.loadCompanyIcons?'enabled':'disabled'} for this workspace.</p></section></main>;
}
