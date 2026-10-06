import {describe,expect,it} from 'vitest';
import {
  parseSsoProbeRegistration,
  referrerOrigin,
  ssoProbeClientId,
} from './ssoProbe';

const CLIENT='76e41661-f8a9-4181-b8b9-4084f2e2acbf';

describe('first-party SSO probe boundary',()=>{
  it('accepts only one exact client_id and no fragment',()=>{
    expect(ssoProbeClientId('?client_id='+CLIENT,'')).toBe(CLIENT);
    expect(()=>ssoProbeClientId('?client_id='+CLIENT+'&x=1','')).toThrow('SSO_PROBE_INVALID');
    expect(()=>ssoProbeClientId('?client_id='+CLIENT,'#x')).toThrow('SSO_PROBE_INVALID');
  });

  it('binds probe replies to the exact registered HTTPS origin',()=>{
    expect(parseSsoProbeRegistration({
      clientId:CLIENT,
      appSlug:'library',
      origin:'https://thiepn.dev',
      eligible:true,
    },CLIENT)).toEqual({
      clientId:CLIENT,
      appSlug:'library',
      origin:'https://thiepn.dev',
      eligible:true,
    });
    expect(()=>parseSsoProbeRegistration({
      clientId:CLIENT,
      appSlug:'library',
      origin:'https://thiepn.dev/library',
      eligible:true,
    },CLIENT)).toThrow('SSO_PROBE_INVALID');
    expect(()=>parseSsoProbeRegistration({
      clientId:'11111111-1111-4111-8111-111111111111',
      appSlug:'library',
      origin:'https://thiepn.dev',
      eligible:true,
    },CLIENT)).toThrow('SSO_PROBE_INVALID');
  });

  it('accepts only HTTPS parent referrers',()=>{
    expect(referrerOrigin('https://thiepn.dev/library/')).toBe('https://thiepn.dev');
    expect(()=>referrerOrigin('http://thiepn.dev/library/')).toThrow('SSO_PROBE_INVALID');
    expect(()=>referrerOrigin('')).toThrow('SSO_PROBE_INVALID');
  });
});
