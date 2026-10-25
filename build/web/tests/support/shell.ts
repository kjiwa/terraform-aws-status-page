/**
 * The one indirection point in this suite: everywhere else, tests are
 * written against rendered behavior (DOM, ARIA, fetch calls), never against
 * how the shell is delivered. This file reads the real built shell and
 * produces the fixture config.js the harnesses serve next to it.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// resolve(import.meta.dirname, ...) rather than `new URL(relative,
// import.meta.url)`: Vite rewrites that pattern into a dev-server asset URL
// when the path climbs outside the project root.
const STATUS_HTML_PATH = resolve(
  import.meta.dirname,
  '../../../../modules/status/dist/status.html',
);

export const PATH_PREFIX = '/status';
export const AUTH_HEADER = 'X-Test-Token';
export const TOKEN_KEY = 'status_token';
export const REFRESH_KEY = 'status_refresh';
export const THEME_KEY = 'status_theme';
export const REFRESH_PATH = '/auth/refresh';

/**
 * What the fixture deployment includes. The first six gate a payload key
 * (absent, or `app: {}`); public_reliability gates the /public route.
 */
export interface Toggles {
  host_metrics: boolean;
  cost: boolean;
  backups: boolean;
  bedrock: boolean;
  deployment: boolean;
  app: boolean;
  public_reliability: boolean;
}

export const ALL_TOGGLES_ON: Toggles = {
  host_metrics: true,
  cost: true,
  backups: true,
  bedrock: true,
  deployment: true,
  app: true,
  public_reliability: true,
};

export const ALL_TOGGLES_OFF: Toggles = {
  host_metrics: false,
  cost: false,
  backups: false,
  bedrock: false,
  deployment: false,
  app: false,
  public_reliability: false,
};

/** The Toggles keys that gate a payload key. */
export const PAYLOAD_TOGGLE_KEYS = [
  'host_metrics',
  'cost',
  'backups',
  'bedrock',
  'deployment',
  'app',
] as const;

export interface ConfigOptions {
  disabledPanels?: string[];
  /** Keys removed from the config object, to exercise validation. */
  omit?: string[];
  /** Keys assigned over the defaults. */
  set?: Record<string, unknown>;
  /** Replaces the whole script body, to exercise a malformed config.js. */
  raw?: string;
}

/**
 * A real consumer-style config.js: the default getToken (via tokenKey), a
 * refreshToken() that exchanges a stored refresh token at REFRESH_PATH, a
 * theme() that reads THEME_KEY, and a sign-in link.
 */
export function configJs(opts: ConfigOptions = {}): string {
  if (opts.raw !== undefined) return opts.raw;
  const data = {
    pathPrefix: PATH_PREFIX,
    title: 'Fixture status',
    authHeader: AUTH_HEADER,
    tokenKey: TOKEN_KEY,
    signInUrl: '/signin',
    disabledPanels: opts.disabledPanels ?? [],
  };
  return `(function () {
  var c = ${JSON.stringify(data)};
  c.refreshToken = async function () {
    var rt = localStorage.getItem(${JSON.stringify(REFRESH_KEY)});
    if (!rt) return null;
    var r = await fetch(${JSON.stringify(REFRESH_PATH)}, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + rt },
    });
    if (!r.ok) return null;
    var d = await r.json();
    localStorage.setItem(${JSON.stringify(TOKEN_KEY)}, d.access_token);
    return d.access_token;
  };
  c.theme = function () {
    return JSON.parse(localStorage.getItem(${JSON.stringify(THEME_KEY)}) || '{}');
  };
  ${JSON.stringify(opts.omit ?? [])}.forEach(function (k) { delete c[k]; });
  Object.assign(c, ${JSON.stringify(opts.set ?? {})});
  window.STATUS_CONFIG = c;
})();
`;
}

/** The real build output. */
export function shellHtml(): string {
  return readFileSync(STATUS_HTML_PATH, 'utf-8');
}
