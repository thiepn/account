const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface FirstPartyOAuthRequest {
  authorizationId:string;
  owner:string;
  clientId:string;
  clientUri:string;
  redirectUri:string;
  scope:string;
}

export interface FirstPartyOAuthRegistration {
  clientId:string;
  appSlug:string;
  appName:string;
  clientName:string;
  clientUri:string;
  redirectUri:string;
  automaticIdentityConsent:boolean;
}

function exactHttpsUrl(raw:unknown,code:string):string{
  if(typeof raw!=='string'||raw.length>4096)throw new Error(code);
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.username||url.password||url.hash)return (()=>{throw new Error(code);})();
  return url.href;
}

function safeOpaque(value:string|null,max:number):boolean{
  return value!==null&&value.length>=1&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value);
}

export function firstPartyOAuthRequest(raw:unknown,id:string,owner:string):FirstPartyOAuthRequest{
  if(!UUID_RE.test(owner)||!raw||typeof raw!=='object'||Array.isArray(raw))
    throw new Error('FIRST_PARTY_OAUTH_UNAVAILABLE');
  const value=raw as Record<string,unknown>;
  if(Object.keys(value).join(',')==='redirect_url')
    throw new Error('FIRST_PARTY_OAUTH_UNAVAILABLE');
  const client=value.client as Record<string,unknown>|undefined;
  const user=value.user as Record<string,unknown>|undefined;
  if(
    value.authorization_id!==id||
    user?.id!==owner||
    typeof client?.id!=='string'||
    !UUID_RE.test(client.id)||
    typeof value.scope!=='string'||
    !value.scope.trim()
  )throw new Error('FIRST_PARTY_OAUTH_UNAVAILABLE');
  return{
    authorizationId:id,
    owner,
    clientId:client.id,
    clientUri:exactHttpsUrl(client.uri,'FIRST_PARTY_OAUTH_UNAVAILABLE'),
    redirectUri:exactHttpsUrl(value.redirect_uri,'FIRST_PARTY_OAUTH_UNAVAILABLE'),
    scope:value.scope.trim(),
  };
}

export function parseFirstPartyOAuthRegistration(
  raw:unknown,
  request:FirstPartyOAuthRequest,
):FirstPartyOAuthRegistration{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))
    throw new Error('FIRST_PARTY_OAUTH_UNAVAILABLE');
  const value=raw as Record<string,unknown>;
  if(
    value.clientId!==request.clientId||
    typeof value.appSlug!=='string'||
    !/^[a-z][a-z0-9-]{0,62}$/.test(value.appSlug)||
    typeof value.appName!=='string'||
    !value.appName.trim()||
    typeof value.clientName!=='string'||
    !value.clientName.trim()||
    value.clientUri!==request.clientUri||
    value.redirectUri!==request.redirectUri||
    typeof value.automaticIdentityConsent!=='boolean'
  )throw new Error('FIRST_PARTY_OAUTH_UNAVAILABLE');
  return{
    clientId:request.clientId,
    appSlug:value.appSlug,
    appName:value.appName,
    clientName:value.clientName,
    clientUri:request.clientUri,
    redirectUri:request.redirectUri,
    automaticIdentityConsent:value.automaticIdentityConsent,
  };
}

export function firstPartyOAuthRedirect(raw:unknown,registeredRedirect:string):string{
  const expected=new URL(exactHttpsUrl(registeredRedirect,'FIRST_PARTY_OAUTH_UNAVAILABLE'));
  if(expected.search||expected.hash)throw new Error('FIRST_PARTY_OAUTH_UNAVAILABLE');
  const url=new URL(exactHttpsUrl(raw,'FIRST_PARTY_OAUTH_UNAVAILABLE'));
  if(url.origin!==expected.origin||url.pathname!==expected.pathname)
    throw new Error('FIRST_PARTY_OAUTH_UNAVAILABLE');

  const params=url.searchParams;
  if(params.getAll('state').length!==1||!safeOpaque(params.get('state'),2048))
    throw new Error('FIRST_PARTY_OAUTH_UNAVAILABLE');

  if(params.has('code')){
    if(
      params.getAll('code').length!==1||
      !safeOpaque(params.get('code'),4096)||
      [...params.keys()].some(key=>!['code','state'].includes(key)||params.getAll(key).length!==1)
    )throw new Error('FIRST_PARTY_OAUTH_UNAVAILABLE');
  }else{
    if(
      params.getAll('error').length!==1||
      !safeOpaque(params.get('error'),256)||
      [...params.keys()].some(key=>!['error','error_description','state'].includes(key)||params.getAll(key).length!==1)||
      (params.get('error_description')?.length??0)>1024
    )throw new Error('FIRST_PARTY_OAUTH_UNAVAILABLE');
  }
  return url.href;
}
