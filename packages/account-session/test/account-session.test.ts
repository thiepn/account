import { describe, expect, it } from 'vitest';
import {
  createThiepnAccountSession,
  readThiepnOAuthCallback,
} from '../src/index';

class MemoryStorage implements Storage {
  #data = new Map<string, string>();

  get length() {
    return this.#data.size;
  }

  clear() {
    this.#data.clear();
  }

  getItem(key: string) {
    return this.#data.get(key) ?? null;
  }

  key(index: number) {
    return [...this.#data.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.#data.delete(key);
  }

  setItem(key: string, value: string) {
    this.#data.set(key, value);
  }
}

describe('THIEPN account session contract', () => {
  it('accepts only exact code+state OAuth callbacks', () => {
    const state = 'a'.repeat(43);
    expect(
      readThiepnOAuthCallback({
        href: `https://thiepn.dev/library/auth/callback/?code=one-use-code&state=${state}`,
        hash: '',
      } as Location),
    ).toEqual({ code: 'one-use-code', state });

    expect(
      readThiepnOAuthCallback({
        href: `https://thiepn.dev/library/auth/callback/?code=one-use-code&state=${state}&extra=x`,
        hash: '',
      } as Location),
    ).toBeNull();

    expect(
      readThiepnOAuthCallback({
        href: `https://thiepn.dev/library/auth/callback/?code=one-use-code&state=${state}`,
        hash: '#token=x',
      } as Location),
    ).toBeNull();
  });

  it('builds a public-client authorization request with PKCE and no Google provider', async () => {
    const localStorage = new MemoryStorage();
    const sessionStorage = new MemoryStorage();
    const session = createThiepnAccountSession({
      issuer: 'https://example.supabase.co',
      publishableKey: 'sb_publishable_abcdefghijklmnopqrstuvwxyz',
      clientId: '123e4567-e89b-42d3-a456-426614174000',
      redirectUri: 'https://thiepn.dev/library/auth/callback/',
      storageKey: 'thiepn:library-sso:v1',
      authPolicy: 'guest-first',
      localStorage,
      sessionStorage,
    });

    const url = new URL(await session.authorizationUrl());
    expect(url.origin).toBe('https://example.supabase.co');
    expect(url.pathname).toBe('/auth/v1/oauth/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe(
      '123e4567-e89b-42d3-a456-426614174000',
    );
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://thiepn.dev/library/auth/callback/',
    );
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('provider')).toBeNull();
    expect(url.searchParams.get('prompt')).toBeNull();
    expect(url.searchParams.get('scope')).toBe(
      'email offline_access openid profile',
    );
  });

  it('rejects non-UUID OAuth clients and callback URLs with ambient query state', () => {
    expect(() =>
      createThiepnAccountSession({
        issuer: 'https://example.supabase.co',
        publishableKey: 'sb_publishable_abcdefghijklmnopqrstuvwxyz',
        clientId: 'library',
        redirectUri: 'https://thiepn.dev/library/auth/callback/',
        storageKey: 'thiepn:library-sso:v1',
        authPolicy: 'guest-first',
        localStorage: new MemoryStorage(),
        sessionStorage: new MemoryStorage(),
      }),
    ).toThrow('clientId must be a UUID');

    expect(() =>
      createThiepnAccountSession({
        issuer: 'https://example.supabase.co',
        publishableKey: 'sb_publishable_abcdefghijklmnopqrstuvwxyz',
        clientId: '123e4567-e89b-42d3-a456-426614174000',
        redirectUri: 'https://thiepn.dev/library/auth/callback/?x=1',
        storageKey: 'thiepn:library-sso:v1',
        authPolicy: 'guest-first',
        localStorage: new MemoryStorage(),
        sessionStorage: new MemoryStorage(),
      }),
    ).toThrow('redirectUri');
  });

