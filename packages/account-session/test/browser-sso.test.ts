import { describe, expect, it, vi } from 'vitest';
import { createThiepnAccountSession, type ThiepnAccountSession, type ThiepnIdentity } from '../src/index';
import {
  createThiepnBrowserSso,
  probeThiepnAccount,
  readThiepnAccountProbeMessage,
} from '../src/browser-sso';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

const CLIENT_ID = 'c4522235-beb3-4f48-94fb-e274e92b7c84';
const ACCOUNT = 'https://account.thiepn.dev';

function session() {
  return createThiepnAccountSession({
    issuer: 'https://example.supabase.co',
    publishableKey: 'sb_publishable_abcdefghijklmnopqrstuvwxyz',
    clientId: CLIENT_ID,
    redirectUri: 'https://languages.thiepn.dev/auth/callback/',
    storageKey: 'thiepn:languages-platform:v1',
    authPolicy: 'guest-first',
    localStorage: new MemoryStorage(),
    sessionStorage: new MemoryStorage(),
  });
}

function sendProbe(frame: HTMLIFrameElement, payload: unknown, origin = ACCOUNT) {
  window.dispatchEvent(new MessageEvent('message', {
    origin, source: frame.contentWindow, data: payload,
  }));
}
const valid = {type: 'thiepn:sso-probe:v1', clientId: CLIENT_ID, signedIn: true, eligible: true};

