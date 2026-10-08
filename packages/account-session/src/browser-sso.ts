import type { ThiepnAccountSession, ThiepnIdentity } from './index';

const PROBE_TYPE = 'thiepn:sso-probe:v1';
const DEFAULT_PROBE_TIMEOUT_MS = 2500;
const DEFAULT_COOLDOWN_MS = 30_000;

export type ThiepnBrowserSsoStatus =
  | { readonly status: 'ready'; readonly identity: ThiepnIdentity }
  | { readonly status: 'redirecting' };

export type ThiepnAccountProbe =
  | 'signed-in'
  | 'signed-out'
  | 'disconnected'
  | 'unavailable';

export interface ThiepnBrowserSsoOptions {
  readonly accountOrigin: string;
  /** Default 2500 ms. Blocked third-party storage must not block the app indefinitely. */
  readonly probeTimeoutMs?: number;
  /** Default 30 seconds. Prevent immediate re-probing after an unsuccessful attempt. */
  readonly probeCooldownMs?: number;
  /** Used only to remember deliberate app-local sign-out, not to store tokens. */
  readonly optOutStorage?: Storage;
  /** Optional browser navigation adapter for routers and test harnesses. */
  readonly navigate?: (url: string) => void;
  readonly now?: () => number;
}

function accountOrigin(raw: string): string {
  const value = new URL(raw);
  if (
    value.protocol !== 'https:' ||
    value.username ||
    value.password ||
    value.search ||
    value.hash ||
    value.pathname !== '/' ||
    value.port
  ) throw new TypeError('accountOrigin must be an exact HTTPS origin');
  return value.origin;
}

function uuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

export function readThiepnAccountProbeMessage(
  raw: unknown,
  clientId: string,
): ThiepnAccountProbe | null {
  if (
    !uuid(clientId) ||
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw)
  ) return null;
  const row = raw as Record<string, unknown>;
  if (
    row.type !== PROBE_TYPE ||
    row.clientId !== clientId ||
    typeof row.signedIn !== 'boolean' ||
    typeof row.eligible !== 'boolean'
  ) return null;
  if (!row.signedIn) return 'signed-out';
  return row.eligible ? 'signed-in' : 'disconnected';
}

/** Strictly tokenless: the Account iframe returns only eligibility booleans.
 * Treat missing responses (including anti-tracking/third-party storage policies)
 * as unavailable, never as proof of sign-out. */
export async function probeThiepnAccount(
  accountUrl: string,
  clientId: string,
  timeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
): Promise<ThiepnAccountProbe> {
  const origin = accountOrigin(accountUrl);
  if (!uuid(clientId)) throw new TypeError('clientId must be a UUID');
  if (!Number.isFinite(timeoutMs) || timeoutMs < 100 || timeoutMs > 10_000) {
    throw new TypeError('probeTimeoutMs must be between 100 and 10000');
  }
  if (typeof document === 'undefined' || !document.body ||
      typeof window === 'undefined') return 'unavailable';

  return new Promise(resolve => {
    const frame = document.createElement('iframe');
    frame.hidden = true;
    frame.tabIndex = -1;
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    frame.referrerPolicy = 'origin';
    frame.src = `${origin}/sso/probe?client_id=${encodeURIComponent(clientId)}`;

    let completed = false;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (result: ThiepnAccountProbe) => {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      frame.remove();
      resolve(result);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== frame.contentWindow) return;
      const result = readThiepnAccountProbeMessage(event.data, clientId);
      if (result) finish(result);
    };

    window.addEventListener('message', onMessage);
    timer = setTimeout(() => finish('unavailable'), timeoutMs);
    try {
      document.body.appendChild(frame);
    } catch {
      finish('unavailable');
    }
  });
}

/**
 * Integrate a first-party public client without app-specific SSO glue.
 *
 * Call initialize() once before rendering private account data. It verifies an
 * existing app token, then optionally checks the Account origin and initiates
 * a standards-based OAuth redirect when an eligible Account session exists.
 * A guest-first app can still render its public/guest UI after 'ready'.
 *
 * A deliberately disconnected app is never silently reconnected. Manual
 * connect() remains explicit and Account still enforces that boundary.
 */