  it('refreshes an expired app token without touching the Account browser session', async () => {
    const localStorage = new MemoryStorage();
    const sessionStorage = new MemoryStorage();
    const now = 2_000_000;
    localStorage.setItem(
      'thiepn:test-sso:v1:tokens',
      JSON.stringify({
        accessToken: 'expired-access-token-value-123456',
        refreshToken: 'refresh-token-value-123456789',
        expiresAt: now - 1,
        scope: 'openid email',
      }),
    );

    const requests: Array<{ url: string; body: string }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith('/auth/v1/oauth/token')) {
        requests.push({ url, body: String(init?.body ?? '') });
        return new Response(
          JSON.stringify({
            access_token: 'new-access-token-value-123456789',
            refresh_token: 'new-refresh-token-value-123456789',
            expires_in: 3600,
            token_type: 'bearer',
            scope: 'openid email',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/auth/v1/user')) {
        return new Response(
          JSON.stringify({
            id: '123e4567-e89b-42d3-a456-426614174000',
            email: 'member@example.test',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(null, { status: 404 });
    };

    const session = createThiepnAccountSession({
      issuer: 'https://example.supabase.co',
      publishableKey: 'sb_publishable_abcdefghijklmnopqrstuvwxyz',
      clientId: '123e4567-e89b-42d3-a456-426614174000',
      redirectUri: 'https://thiepn.dev/test/auth/callback/',
      storageKey: 'thiepn:test-sso:v1',
      authPolicy: 'required',
      fetch: fetchImpl,
      now: () => now,
      localStorage,
      sessionStorage,
    });

    await expect(session.verify()).resolves.toEqual({
      status: 'signed-in',
      id: '123e4567-e89b-42d3-a456-426614174000',
      email: 'member@example.test',
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.body).toContain('grant_type=refresh_token');
    expect(requests[0]?.body).toContain(
      'client_id=123e4567-e89b-42d3-a456-426614174000',
    );
  });
});

describe('Account refresh reliability',()=>{
  const storageKey='thiepn:test-resilience:v1';
  const initial={
    accessToken:'expired-access-token-123456789',
    refreshToken:'expired-refresh-token-123456789',
    expiresAt:1_000_000,
    scope:'openid email',
  };
  const response=(access_token='fresh-access-token-123456789')=>new Response(JSON.stringify({
    access_token,
    refresh_token:'fresh-refresh-token-123456789',
    expires_in:3600,
    token_type:'bearer',
    scope:'openid email',
  }),{status:200,headers:{'Content-Type':'application/json'}});
  const identity=()=>new Response(JSON.stringify({id:'123e4567-e89b-42d3-a456-426614174000',email:'person@example.test'}),{status:200,headers:{'Content-Type':'application/json'}});
  const make=(storage:MemoryStorage,transport:typeof fetch)=>{
    storage.setItem(`${storageKey}:tokens`,JSON.stringify(initial));
    return createThiepnAccountSession({
      issuer:'https://example.supabase.co',
      publishableKey:'sb_publishable_abcdefghijklmnopqrstuvwxyz',
      clientId:'123e4567-e89b-42d3-a456-426614174000',
      redirectUri:'https://languages.thiepn.dev/auth/callback/',
      storageKey,
      authPolicy:'guest-first',
      localStorage:storage,
      sessionStorage:new MemoryStorage(),
      now:()=>2_000_000,
      fetch:transport,
    });
  };

  it('does not forget a signed-in user during a temporary token-service outage',async()=>{
    const local=new MemoryStorage();
    let fail=true;
    const session=make(local,async input=>{
      const url=String(input);
      if(url.endsWith('/oauth/token')){
        if(fail)return new Response(JSON.stringify({error:'server_error'}),{status:503});
        return response();
      }
      return identity();
    });
    await expect(session.verify()).resolves.toEqual({
      status:'unavailable',code:'ACCOUNT_REFRESH_UNAVAILABLE',
    });
    expect(JSON.parse(local.getItem(`${storageKey}:tokens`)??'{}').refreshToken).toBe(initial.refreshToken);
    fail=false;
    await expect(session.verify()).resolves.toEqual({
      status:'signed-in',id:'123e4567-e89b-42d3-a456-426614174000',email:'person@example.test',
    });
  });

  it('coalesces simultaneous refresh requests from the same app tab',async()=>{
    const local=new MemoryStorage();
    let refreshes=0;
    const session=make(local,async input=>{
      if(String(input).endsWith('/oauth/token')){
        ++refreshes;
        await new Promise(resolve=>setTimeout(resolve,10));
        return response();
      }
      return identity();
    });
    const result=await Promise.all([session.verify(),session.verify(),session.getAccessToken()]);
    expect(result[0]).toMatchObject({status:'signed-in'});
    expect(result[1]).toMatchObject({status:'signed-in'});
    expect(result[2]).toBe('fresh-access-token-123456789');
    expect(refreshes).toBe(1);
  });

  it('never recreates an app session after sign-out while refresh was pending',async()=>{
    const local=new MemoryStorage();
    let completeRefresh:(value:Response)=>void=()=>{};
    let notifyStarted:()=>void=()=>{};
    const started=new Promise<void>(resolve=>{notifyStarted=resolve;});
    const session=make(local,async input=>{
      if(String(input).endsWith('/oauth/token')){
        notifyStarted();
        return await new Promise<Response>(resolve=>{completeRefresh=resolve;});
      }
      return identity();
    });
    const pending=session.verify();
    await started;
    session.signOutLocal();
    completeRefresh(response());
    await expect(pending).resolves.toMatchObject({status:'signed-out'});
    expect(local.getItem(`${storageKey}:tokens`)).toBeNull();
  });

  it('clears credentials after a permanently revoked OAuth refresh grant',async()=>{
    const local=new MemoryStorage();
    const session=make(local,async()=>new Response(JSON.stringify({error:'invalid_grant'}),{status:400}));
    await expect(session.verify()).resolves.toMatchObject({status:'signed-out'});
    expect(local.getItem(`${storageKey}:tokens`)).toBeNull();
  });

  it('does not publish a stale identity after a session is signed out during verification',async()=>{
    const local=new MemoryStorage();
    const access='valid-access-token-123456789';
    local.setItem(`${storageKey}:tokens`,JSON.stringify({...initial,accessToken:access,expiresAt:3_000_000}));
    let releaseUser:(response:Response)=>void=()=>{};
    let notifyStarted:()=>void=()=>{};
    const started=new Promise<void>(resolve=>{notifyStarted=resolve;});
    const session=createThiepnAccountSession({
      issuer:'https://example.supabase.co',
      publishableKey:'sb_publishable_abcdefghijklmnopqrstuvwxyz',
      clientId:'123e4567-e89b-42d3-a456-426614174000',
      redirectUri:'https://languages.thiepn.dev/auth/callback/',
      storageKey,
      authPolicy:'guest-first',
      localStorage:local,
      sessionStorage:new MemoryStorage(),
      now:()=>2_000_000,
      fetch:async()=>{
        notifyStarted();
        return await new Promise<Response>(resolve=>{releaseUser=resolve;});
      },
    });
    const verifying=session.verify();
    await started;
    session.signOutLocal();
    releaseUser(identity());
    await expect(verifying).resolves.toMatchObject({status:'signed-out'});
  });
});
