export type Scheme = 'light' | 'dark';

export const TOKEN_NAMES = [
  'surface',
  'card',
  'on-surface',
  'muted',
  'border',
  'secondary',
  'on-secondary',
  'good',
  'warn',
  'bad',
  'gray',
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-2-tint',
  'chart-track',
] as const;

export type TokenName = (typeof TOKEN_NAMES)[number];

export interface ThemeChoice {
  scheme: Scheme | null;
  primary: string | null;
  tokens?: Partial<Record<TokenName, string>> | null;
}

export interface StatusConfig {
  pathPrefix: string;
  title: string;
  authHeader: string;
  getToken: () => string | null;
  refreshToken: (() => Promise<string | null>) | null;
  signInUrl: string | null;
  disabledPanels: string[];
  theme: () => ThemeChoice;
}

declare global {
  interface Window {
    STATUS_CONFIG?: unknown;
  }
}

export type ConfigResult = { ok: true; config: StatusConfig } | { ok: false; problems: string[] };

const DEFAULT_TITLE = 'Status';

type Raw = Record<string, unknown>;

function checkString(raw: Raw, key: string, problems: string[], required: boolean): void {
  const v = raw[key];
  if (v === undefined || v === null) {
    if (required) problems.push(`${key} is required (a string).`);
  } else if (typeof v !== 'string' || v === '') {
    problems.push(`${key} must be a non-empty string.`);
  }
}

function checkFunction(raw: Raw, key: string, problems: string[]): void {
  const v = raw[key];
  if (v !== undefined && v !== null && typeof v !== 'function') {
    problems.push(`${key} must be a function.`);
  }
}

function validate(raw: Raw): string[] {
  const problems: string[] = [];
  checkString(raw, 'pathPrefix', problems, true);
  if (
    typeof raw.pathPrefix === 'string' &&
    (!raw.pathPrefix.startsWith('/') || raw.pathPrefix.startsWith('//'))
  ) {
    problems.push('pathPrefix must be a same-origin path starting with a single "/".');
  }
  checkString(raw, 'authHeader', problems, true);
  checkString(raw, 'title', problems, false);
  checkString(raw, 'tokenKey', problems, false);
  checkString(raw, 'signInUrl', problems, false);
  checkFunction(raw, 'getToken', problems);
  checkFunction(raw, 'refreshToken', problems);
  checkFunction(raw, 'theme', problems);
  if (typeof raw.getToken !== 'function' && typeof raw.tokenKey !== 'string') {
    problems.push('getToken (a function) or tokenKey (a string) is required.');
  }
  const dp = raw.disabledPanels;
  if (dp !== undefined && (!Array.isArray(dp) || dp.some((n) => typeof n !== 'string'))) {
    problems.push('disabledPanels must be an array of panel names.');
  }
  return problems;
}

function storedToken(key: string): () => string | null {
  return () => localStorage.getItem(key);
}

function normalize(raw: Raw): StatusConfig {
  const tokenKey = raw.tokenKey as string | undefined;
  return {
    pathPrefix: (raw.pathPrefix as string).replace(/\/+$/, ''),
    title: (raw.title as string | undefined) ?? DEFAULT_TITLE,
    authHeader: raw.authHeader as string,
    getToken:
      typeof raw.getToken === 'function'
        ? (raw.getToken as () => string | null)
        : storedToken(tokenKey ?? ''),
    refreshToken:
      typeof raw.refreshToken === 'function'
        ? (raw.refreshToken as () => Promise<string | null>)
        : null,
    signInUrl: (raw.signInUrl as string | undefined) ?? null,
    disabledPanels: (raw.disabledPanels as string[] | undefined) ?? [],
    theme:
      typeof raw.theme === 'function'
        ? (raw.theme as () => ThemeChoice)
        : () => ({ scheme: null, primary: null, tokens: null }),
  };
}

export function readConfig(raw: unknown): ConfigResult {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, problems: ['config.js did not set window.STATUS_CONFIG to an object.'] };
  }
  const problems = validate(raw as Raw);
  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, config: normalize(raw as Raw) };
}

let active: StatusConfig | null = null;

export function setConfig(config: StatusConfig): void {
  active = config;
}

export function config(): StatusConfig {
  if (!active) throw new Error('status config read before boot');
  return active;
}
