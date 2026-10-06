import {useEffect} from 'react';
import {getAccountSupabaseClient} from '../account/api/supabase';
import {
  THIEPN_SSO_PROBE_MESSAGE,
  parseSsoProbeRegistration,
  referrerOrigin,
  ssoProbeClientId,
} from '../account/api/ssoProbe';

export function SsoProbePage(){
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

      const supabase=getAccountSupabaseClient();
      const {data:resolved,error:resolveError}=await supabase.rpc(
        'resolve_thiepn_first_party_sso_probe',
        {p_client_id:clientId},
      );
      if(!active||resolveError||!resolved)return;

      let registration;
      try{
        registration=parseSsoProbeRegistration(resolved,clientId);
      }catch{
        return;
      }
      if(parentOrigin!==registration.origin)return;

      const {data:sessionData,error:sessionError}=await supabase.auth.getSession();
      if(!active||sessionError)return;

      let signedIn=false;
      if(sessionData.session){
        const {data:userData,error:userError}=await supabase.auth.getUser();
        if(!active||userError)return;
        signedIn=Boolean(userData.user&&!userData.user.is_anonymous);
      }

      window.parent.postMessage(
        {type:THIEPN_SSO_PROBE_MESSAGE,clientId,signedIn},
        registration.origin,
      );
    })();

    return()=>{active=false;};
  },[]);

  return <main aria-hidden="true" className="min-h-dvh bg-transparent"/>;
}
