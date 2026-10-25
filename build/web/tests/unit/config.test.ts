import { describe, expect, it } from 'vitest';
import { readConfig } from '../../src/status/config.ts';

const valid = { pathPrefix: '/status', authHeader: 'X-Token', tokenKey: 'token' };

describe('readConfig pathPrefix', () => {
  it('accepts a same-origin path and strips trailing slashes', () => {
    const result = readConfig({ ...valid, pathPrefix: '/status/' });
    expect(result.ok && result.config.pathPrefix).toBe('/status');
  });

  it.each(['status', '//other.example/status', 'https://other.example/status'])(
    'rejects %s',
    (pathPrefix) => {
      const result = readConfig({ ...valid, pathPrefix });
      expect(result.ok).toBe(false);
    },
  );
});
