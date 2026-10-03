const callback='https://thiepn.dev/home/';
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export type HubOAuthDetails={authorizationId:string;owner:string;scope:'email'}|{redirectUrl:string};
export function authorizationId(value:unknown):string{
  if(typeof value!=='string'||! /^[A-Za-z0-9_-]{1,128}$/.test(value))throw new Error('HUB_OAUTH_UNAVAILABLE');return value;
}
export function hubOAuthRedirect(raw:unknown):string{
  if(typeof raw!=='string'||raw.length>4096)throw new Error('HUB_OAUTH_UNAVAILABLE');
  const url=new URL(raw),params=url.searchParams;
  if(url.origin!=='https://thiepn.dev'||url.pathname!=='/home/'||url.hash||url.username||url.password||params.getAll('state').length!==1||! /^[A-Za-z0-9_-]{43}$/.test(params.get('state')??''))throw new Error('HUB_OAUTH_UNAVAILABLE');
  const allowed=params.has('code')?['code','state']:['error','error_description','state'];
  if([...params.keys()].some(k=>!allowed.includes(k)||params.getAll(k).length!==1)||
    (params.has('code')?! /^[A-Za-z0-9._~-]{1,2048}$/.test(params.get('code')??''):params.get('error')!=='access_denied')||
    (params.get('error_description')?.length??0)>1024)throw new Error('HUB_OAUTH_UNAVAILABLE');
  return url.href;
}
export function parseHubOAuthDetails(raw:unknown,id:string,owner:string,clientId:string):HubOAuthDetails{
  if(!uuid(clientId)||!uuid(owner)||!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('HUB_OAUTH_UNAVAILABLE');
  const v=raw as Record<string,unknown>;
  if(Object.keys(v).join(',')==='redirect_url')return{redirectUrl:hubOAuthRedirect(v.redirect_url)};
  const client=v.client as Record<string,unknown>|undefined,user=v.user as Record<string,unknown>|undefined;
  if(v.authorization_id!==id||v.redirect_uri!==callback||v.scope!=='email'||client?.id!==clientId||!['https://thiepn.dev','https://thiepn.dev/'].includes(String(client?.uri))||user?.id!==owner)throw new Error('HUB_OAUTH_UNAVAILABLE');
  return{authorizationId:id,owner,scope:'email'};
}
