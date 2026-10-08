const CLIENT_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function firstPartyHostname(hostname){
  return hostname==='thiepn.dev'||hostname.endsWith('.thiepn.dev');
}

/**
 * Production SSO onboarding runs only against THIEPN-owned HTTPS domains.
 * It never registers clients, accepts credentials or retrieves Auth tokens.
 */
export function validateFirstPartyOnboarding(appUrl,clientId,callbackUrl){
  let app,callback;
  try{
    app=new URL(appUrl);
    callback=new URL(callbackUrl);
  }catch{throw new Error('FIRST_PARTY_URL_INVALID');}
  for(const url of [app,callback]){
    if(url.protocol!=='https:'||
      !firstPartyHostname(url.hostname)||
      url.username||url.password||url.search||url.hash||
      url.port)throw new Error('FIRST_PARTY_HTTPS_URL_REQUIRED');
  }
  if(app.origin!==callback.origin)throw new Error('FIRST_PARTY_CALLBACK_ORIGIN_MISMATCH');
  if(!CLIENT_RE.test(clientId))throw new Error('FIRST_PARTY_CLIENT_ID_INVALID');
  return Object.freeze({
    appUrl:app.href,
    appOrigin:app.origin,
    callbackUrl:callback.href,
    clientId:clientId.toLowerCase(),
  });
}
