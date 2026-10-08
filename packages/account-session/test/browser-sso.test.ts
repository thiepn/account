import { describe, expect, it, vi } from 'vitest';
import { createThiepnAccountSession } from './index';
import {
  createThiepnBrowserSso,
  probeThiepnAccount,
  readThiepnAccountProbeMessage,
} from './browser-sso';

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
    await Promise.resolve();
    await Promise.resolve();
    const frame=document.querySelector('iframe')!;
    expect(frame).not.toBeNull();
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
