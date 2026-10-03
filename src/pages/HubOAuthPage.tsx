import {useEffect,useRef,useState} from 'react';
import {useAccountService} from '../account/context';
import {authorizationId,type HubOAuthDetails} from '../account/api/hubOAuth';
export function HubOAuthPage(){
  const service=useAccountService(),generation=useRef(0);
  const [details,setDetails]=useState<HubOAuthDetails|null>(null),[busy,setBusy]=useState(true),[message,setMessage]=useState('');
  const query=new URLSearchParams(location.search);
  const id=query.getAll('authorization_id').length===1&&[...query.keys()].every(k=>k==='authorization_id')&&!location.hash?query.get('authorization_id'):null;
  useEffect(()=>{
    let active=true;
    const load=async()=>{const epoch=++generation.current;setDetails(null);setBusy(true);try{const next=await service.hubOAuth.details(authorizationId(id));if(!active||epoch!==generation.current)return;if('redirectUrl' in next){location.replace(next.redirectUrl);return;}setDetails(next);}catch{if(active&&epoch===generation.current)setMessage('This Hub authorization is unavailable or expired. Start again from Hub.');}finally{if(active&&epoch===generation.current)setBusy(false);}};
    const off=service.auth.subscribe(()=>{++generation.current;setDetails(null);setBusy(true);queueMicrotask(()=>{if(active)void load();});});void load();return()=>{active=false;off();++generation.current;};
  },[service,id]);
  async function decide(approve:boolean){if(!details||'redirectUrl' in details||busy)return;const epoch=generation.current;setBusy(true);try{const url=await service.hubOAuth.decide(details.authorizationId,details.owner,approve);if(epoch===generation.current)location.replace(url);}catch{if(epoch===generation.current)setMessage('Authorization could not be completed. Return to Hub and try again.');}finally{if(epoch===generation.current)setBusy(false);}}
  return <section className="max-w-2xl space-y-5"><h1 className="text-2xl font-semibold">Connect THIEPN Hub</h1><p>Allow Hub to use this Account session. Your separate app sharing choices decide what Hub may read from Notes and each TMS60 translation.</p><p>Connecting does not change those choices. Note bodies, attachments, Bible text, practice answers and local drafts stay outside this connection.</p><a className="inline-link" href="/hub/connections">Review Notes sharing</a><a className="inline-link" href="/hub/tms60">Review TMS60 sharing</a><div className="flex gap-3"><button className="primary-button" disabled={busy||!details} onClick={()=>void decide(true)}>Connect Hub</button><button className="secondary-button" disabled={busy||!details} onClick={()=>void decide(false)}>Decline</button></div><p role="status">{busy?'Checking the authorization request…':message}</p></section>;
}
