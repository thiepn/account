import {describe,expect,it} from 'vitest';
import {
  firstPartyOAuthRedirect,
  firstPartyOAuthRedirectTarget,
  firstPartyOAuthRequest,
  parseFirstPartyOAuthRegistration,
  parseFirstPartyOAuthResolvedRegistration,
} from './firstPartyOAuth';

const OWNER='11111111-1111-4111-8111-111111111111';
const CLIENT='22222222-2222-4222-8222-222222222222';
const ID='first-party-auth';
const REDIRECT='https://thiepn.dev/library/auth/callback/';
const REQUEST={
  authorization_id:ID,
  redirect_uri:REDIRECT,
  client:{id:CLIENT,uri:'https://thiepn.dev/library/'},
  user:{id:OWNER},
  scope:'openid email profile offline_access',
};

describe('THIEPN first-party OAuth boundary',()=>{
  it('extracts a strict authenticated first-party request envelope',()=>{
    expect(firstPartyOAuthRequest(REQUEST,ID,OWNER)).toEqual({
      authorizationId:ID,
      owner:OWNER,
      clientId:CLIENT,
      clientUri:'https://thiepn.dev/library/',
      redirectUri:REDIRECT,
      scope:'openid email profile offline_access',
    });
  });

  it('requires resolver output to match the exact OAuth client and redirect',()=>{
    const request=firstPartyOAuthRequest(REQUEST,ID,OWNER);
    expect(parseFirstPartyOAuthRegistration({
      clientId:CLIENT,
      appSlug:'library',
      appName:'Library',
      clientName:'THIEPN Library',
      clientUri:'https://thiepn.dev/library/',
      redirectUri:REDIRECT,
      automaticIdentityConsent:true,
    },request)).toMatchObject({
      appSlug:'library',
      clientId:CLIENT,
      automaticIdentityConsent:true,
    });

    expect(()=>parseFirstPartyOAuthRegistration({
      clientId:CLIENT,
      appSlug:'library',
      appName:'Library',
      clientName:'THIEPN Library',
      clientUri:'https://evil.test/',
      redirectUri:REDIRECT,
      automaticIdentityConsent:true,
    },request)).toThrow('FIRST_PARTY_OAUTH_UNAVAILABLE');
  });


  it('handles the already-consented redirect fast path without losing registry validation',()=>{
    const success=REDIRECT+'?code=one-use-code&state=opaque-state';
    expect(firstPartyOAuthRedirectTarget(success)).toBe(REDIRECT);
    expect(parseFirstPartyOAuthResolvedRegistration({
      clientId:CLIENT,
      appSlug:'library',
      appName:'Library',
      clientName:'THIEPN Library',
      clientUri:'https://thiepn.dev/library/',
      redirectUri:REDIRECT,
      automaticIdentityConsent:true,
    },REDIRECT)).toMatchObject({
      clientId:CLIENT,
      appSlug:'library',
      redirectUri:REDIRECT,
      automaticIdentityConsent:true,
    });
    expect(()=>parseFirstPartyOAuthResolvedRegistration({
      clientId:CLIENT,
      appSlug:'library',
      appName:'Library',
      clientName:'THIEPN Library',
      clientUri:'https://thiepn.dev/library/',
      redirectUri:'https://evil.test/callback',
      automaticIdentityConsent:true,
    },REDIRECT)).toThrow('FIRST_PARTY_OAUTH_UNAVAILABLE');
  });

  it('accepts only an exact registered callback carrying OAuth result fields',()=>{
    const success=REDIRECT+'?code=one-use-code&state=opaque-state';
    const denied=REDIRECT+'?error=access_denied&error_description=Denied&state=opaque-state';
    expect(firstPartyOAuthRedirect(success,REDIRECT)).toBe(success);
    expect(firstPartyOAuthRedirect(denied,REDIRECT)).toBe(denied);
    expect(()=>firstPartyOAuthRedirect('https://evil.test/?code=x&state=y',REDIRECT)).toThrow();
    expect(()=>firstPartyOAuthRedirect(success+'&next=https://evil.test',REDIRECT)).toThrow();
    expect(()=>firstPartyOAuthRedirect(success+'#token',REDIRECT)).toThrow();
  });

  it.each([
    {...REQUEST,user:{id:CLIENT}},
    {...REQUEST,client:{id:'not-a-uuid',uri:'https://thiepn.dev/library/'}},
    {...REQUEST,redirect_uri:'http://thiepn.dev/library/auth/callback/'},
    {...REQUEST,client:{id:CLIENT,uri:'https://thiepn.dev/library/#fragment'}},
    {...REQUEST,scope:''},
  ])('rejects malformed request %j',(value)=>{
    expect(()=>firstPartyOAuthRequest(value,ID,OWNER)).toThrow('FIRST_PARTY_OAUTH_UNAVAILABLE');
  });
});
