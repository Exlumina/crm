import {useCallback, useEffect, useState, type FormEvent} from 'react';
import {createRoot} from 'react-dom/client';
import CRMClient from './crm-client';
import {DataRecovery} from './recovery';
import {loadCompanyConfig, type CompanyConfig} from './config';
import {signInWithPassword} from './auth';
import './globals.css';

function App() {
  const [config,setConfig]=useState<CompanyConfig|null>(null);
  const [signedIn,setSignedIn]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const expired=useCallback(()=>setSignedIn(false),[]);
  useEffect(()=>{
    let active=true;
    void (async()=>{
      try {
        const parsed=await loadCompanyConfig();
        const session=await fetch('/api/session',{credentials:'same-origin',cache:'no-store'});
        if(!session.ok) throw Error('Could not check your session.');
        const status:unknown=await session.json();
        if(active){setConfig(parsed);setSignedIn(!!status && typeof status==='object' && 'authenticated' in status && status.authenticated===true);document.title=parsed.name;}
      }catch(e){if(active)setError(e instanceof Error?e.message:'Could not open your CRM.');}
      finally{if(active)setLoading(false);}
    })();
    return()=>{active=false;};
  },[]);
  async function signIn(event:FormEvent){
    event.preventDefault();setBusy(true);setError('');
    try{
      const authenticatedConfig=await signInWithPassword(password);
      setConfig(authenticatedConfig);
      document.title=authenticatedConfig.name;
      setSignedIn(true);
    }catch(e){setError(e instanceof Error?e.message:'Could not sign in.');}
    finally{setPassword('');setBusy(false);}
  }
  async function signOut(){
    setBusy(true);setError('');
    try{
      const r=await fetch('/api/logout',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:'{}'});
      if(!r.ok)throw Error('Could not sign out. Try again.');
      setSignedIn(false);
    }catch(e){setError(e instanceof Error?e.message:'Could not sign out.');}
    finally{setBusy(false);}
  }
  if(loading)return <main className="auth-shell"><p role="status">Opening your CRM…</p></main>;
  if(!config)return <main className="auth-shell"><section className="auth-panel"><h1>Company CRM</h1><p role="alert">{error}</p><button className="primary-button" onClick={()=>window.location.reload()}>Try again</button></section></main>;
  if(!signedIn)return <main className="auth-shell"><section className="auth-panel"><h1>{config.name}</h1><p>Sign in to your company’s relationship workspace.</p><form onSubmit={signIn}><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} disabled={busy} autoFocus/></label>{error&&<p className="inline-error" role="alert">{error}</p>}<button className="primary-button" disabled={busy}>{busy?'Signing in…':'Sign in'}</button></form></section></main>;
  const logout=()=>{if(!busy)void signOut();};
  return <>{error&&<div className="error-banner" role="alert">{error}</div>}{window.location.pathname==='/data'?<DataRecovery config={config} onLogout={logout} onExpired={expired}/>:<CRMClient config={config} onLogout={logout} onExpired={expired}/>}</>;
}

createRoot(document.getElementById('root')!).render(<App/>);
