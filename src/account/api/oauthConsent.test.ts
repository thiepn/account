import {describe,it,expect} from 'vitest';
import {
  financeOAuthRedirect,
  oauthConsentRedirect,
  parseOAuthConsentDetails,
} from './oauthConsent';

const OWNER='11111111-1111-4111-8111-111111111111';
const CLIENT='33333333-3333-4333-8333-333333333333';
const HUB_CLIENT='44444444-4444-4444-8444-444444444444';
const ID='finance-authorization';
const callback='https://chatgpt.com/connector/oauth/callback_123';
const details={
  authorization_id:ID,
  redirect_uri:callback,
  client:{id:CLIENT,uri:'https://chatgpt.com/'},
  user:{id:OWNER},
  scope:'openid email profile offline_access',
  resource:'https://finance.thiepn.dev/api/mcp',
};
const options={hubEnabled:true,hubClientId:HUB_CLIENT,financeEnabled:true};

describe('P20 Account OAuth consent boundaries',()=>{
  it('accepts a ChatGPT-owned callback with only standard identity/refresh scopes',()=>{
    expect(parseOAuthConsentDetails(details,ID,OWNER,options)).toEqual({
      authorizationId:ID,
      owner:OWNER,
      kind:'finance-chatgpt',
      title:'ChatGPT',
      scopes:['openid','email','profile','offline_access'],
    });
  });

  it.each([
    {...details,redirect_uri:'https://evil.test/connector/oauth/callback_123'},
    {...details,redirect_uri:'https://chatgpt.com/not-a-connector/callback_123'},
    {...details,scope:'openid finance.write'},
    {...details,resource:'https://another.example/api/mcp'},
    {...details,resource:undefined},
    {...details,user:{id:CLIENT}},
    {...details,client:{id:'not-a-uuid'}},
  ])('rejects unsafe Finance request %j',value=>{
    expect(()=>parseOAuthConsentDetails(value,ID,OWNER,options)).toThrow();
  });

  it('rejects Finance when the staged feature flag is off',()=>{
    expect(()=>parseOAuthConsentDetails(details,ID,OWNER,{...options,financeEnabled:false})).toThrow();
  });

  it('validates ChatGPT code and denial redirects without trusting arbitrary destinations',()=>{
    const success=callback+'?code=fictional-code&state=opaque_state_123';
    const denied=callback+'?error=access_denied&error_description=Denied&state=opaque_state_123';
    expect(financeOAuthRedirect(success)).toBe(success);
    expect(oauthConsentRedirect(denied,'finance-chatgpt')).toBe(denied);
    expect(()=>financeOAuthRedirect(success.replace('chatgpt.com','evil.test'))).toThrow();
    expect(()=>financeOAuthRedirect(success+'&next=https://evil.test')).toThrow();
    expect(()=>financeOAuthRedirect(success+'#token')).toThrow();
  });

  it('keeps existing Hub requests on the strict H14 parser',()=>{
    const hub={
      authorization_id:'hub-auth',
      redirect_uri:'https://thiepn.dev/home/',
      client:{id:HUB_CLIENT,uri:'https://thiepn.dev/'},
      user:{id:OWNER},
      scope:'email',
    };
    expect(parseOAuthConsentDetails(hub,'hub-auth',OWNER,options)).toMatchObject({
      kind:'hub',
      title:'THIEPN Hub',
      scopes:['email'],
    });
  });
});
