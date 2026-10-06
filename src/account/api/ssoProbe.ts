const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const THIEPN_SSO_PROBE_MESSAGE='thiepn:sso-probe:v1';

export interface SsoProbeRegistration{
  clientId:string;
  appSlug:string;
  origin:string;
  eligible:boolean;
}

export function ssoProbeClientId(search:string,hash:string):string{
  if(hash)throw new Error('SSO_PROBE_INVALID');
  const params=new URLSearchParams(search);
  if([...params.keys()].some(key=>key!=='client_id')||params.getAll('client_id').length!==1)
    throw new Error('SSO_PROBE_INVALID');
  const clientId=params.get('client_id');
  if(!clientId||!UUID_RE.test(clientId))throw new Error('SSO_PROBE_INVALID');
  return clientId;
}

export function parseSsoProbeRegistration(raw:unknown,clientId:string):SsoProbeRegistration{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('SSO_PROBE_INVALID');
  const value=raw as Record<string,unknown>;
  if(
    value.clientId!==clientId||
    typeof value.appSlug!=='string'||
    !/^[a-z][a-z0-9-]{0,62}$/.test(value.appSlug)||
    typeof value.origin!=='string'||
    typeof value.eligible!=='boolean'
  )throw new Error('SSO_PROBE_INVALID');
  const origin=new URL(value.origin);
  if(origin.protocol!=='https:'||origin.origin!==value.origin||origin.pathname!=='/'||origin.search||origin.hash)
    throw new Error('SSO_PROBE_INVALID');
  return{clientId,appSlug:value.appSlug,origin:value.origin,eligible:value.eligible};
}

export function referrerOrigin(referrer:string):string{
  if(!referrer)throw new Error('SSO_PROBE_INVALID');
  const url=new URL(referrer);
  if(url.protocol!=='https:')throw new Error('SSO_PROBE_INVALID');
  return url.origin;
}
