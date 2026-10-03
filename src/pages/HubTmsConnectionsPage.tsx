import { useEffect, useRef, useState } from 'react';
import { useAccountService } from '../account/context';
import { HUB_TMS_PURPOSES, parseHubTmsConsent, type HubTmsPurpose, type HubTmsConsent, TMS_TRANSLATIONS, type TmsTranslation } from '../account/api/hubTmsConsent';

const labels:Record<HubTmsPurpose,string>={
  'tms60.hub.summary.read':'Show due review counts and references',
  'tms60.hub.continue.read':'Offer recently practised verses in Continue',
  'tms60.hub.search.read':'Search Bible references',
};
export function HubTmsConnectionsPage(){
  const [translation,setTranslation]=useState<TmsTranslation>("esv");
  const service=useAccountService();
  const [consent,setConsent]=useState<HubTmsConsent|null>(null);
  const [selected,setSelected]=useState<HubTmsPurpose[]>([]);
  const [busy,setBusy]=useState(true),[message,setMessage]=useState('');
  const generation=useRef(0);
  async function load(){
    const epoch=++generation.current;setConsent(null);setSelected([]);setBusy(true);setMessage('');
    try{
      const next=parseHubTmsConsent(await service.hubTms.readConsent(translation));
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
  },[service,translation]);
  async function save(permissions:HubTmsPurpose[]){
    if(!consent || busy)return;
    const epoch=generation.current;setBusy(true);setMessage('');
    try{
      const next=parseHubTmsConsent(await service.hubTms.saveConsent(translation,permissions,consent.revision));
      if(epoch===generation.current){setConsent(next);setSelected(next.permissions);setMessage(next.permissions.length?'Sharing choices saved.':'Hub access revoked.');}
    }catch{if(epoch===generation.current)setMessage('Changes were not saved. Your draft remains here. Reload current choices if another tab changed them.');}
    finally{if(epoch===generation.current)setBusy(false);}
  }
  return <section className="max-w-2xl space-y-5">
    <h1 className="text-2xl font-semibold">TMS60 sharing with Hub</h1>
    <label>Translation <select value={translation} onChange={e=>{++generation.current;setConsent(null);setSelected([]);setBusy(true);setTranslation(e.target.value as TmsTranslation);}}>{TMS_TRANSLATIONS.map(id=><option key={id} value={id}>{id.toUpperCase()}</option>)}</select></label>
    <p>Choose sharing separately for each translation. Hub reads review counts, Bible references and timestamps from its cloud snapshot. Answers, Bible text and local practice stay in TMS60.</p>
    <p>These choices prepare your connection. Private TMS60 features will appear in Hub when the integration is available.</p>
    <fieldset disabled={busy||!consent} className="space-y-3"><legend className="font-semibold">Selected translation</legend>
      {HUB_TMS_PURPOSES.map(p=><label key={p} className="flex items-center gap-3"><input type="checkbox" checked={selected.includes(p)} onChange={e=>setSelected(e.target.checked?[...selected,p]:selected.filter(v=>v!==p))}/>{labels[p]}</label>)}
    </fieldset>
    <div className="flex flex-wrap gap-3"><button className="primary-button" disabled={busy||!consent} onClick={()=>void save(selected)}>Save choices</button><button className="secondary-button" disabled={busy||!consent} onClick={()=>void save([])}>Revoke this translation</button><button className="inline-link" disabled={busy} onClick={()=>void load()}>Reload current choices</button></div>
    <p role="status" aria-live="polite">{busy?'Checking your sharing choices…':message}</p>
  </section>;
}
