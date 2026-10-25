import type { GETStatusDataResponse } from '../generated/status-payload';
import { config } from './config';

/**
 * A real fetch Response, or the no-token stub: every caller checks
 * `status === 401` first and returns before reading a body, so the stub's
 * json() is unreachable in practice; it still throws if called by mistake.
 */
export type ApiResult = Response | { ok: false; status: 401; json(): Promise<unknown> };

const NO_TOKEN: ApiResult = {
  ok: false,
  status: 401,
  json: () => Promise.reject(new Error('status: fetch attempted on the no-token stub result')),
};

let refreshInFlight: Promise<string | null> | null = null;

/** Single-flight: concurrent callers share one call to the config's refreshToken(). */
function refresh(): Promise<string | null> {
  const refreshToken = config().refreshToken;
  if (!refreshToken) return Promise.resolve(null);
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = Promise.resolve()
    .then(refreshToken)
    .catch(() => null);
  void refreshInFlight.finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/** True when a signed-in attempt is possible: a stored token or a way to mint one. */
export function canSignIn(): boolean {
  const cfg = config();
  return !!cfg.getToken() || !!cfg.refreshToken;
}

/**
 * Token/401/refresh/retry for any gated `<pathPrefix>/*` path, sending the
 * token in the configured header. Shared by fetchStatusData() and series.ts's
 * useSeries(), so the dance exists in one place.
 */
export async function fetchStatusJson(path: string): Promise<ApiResult> {
  const cfg = config();
  const t = cfg.getToken() || (await refresh());
  if (!t) return NO_TOKEN;
  const req = (tok: string) =>
    fetch(`${cfg.pathPrefix}${path}`, {
      headers: { [cfg.authHeader]: tok, Accept: 'application/json' },
      cache: 'no-store',
    });
  let r = await req(t);
  if (r.status === 401) {
    const cur = cfg.getToken();
    const nt = cur && cur !== t ? cur : await refresh();
    if (!nt) return NO_TOKEN;
    r = await req(nt);
  }
  return r;
}

export async function fetchStatusData(): Promise<ApiResult> {
  return fetchStatusJson('/data');
}

export type PublicData = Pick<
  GETStatusDataResponse,
  'reliability' | 'incidents' | 'changes' | 'interruptions' | 'spot_enabled'
>;

export type PublicResult =
  | { ok: true; data: PublicData }
  | { ok: false; reason: 'network-error' }
  | { ok: false; reason: 'not-configured' } // <pathPrefix>/public 404s: the feature is off
  | { ok: false; reason: 'http-error'; status: number };

/**
 * For a signed-out visitor, or one the plugin refuses: try the
 * unauthenticated `<pathPrefix>/public` route so the page shows something
 * instead of a bare sign-in prompt. Returns a classified result; App.tsx owns
 * the single-render invariant (public panels plus gate, or gate alone).
 */
export async function tryPublic(): Promise<PublicResult> {
  let r: Response;
  try {
    r = await fetch(`${config().pathPrefix}/public`, { headers: { Accept: 'application/json' } });
  } catch {
    return { ok: false, reason: 'network-error' };
  }
  if (r.status === 404) return { ok: false, reason: 'not-configured' };
  // A path with no behavior in front of it can fall through to the app
  // origin, which answers with its HTML shell (200, text/html): same meaning
  // as the Lambda's own 404.
  if (!(r.headers.get('content-type') || '').includes('json')) {
    return { ok: false, reason: 'not-configured' };
  }
  if (!r.ok) return { ok: false, reason: 'http-error', status: r.status };
  let data: PublicData;
  try {
    data = (await r.json()) as PublicData;
  } catch {
    return { ok: false, reason: 'http-error', status: r.status };
  }
  return { ok: true, data };
}