describe('first-party Account browser bootstrap', () => {
  it('only recognizes an exact first-party probe schema and client', () => {
    expect(readThiepnAccountProbeMessage(valid, CLIENT_ID)).toBe('signed-in');
    expect(readThiepnAccountProbeMessage({...valid,signedIn:false},CLIENT_ID)).toBe('signed-out');
    expect(readThiepnAccountProbeMessage({...valid,eligible:false},CLIENT_ID)).toBe('disconnected');
    expect(readThiepnAccountProbeMessage({...valid,clientId:'76e41661-f8a9-4181-b8b9-4084f2e2acbf'},CLIENT_ID)).toBeNull();
    expect(readThiepnAccountProbeMessage({...valid,eligible:'true'},CLIENT_ID)).toBeNull();
    expect(readThiepnAccountProbeMessage({...valid,type:'attack'},CLIENT_ID)).toBeNull();
  });

  it('requires a canonical Account HTTPS origin and valid public OAuth client', async () => {
    for(const bad of [
      'http://account.thiepn.dev',
      'https://account.thiepn.dev/extra',
      'https://account.thiepn.dev.evil.test',
      'https://user@account.thiepn.dev',
      'https://account.thiepn.dev:444',
    ]) {
      await expect(probeThiepnAccount(bad,CLIENT_ID)).rejects.toThrow();
      expect(() => createThiepnBrowserSso(session(),{accountOrigin:bad})).toThrow();
    }
    await expect(probeThiepnAccount(ACCOUNT,'invalid')).rejects.toThrow('clientId');
  });

  it('returns only to the registered app origin and ignores forged messages', async () => {
    const pending = probeThiepnAccount(ACCOUNT, CLIENT_ID, 500);
    const frame = document.querySelector('iframe')!;
    expect(frame.src).toBe(`${ACCOUNT}/sso/probe?client_id=${CLIENT_ID}`);
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');

    let completed = false;
    void pending.then(() => {completed = true;});
    sendProbe(frame,valid,'https://evil.test');
    sendProbe(frame,{...valid,clientId:'76e41661-f8a9-4181-b8b9-4084f2e2acbf'});
    await Promise.resolve();
    expect(completed).toBe(false);

    sendProbe(frame,valid);
    await expect(pending).resolves.toBe('signed-in');
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('performs silent SSO without Google when a verified Account session is eligible', async () => {
    const navigate=vi.fn();
    const sso=createThiepnBrowserSso(session(),{
      accountOrigin:ACCOUNT,
      optOutStorage:new MemoryStorage(),
      navigate,
    });
    const request=sso.initialize();
    const duplicate=sso.initialize();
    expect(duplicate).toBe(request);
    await vi.waitFor(() => expect(document.querySelector('iframe')).not.toBeNull());
    const frame=document.querySelector('iframe')!;
    sendProbe(frame,valid);
    await expect(request).resolves.toEqual({status:'redirecting'});
    expect(navigate).toHaveBeenCalledTimes(1);
    const target=new URL(navigate.mock.calls[0]![0] as string);
    expect(target.origin).toBe('https://example.supabase.co');
    expect(target.pathname).toBe('/auth/v1/oauth/authorize');
    expect(target.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(target.searchParams.get('provider')).toBeNull();
    expect(target.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('does not silently reconnect after deliberate local logout; explicit login still works', async () => {
    const navigate=vi.fn();
    const storage=new MemoryStorage();
    const sso=createThiepnBrowserSso(session(),{accountOrigin:ACCOUNT,optOutStorage:storage,navigate});
    expect(sso.signOutLocal()).toEqual({status:'signed-out'});
    expect(storage.getItem(`thiepn:sso:${CLIENT_ID}:manual-signout`)).toBe('1');
    await expect(sso.initialize()).resolves.toEqual({status:'ready',identity:{status:'signed-out'}});
    expect(document.querySelector('iframe')).toBeNull();
    await sso.connect();
    expect(storage.getItem(`thiepn:sso:${CLIENT_ID}:manual-signout`)).toBeNull();
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('never exposes private identity when the probe is unavailable', async () => {
    const navigate=vi.fn();
    const sso=createThiepnBrowserSso(session(),{
      accountOrigin:ACCOUNT,probeTimeoutMs:100,optOutStorage:new MemoryStorage(),navigate,
    });
    await expect(sso.initialize()).resolves.toEqual({status:'ready',identity:{status:'signed-out'}});
    expect(navigate).not.toHaveBeenCalled();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('rejects foreign callback pages before consuming app PKCE state', async () => {
    const sso=createThiepnBrowserSso(session(),{accountOrigin:ACCOUNT});
    await expect(sso.completeCallback({
      href:'https://attacker.test/auth/callback/?code=one&state=two',hash:'',
    })).resolves.toEqual({status:'unavailable',code:'ACCOUNT_CALLBACK_ORIGIN_MISMATCH'});
  });
});

describe('Account SDK silent-SSO cancellation and PKCE single-flight',()=>{
  const authorization = 'https://example.supabase.co/auth/v1/oauth/authorize?response_type=code';
  function fakeSession(overrides: Partial<ThiepnAccountSession>={}): ThiepnAccountSession{
    return {
      clientId:CLIENT_ID,
      issuer:'https://example.supabase.co',
      redirectUri:'https://languages.thiepn.dev/auth/callback/',
      authPolicy:'guest-first',
      verify:vi.fn(async()=>({status:'signed-out'} as ThiepnIdentity)),
      authorizationUrl:vi.fn(async()=>authorization),
      signOutLocal:vi.fn(()=>({status:'signed-out'} as ThiepnIdentity)),
      completeCallback:vi.fn(async()=>({status:'signed-out'} as ThiepnIdentity)),
      getAccessToken:vi.fn(async()=>null),
      identity:vi.fn(()=>({status:'signed-out'} as ThiepnIdentity)),
      subscribe:vi.fn(()=>()=>{}),
      ...overrides,
    } as ThiepnAccountSession;
  }

  it('does not redirect after user sign-out while a silent Account probe is pending',async()=>{
    const navigate=vi.fn();
    const storage=new MemoryStorage();
    const sso=createThiepnBrowserSso(session(),{accountOrigin:ACCOUNT,optOutStorage:storage,navigate});
    const pending=sso.initialize();
    await vi.waitFor(()=>expect(document.querySelector('iframe')).not.toBeNull());
    const frame=document.querySelector('iframe')!;
    expect(sso.signOutLocal()).toEqual({status:'signed-out'});
    sendProbe(frame,valid);
    await expect(pending).resolves.toEqual({status:'ready',identity:{status:'signed-out'}});
    expect(navigate).not.toHaveBeenCalled();
    expect(storage.getItem(`thiepn:sso:${CLIENT_ID}:manual-signout`)).toBe('1');
  });

  it('does not expose a stale signed-in identity after a deliberate sign-out during verification',async()=>{
    let finish:(identity:ThiepnIdentity)=>void=()=>{};
    const auth=fakeSession({
      verify:vi.fn(()=>new Promise<ThiepnIdentity>(resolve=>{finish=resolve;})),
    });
    const navigate=vi.fn();
    const sso=createThiepnBrowserSso(auth,{accountOrigin:ACCOUNT,navigate,optOutStorage:new MemoryStorage()});
    const pending=sso.initialize();
    sso.signOutLocal();
    finish({status:'signed-in',id:CLIENT_ID,email:null});
    await expect(pending).resolves.toEqual({status:'ready',identity:{status:'signed-out'}});
    expect(navigate).not.toHaveBeenCalled();
  });

  it('uses exactly one PKCE authorization request for two simultaneous explicit connects',async()=>{
    let finish:(url:string)=>void=()=>{};
    const authorizationUrl=vi.fn(()=>new Promise<string>(resolve=>{finish=resolve;}));
    const auth=fakeSession({authorizationUrl});
    const navigate=vi.fn();
    const sso=createThiepnBrowserSso(auth,{accountOrigin:ACCOUNT,navigate,optOutStorage:new MemoryStorage()});
    const a=sso.connect(),b=sso.connect();
    expect(a).toBe(b);
    expect(authorizationUrl).toHaveBeenCalledTimes(1);
    finish(authorization);
    await Promise.all([a,b]);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(authorization);
  });

  it('serializes a new connect behind a PKCE request cancelled by sign-out',async()=>{
    let finish:(url:string)=>void=()=>{};
    const authorizationUrl=vi.fn()
      .mockImplementationOnce(()=>new Promise<string>(resolve=>{finish=resolve;}))
      .mockResolvedValue(authorization);
    const navigate=vi.fn();
    const sso=createThiepnBrowserSso(fakeSession({authorizationUrl}),{
      accountOrigin:ACCOUNT,navigate,optOutStorage:new MemoryStorage(),
    });
    const abandoned=sso.connect();
    sso.signOutLocal();
    const resumed=sso.connect();
    expect(authorizationUrl).toHaveBeenCalledTimes(1);
    finish(authorization);
    await abandoned;
    await resumed;
    expect(authorizationUrl).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});
