import {useEffect} from 'react';
import {
  THIEPN_SSO_PROBE_MESSAGE,
  referrerOrigin,
  ssoProbeClientId,
} from '../account/api/ssoProbe';
import {useAccountService} from '../account/context';

export function SsoProbePage(){
  const service=useAccountService();
  useEffect(()=>{
    let active=true;
    void (async()=>{
      if(window.parent===window)return;

      let clientId:string;
      let parentOrigin:string;
      try{
        clientId=ssoProbeClientId(location.search,location.hash);
        parentOrigin=referrerOrigin(document.referrer);
      }catch{
        return;
      }

      let result;
      try{
        result=await service.ssoProbe.check(clientId);
      }catch{
        return;
      }
      if(!active||parentOrigin!==result.registration.origin)return;

      window.parent.postMessage(
        {
          type:THIEPN_SSO_PROBE_MESSAGE,
          clientId,
          signedIn:result.signedIn,
          eligible:result.registration.eligible,
        },
        result.registration.origin,
      );
    })();

    return()=>{active=false;};
  },[service]);

  return <main aria-hidden="true" className="min-h-dvh bg-transparent"/>;
}
