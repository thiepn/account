import {useEffect,useRef,useState} from 'react';
import {useAccountService} from '../account/context';
import {authorizationId} from '../account/api/hubOAuth';
import type {OAuthConsentDetails} from '../account/api/oauthConsent';

export function OAuthConsentPage(){
  const service=useAccountService(),generation=useRef(0);
  const [details,setDetails]=useState<OAuthConsentDetails|null>(null),[busy,setBusy]=useState(true),[message,setMessage]=useState('');
  const query=new URLSearchParams(location.search);
  const id=query.getAll('authorization_id').length===1&&[...query.keys()].every(k=>k==='authorization_id')&&!location.hash?query.get('authorization_id'):null;

  useEffect(()=>{
    let active=true;
    let observedOwner:string|null|undefined=undefined;
    const load=async()=>{
      const epoch=++generation.current;
      setDetails(null);setBusy(true);setMessage('');
      try{
        const next=await service.oauthConsent.details(authorizationId(id));
        if(!active||epoch!==generation.current)return;
        if('redirectUrl' in next){location.replace(next.redirectUrl);return;}
        setDetails(next);
      }catch{
        if(active&&epoch===generation.current)setMessage('This authorization request is unavailable, unsafe, or expired. Start the connection again from the requesting app.');
      }finally{
        if(active&&epoch===generation.current)setBusy(false);
      }
    };
    const off=service.auth.subscribe((state,accountId)=>{
      const owner=state==="signed-in"?(accountId??null):null;
      // INITIAL_SESSION and token refreshes can fire during OAuth consent.
      // Replaying an unchanged authorization could issue a duplicate code.
      if(observedOwner===undefined){observedOwner=owner;return;}
      if(observedOwner===owner)return;
      observedOwner=owner;
      ++generation.current;setDetails(null);setBusy(true);
      globalThis.setTimeout(()=>{if(active)void load();},0);
    });
    void load();
    return()=>{active=false;off();++generation.current;};
  },[service,id]);

  async function decide(approve:boolean){
    if(!details||'redirectUrl' in details||busy)return;
    const epoch=generation.current;
    setBusy(true);setMessage('');
    try{
      const url=await service.oauthConsent.decide(details.authorizationId,details.owner,details.kind,approve);
      if(epoch===generation.current)location.replace(url);
    }catch{
      if(epoch===generation.current)setMessage('Authorization could not be completed. Return to the requesting app and try again.');
    }finally{
      if(epoch===generation.current)setBusy(false);
    }
  }

  if(details&&'kind' in details&&details.kind==='first-party-reconnect'){
    return <section className="mx-auto max-w-xl space-y-5 px-5 py-10">
      <p className="text-sm text-[var(--muted)]">THIEPN Account · App connection</p>
      <h1 className="text-2xl font-semibold">Reconnect {details.title}?</h1>
      <p>You previously disconnected this app. It cannot automatically reconnect using your Account session.</p>
      <p>Reconnect permits {details.title} to use only your basic THIEPN identity. Sensitive sharing and synchronization permissions remain separate and are not restored automatically.</p>
      <p className="text-sm text-[var(--muted)]">This request is for the registered {details.appSlug} app and its verified OAuth callback.</p>
      <div className="flex flex-wrap gap-3">
        <button className="primary-button" disabled={busy} onClick={()=>void decide(true)}>Reconnect {details.title}</button>
        <button className="secondary-button" disabled={busy} onClick={()=>void decide(false)}>Do not reconnect</button>
      </div>
      <p role="status" aria-live="polite">{busy?'Checking the request…':message}</p>
    </section>;
  }

  if(details&&'kind' in details&&details.kind==='finance-chatgpt'){
    return <section className="max-w-2xl space-y-5">
      <h1 className="text-2xl font-semibold">Connect ChatGPT to THIEPN Finance</h1>
      <p>Allow ChatGPT to use your THIEPN Account identity when it calls the read-only THIEPN Finance MCP server.</p>
      <p>ChatGPT can request deterministic Finance answers, metrics, evidence and provenance. This connection cannot create, edit or delete transactions, receipts, budgets, accounts or other Finance data.</p>
      <p className="text-sm text-[var(--muted)]">Requested OAuth scopes: {details.scopes.join(', ')}</p>
      <div className="flex gap-3">
        <button className="primary-button" disabled={busy} onClick={()=>void decide(true)}>Connect ChatGPT</button>
        <button className="secondary-button" disabled={busy} onClick={()=>void decide(false)}>Decline</button>
      </div>
      <p role="status">{busy?'Checking the authorization request…':message}</p>
    </section>;
  }

  return <section className="max-w-2xl space-y-5">
    <h1 className="text-2xl font-semibold">Connect THIEPN Hub</h1>
    <p>Allow Hub to use this Account session. Your separate app sharing choices decide what Hub may read from Notes and each TMS60 translation.</p>
    <p>Connecting does not change those choices. Note bodies, attachments, Bible text, practice answers and local drafts stay outside this connection.</p>
    <a className="inline-link" href="/hub/connections">Review Notes sharing</a>
    <a className="inline-link" href="/hub/tms60">Review TMS60 sharing</a>
    <div className="flex gap-3">
      <button className="primary-button" disabled={busy||!details} onClick={()=>void decide(true)}>Connect Hub</button>
      <button className="secondary-button" disabled={busy||!details} onClick={()=>void decide(false)}>Decline</button>
    </div>
    <p role="status">{busy?'Checking the authorization request…':message}</p>
  </section>;
}
