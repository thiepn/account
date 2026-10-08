import {chromium} from '@playwright/test';
import {validateFirstPartyOnboarding} from './first-party-onboarding-contract.mjs';

const ACCOUNT='https://account.thiepn.dev';
const ISSUER='https://hycegznamzjhwinegaai.supabase.co/auth/v1';

export async function verifyFirstPartyOnboarding(config){
  const discovery=await fetch(
    'https://hycegznamzjhwinegaai.supabase.co/.well-known/oauth-authorization-server/auth/v1',
    {redirect:'error',signal:AbortSignal.timeout(10_000)},
  );
  if(!discovery.ok)throw new Error(`OAUTH_DISCOVERY_HTTP_${discovery.status}`);
  const metadata=await discovery.json();
  if(
    metadata.issuer!==ISSUER||
    metadata.authorization_endpoint!==ISSUER+'/oauth/authorize'||
    metadata.token_endpoint!==ISSUER+'/oauth/token'||
    !metadata.code_challenge_methods_supported?.includes('S256')||
    !metadata.grant_types_supported?.includes('authorization_code')||
    !metadata.grant_types_supported?.includes('refresh_token')||
    !metadata.token_endpoint_auth_methods_supported?.includes('none')
  )throw new Error('OAUTH_DISCOVERY_CONTRACT_MISMATCH');

  // Check that the real product is published before using a synthetic
  // same-origin test document to probe Account. Do not depend on app JS.
  let target=config.appUrl;
  let found=false;
  for(let i=0;i<5;i++){
    const response=await fetch(target,{
      redirect:'manual',
      signal:AbortSignal.timeout(15_000),
    });
    if(response.status>=300&&response.status<400){
      const location=response.headers.get('location');
      if(!location)throw new Error('APP_REDIRECT_LOCATION_MISSING');
      const next=new URL(location,target);
      if(next.origin!==config.appOrigin)throw new Error('APP_REDIRECT_LEFT_REGISTERED_ORIGIN');
      target=next.href;
      continue;
    }
    if(!response.ok)throw new Error(`APP_HTTP_${response.status}`);
    found=true;
    break;
  }
  if(!found)throw new Error('APP_REDIRECT_LIMIT_EXCEEDED');

  const browser=await chromium.launch({headless:true});
  try{
    const context=await browser.newContext({serviceWorkers:'block'});
    const page=await context.newPage();
    await page.route(config.appUrl,async route=>{
      await route.fulfill({
        status:200,
        contentType:'text/html; charset=utf-8',
        body:'<!doctype html><html lang="en"><head><title>THIEPN SSO qualification</title></head><body>SSO probe qualification</body></html>',
      });
    });
    await page.goto(config.appUrl,{waitUntil:'domcontentloaded',timeout:20_000});
    if(new URL(page.url()).origin!==config.appOrigin){
      throw new Error('APP_ORIGIN_CHANGED_DURING_PROBE');
    }

    const result=await page.evaluate(async ({account,clientId})=>
      await new Promise((resolve,reject)=>{
        const origin=new URL(account).origin;
        const frame=document.createElement('iframe');
        frame.hidden=true;
        frame.referrerPolicy='origin';
        frame.setAttribute('sandbox','allow-scripts allow-same-origin');
        frame.src=`${account}/sso/probe?client_id=${encodeURIComponent(clientId)}`;
        const timer=setTimeout(()=>finish(null,new Error('SSO_PROBE_TIMEOUT')),12_000);
        let finished=false;
        function finish(message,error){
          if(finished)return;
          finished=true;
          clearTimeout(timer);
          window.removeEventListener('message',receive);
          frame.remove();
          if(error)reject(error);
          else resolve(message);
        }
        function receive(event){
          if(event.origin!==origin||event.source!==frame.contentWindow)return;
          const value=event.data;
          if(!value||value.type!=='thiepn:sso-probe:v1'||value.clientId!==clientId)return;
          if(typeof value.signedIn!=='boolean'||typeof value.eligible!=='boolean'){
            return finish(null,new Error('SSO_PROBE_RESPONSE_INVALID'));
          }
          finish({signedIn:value.signedIn,eligible:value.eligible},null);
        }
        window.addEventListener('message',receive);
        document.body.append(frame);
      }),{account:ACCOUNT,clientId:config.clientId});
    if(result.signedIn!==false)throw new Error('FRESH_BROWSER_INHERITED_ACCOUNT_SESSION');
    if(result.eligible!==true)throw new Error('SSO_CLIENT_NOT_ELIGIBLE');

    await context.close();
    return {appOrigin:config.appOrigin,clientId:config.clientId,oauth:'valid',probe:'eligible'};
  }finally{
    await browser.close();
  }
}

if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1]){
  try{
    const config=validateFirstPartyOnboarding(process.argv[2],process.argv[3],process.argv[4]);
    const result=await verifyFirstPartyOnboarding(config);
    console.log('First-party Account onboarding preflight passed:',JSON.stringify(result));
  }catch(error){
    console.error(error instanceof Error?error.message:String(error));
    process.exitCode=1;
  }
}
