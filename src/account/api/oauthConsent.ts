import {
  authorizationId,
  hubOAuthRedirect,
  parseHubOAuthDetails,
} from './hubOAuth';

const chatGptOrigin='https://chatgpt.com';
const financeResource='https://finance.thiepn.dev/api/mcp';
const allowedFinanceScopes=new Set(['openid','email','profile','offline_access']);
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

export type OAuthConsentKind='hub'|'finance-chatgpt'|'first-party-reconnect';
export type OAuthConsentDetails=
  |{authorizationId:string;owner:string;kind:'hub';title:'THIEPN Hub';scopes:['email']}
  |{authorizationId:string;owner:string;kind:'finance-chatgpt';title:'ChatGPT';scopes:string[]}
  |{authorizationId:string;owner:string;kind:'first-party-reconnect';title:string;clientId:string;appSlug:string;redirectUri:string;approvedRedirectUrl?:string}
  |{redirectUrl:string};

export interface OAuthConsentOptions{
  hubEnabled:boolean;
  hubClientId:string;
  financeEnabled:boolean;
}

function chatGptCallback(raw:unknown):URL{
  if(typeof raw!=='string'||raw.length>4096)throw new Error('OAUTH_CONSENT_UNAVAILABLE');
  const url=new URL(raw);
  if(
    url.origin!==chatGptOrigin||
    !/^\/connector\/oauth\/[A-Za-z0-9._~-]{1,256}$/.test(url.pathname)||
    url.hash||
    url.username||
    url.password
  )throw new Error('OAUTH_CONSENT_UNAVAILABLE');
  return url;
}

function safeOpaque(value:string|null,max:number):boolean{
  return value!==null&&value.length>=1&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value);
}

export function financeOAuthRedirect(raw:unknown):string{
  const url=chatGptCallback(raw),params=url.searchParams;
  if(params.getAll('state').length!==1||!safeOpaque(params.get('state'),2048))
    throw new Error('OAUTH_CONSENT_UNAVAILABLE');

  const hasCode=params.has('code');
  const allowed=hasCode?['code','state']:['error','error_description','state'];
  if([...params.keys()].some(k=>!allowed.includes(k)||params.getAll(k).length!==1))
    throw new Error('OAUTH_CONSENT_UNAVAILABLE');

  if(hasCode){
    if(!safeOpaque(params.get('code'),4096))throw new Error('OAUTH_CONSENT_UNAVAILABLE');
  }else{
    if(params.get('error')!=='access_denied'||(params.get('error_description')?.length??0)>1024)
      throw new Error('OAUTH_CONSENT_UNAVAILABLE');
  }
  return url.href;
}

function scopes(raw:unknown):string[]{
  if(typeof raw!=='string')throw new Error('OAUTH_CONSENT_UNAVAILABLE');
  const values=[...new Set(raw.split(/\s+/).map(v=>v.trim()).filter(Boolean))];
  if(!values.length||values.some(value=>!allowedFinanceScopes.has(value)))
    throw new Error('OAUTH_CONSENT_UNAVAILABLE');
  return values;
}

function financeDetails(raw:Record<string,unknown>,id:string,owner:string):OAuthConsentDetails{
  const client=raw.client as Record<string,unknown>|undefined;
  const user=raw.user as Record<string,unknown>|undefined;
  const redirect=chatGptCallback(raw.redirect_uri);
  if(
    raw.authorization_id!==id||
    raw.resource!==financeResource||
    !uuid(client?.id)||
    user?.id!==owner||
    !uuid(owner)
  )throw new Error('OAUTH_CONSENT_UNAVAILABLE');

  return{
    authorizationId:id,
    owner,
    kind:'finance-chatgpt',
    title:'ChatGPT',
    scopes:scopes(raw.scope),
  };
}

export function oauthConsentRedirect(raw:unknown,kind?:OAuthConsentKind):string{
  if(kind==='hub')return hubOAuthRedirect(raw);
  if(kind==='finance-chatgpt')return financeOAuthRedirect(raw);
  try{return hubOAuthRedirect(raw);}catch{return financeOAuthRedirect(raw);}
}

export function parseOAuthConsentDetails(
  raw:unknown,
  id:string,
  owner:string,
  options:OAuthConsentOptions,
):OAuthConsentDetails{
  authorizationId(id);
  if(!uuid(owner)||!raw||typeof raw!=='object'||Array.isArray(raw))
    throw new Error('OAUTH_CONSENT_UNAVAILABLE');

  const value=raw as Record<string,unknown>;
  if(Object.keys(value).join(',')==='redirect_url')
    return{redirectUrl:oauthConsentRedirect(value.redirect_url)};

  const redirect=String(value.redirect_uri??'');
  if(redirect==='https://thiepn.dev/home/'||redirect==='https://thiepn.dev/inbox/'){
    if(!options.hubEnabled)throw new Error('OAUTH_CONSENT_UNAVAILABLE');
    const parsed=parseHubOAuthDetails(raw,id,owner,options.hubClientId);
    if('redirectUrl' in parsed)return parsed;
    return{
      authorizationId:parsed.authorizationId,
      owner:parsed.owner,
      kind:'hub',
      title:'THIEPN Hub',
      scopes:['email'],
    };
  }

  if(options.financeEnabled){
    chatGptCallback(redirect);
    return financeDetails(value,id,owner);
  }

  throw new Error('OAUTH_CONSENT_UNAVAILABLE');
}