export function createThiepnBrowserSso(
  session: ThiepnAccountSession,
  options: ThiepnBrowserSsoOptions,
) {
  const origin = accountOrigin(options.accountOrigin);
  const timeout = options.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
  const cooldown = options.probeCooldownMs ?? DEFAULT_COOLDOWN_MS;
  if (!Number.isFinite(cooldown) || cooldown < 0 || cooldown > 3_600_000) {
    throw new TypeError('probeCooldownMs is invalid');
  }
  if (!uuid(session.clientId)) throw new TypeError('clientId must be a UUID');
  const optOutKey = `thiepn:sso:${session.clientId}:manual-signout`;
  const now = options.now ?? Date.now;
  const navigate = options.navigate ?? ((url: string) => window.location.assign(url));
  let lastProbe = Number.NEGATIVE_INFINITY;
  let initializeFlight: Promise<ThiepnBrowserSsoStatus> | null = null;
  let callbackFlight: Promise<ThiepnIdentity> | null = null;
  let leaving = false;

  const storage = () => {
    try { return options.optOutStorage ?? window.localStorage; }
    catch { return null; }
  };
  const optedOut = () => {
    try { return storage()?.getItem(optOutKey) === '1'; }
    catch { return false; }
  };
  const setOptOut = (value: boolean) => {
    try {
      if (value) storage()?.setItem(optOutKey, '1');
      else storage()?.removeItem(optOutKey);
    } catch {
      // Storage restrictions can prevent persistence. The current instance
      // still tracks manual sign-out to prevent an immediate reconnect.
    }
  };
  let localOptOut = false;

  async function redirect(): Promise<void> {
    if (leaving) return;
    const url = await session.authorizationUrl();
    const parsed = new URL(url);
    if (parsed.origin !== session.issuer ||
        parsed.pathname !== '/auth/v1/oauth/authorize') {
      throw new Error('ACCOUNT_AUTHORIZATION_URL_INVALID');
    }
    leaving = true;
    try { navigate(url); }
    catch (error) { leaving = false; throw error; }
  }

  async function initialize(): Promise<ThiepnBrowserSsoStatus> {
    if (leaving) return { status: 'redirecting' };
    if (initializeFlight) return initializeFlight;

    const run = async (): Promise<ThiepnBrowserSsoStatus> => {
      const identity = await session.verify();
      if (identity.status !== 'signed-out') {
        return { status: 'ready', identity };
      }
      if (
        localOptOut ||
        optedOut() ||
        typeof window === 'undefined' ||
        typeof navigator === 'undefined' ||
        !navigator.onLine ||
        window.location.pathname === new URL(session.redirectUri).pathname ||
        now() - lastProbe < cooldown
      ) return { status: 'ready', identity };

      lastProbe = now();
      const probe = await probeThiepnAccount(origin, session.clientId, timeout);
      if (probe === 'signed-in') {
        await redirect();
        return { status: 'redirecting' };
      }
      return { status: 'ready', identity };
    };
    const promise = run();
    initializeFlight = promise;
    const clear = () => {
      if (initializeFlight === promise) initializeFlight = null;
    };
    void promise.then(clear, clear);
    return promise;
  }

  async function connect(): Promise<void> {
    localOptOut = false;
    setOptOut(false);
    await redirect();
  }

  function signOutLocal(): ThiepnIdentity {
    localOptOut = true;
    setOptOut(true);
    leaving = false;
    return session.signOutLocal();
  }

  function completeCallback(location: Pick<Location, 'href' | 'hash'>): Promise<ThiepnIdentity> {
    if (callbackFlight) return callbackFlight;
    const callback = new URL(location.href);
    const expected = new URL(session.redirectUri);
    if (
      callback.origin !== expected.origin ||
      callback.pathname !== expected.pathname
    ) return Promise.resolve({
      status: 'unavailable',
      code: 'ACCOUNT_CALLBACK_ORIGIN_MISMATCH',
    });
    const pending = session.completeCallback(location).then(identity => {
      if (identity.status === 'signed-in') {
        localOptOut = false;
        setOptOut(false);
      }
      return identity;
    });
    callbackFlight = pending;
    const clear = () => { if (callbackFlight === pending) callbackFlight = null; };
    void pending.then(clear, clear);
    return pending;
  }

  return Object.freeze({
    initialize,
    connect,
    signOutLocal,
    completeCallback,
    verify: session.verify,
    getAccessToken: session.getAccessToken,
    identity: session.identity,
    subscribe: session.subscribe,
    clientId: session.clientId,
  });
}

export type ThiepnBrowserSso = ReturnType<typeof createThiepnBrowserSso>;
