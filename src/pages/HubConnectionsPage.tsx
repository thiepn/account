import { useEffect, useRef, useState } from 'react';
import { useAccountService } from '../account/context';
import { HUB_NOTE_PURPOSES, parseHubNotesConsent, type HubNotePurpose, type HubNotesConsent } from '../account/api/hubConsent';

const labels:Record<HubNotePurpose,string>={
  'notes.hub.summary.read':'Show recent synced note titles',
  'notes.hub.continue.read':'Offer recently edited notes in Continue',
  'notes.hub.search.read':'Search synced note titles',
  'notes.hub.inbox.read':'Show due reminders and their note titles in Inbox',
  'notes.hub.inbox.attention.write':'Allow marking Inbox reminders read or dismissed',
};
export function HubConnectionsPage(){
  const service=useAccountService();
  const [consent,setConsent]=useState<HubNotesConsent|null>(null);
  const [selected,setSelected]=useState<HubNotePurpose[]>([]);
  const [busy,setBusy]=useState(true),[message,setMessage]=useState('');
  const generation=useRef(0);
  async function load(){
    const epoch=++generation.current;setConsent(null);setSelected([]);setBusy(true);setMessage('');
    try{
      const next=parseHubNotesConsent(await service.hub.readConsent());
      if(epoch===generation.current){setConsent(next);setSelected(next.permissions);}
    }catch{if(epoch===generation.current)setMessage('Hub sharing is unavailable. Try again when Account is reachable.');}
    finally{if(epoch===generation.current)setBusy(false);}
  }
  useEffect(()=>{
    let active=true;
    const unsubscribe=service.auth.subscribe(()=>{
      // Clear synchronously; do not call an async Auth operation in its callback.
      ++generation.current;setConsent(null);setSelected([]);setBusy(true);
      queueMicrotask(()=>{if(active)void load();});
    });
    void load();
    return()=>{active=false;unsubscribe();++generation.current;};
  },[service]);
  async function save(permissions:HubNotePurpose[]){
    if(!consent || busy)return;
    const epoch=generation.current;setBusy(true);setMessage('');
    try{
      const next=parseHubNotesConsent(await service.hub.saveConsent(permissions,consent.revision));
      if(epoch===generation.current){setConsent(next);setSelected(next.permissions);setMessage(next.permissions.length?'Sharing choices saved.':'Hub access revoked.');}
    }catch{if(epoch===generation.current)setMessage('Changes were not saved. Your draft remains here. Reload current choices if another tab changed them.');}
    finally{if(epoch===generation.current)setBusy(false);}
  }
  return <section className="max-w-2xl space-y-5">
    <h1 className="text-2xl font-semibold">Hub sharing</h1>
    <p>Choose what THIEPN Hub may read from your synced Notes and whether it may update Inbox attention. Only titles, reminder attention and update times are shared. Note bodies, attachments and local drafts stay outside this connection.</p>
    <p>Inbox dismissal hides the attention item; it does not complete, dismiss or snooze the reminder in Notes.</p>
    <p>These choices prepare your connection. Private Notes features will appear in Hub when the integration is available.</p>
    <fieldset disabled={busy||!consent} className="space-y-3"><legend className="font-semibold">Notes</legend>
      {HUB_NOTE_PURPOSES.map(p=><label key={p} className="flex items-center gap-3"><input type="checkbox" checked={selected.includes(p)} disabled={p==='notes.hub.inbox.attention.write'&&!selected.includes('notes.hub.inbox.read')} onChange={e=>setSelected(e.target.checked?[...selected,p]:selected.filter(v=>v!==p&&(p!=='notes.hub.inbox.read'||v!=='notes.hub.inbox.attention.write')))}/>{labels[p]}</label>)}
    </fieldset>
    <div className="flex flex-wrap gap-3"><button className="primary-button" disabled={busy||!consent} onClick={()=>void save(selected)}>Save choices</button><button className="secondary-button" disabled={busy||!consent} onClick={()=>void save([])}>Revoke all Hub access</button><button className="inline-link" disabled={busy} onClick={()=>void load()}>Reload current choices</button></div>
    <p role="status" aria-live="polite">{busy?'Checking your sharing choices…':message}</p>
  </section>;
}
