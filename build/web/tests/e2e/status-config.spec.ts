/**
 * The runtime-config surface: config.js validation, disabledPanels, app
 * Facts sections, the signed-out public view, and the token refresh retry.
 */
import { appSectionsPayload } from '../support/payload.ts';
import { expectedCards, expectedSections } from '../support/expected.ts';
import { ALL_TOGGLES_ON, AUTH_HEADER, THEME_KEY } from '../support/shell.ts';
import { expect, test } from './fixtures.ts';

const SIGNED_IN = { access: 'e2e-access-token' };

const HIDEABLE_CARDS: [string, string][] = [
  ['reliability', 'Reliability'],
  ['incidents', 'Incidents'],
  ['changes', 'Changes'],
  ['deployment', 'Deployment'],
  ['backups', 'Backups'],
  ['storage', 'Storage'],
  ['host', 'Host'],
  ['bedrock', 'Bedrock'],
  ['cost', 'Cost (month to date)'],
];

test.describe('config validation', () => {
  const cases: [
    string,
    { omit?: string[]; set?: Record<string, unknown>; raw?: string },
    string,
  ][] = [
    ['a missing authHeader', { omit: ['authHeader'] }, 'authHeader is required'],
    ['a missing pathPrefix', { omit: ['pathPrefix'] }, 'pathPrefix is required'],
    ['neither getToken nor tokenKey', { omit: ['tokenKey'] }, 'getToken (a function) or tokenKey'],
    ['a non-array disabledPanels', { set: { disabledPanels: 'cost' } }, 'disabledPanels must be'],
    ['a config.js that sets nothing', { raw: '' }, 'did not set window.STATUS_CONFIG'],
  ];

  for (const [name, config, message] of cases) {
    test(`${name} shows an on-page error and no panels`, async ({ page, startStatus }) => {
      const baseURL = await startStatus({
        server: { toggles: ALL_TOGGLES_ON, config },
        tokens: SIGNED_IN,
      });
      await page.goto(`${baseURL}/status`);

      const error = page.locator('#config-error');
      await expect(error).toBeVisible();
      await expect(error.locator('h2')).toHaveText('Status page is not configured');
      await expect(error).toContainText(message);
      await expect(page.locator('.sk')).toHaveCount(0);
      await expect(page.locator('.card')).toHaveCount(0);
    });
  }

  test('a config.js that fails to load shows an on-page error', async ({ page, startStatus }) => {
    const baseURL = await startStatus({ server: { toggles: ALL_TOGGLES_ON } });
    await page.route('**/status/config.js', (route) => route.fulfill({ status: 404 }));
    await page.goto(`${baseURL}/status`);
    await expect(page.locator('#config-error')).toContainText('config.js could not be loaded');
  });
});

test('the page works at a trailing slash and shows the configured title', async ({
  page,
  startStatus,
}) => {
  const baseURL = await startStatus({
    server: { toggles: ALL_TOGGLES_ON },
    tokens: SIGNED_IN,
  });
  await page.goto(`${baseURL}/status/`);
  await expect(page.locator('h1')).toHaveText('Fixture status');
  await expect(page).toHaveTitle('Fixture status');
  await expect(page.locator('#panels .card > h3').first()).toHaveText('Reliability');
});

test.describe('disabledPanels', () => {
  for (const [name, title] of HIDEABLE_CARDS) {
    test(`${name} hides its card`, async ({ page, startStatus }) => {
      const baseURL = await startStatus({
        server: { toggles: ALL_TOGGLES_ON, config: { disabledPanels: [name] } },
        tokens: SIGNED_IN,
      });
      await page.goto(`${baseURL}/status`);
      await expect(page.locator('#panels .card > h3').first()).toBeVisible();

      const cards = await page.locator('#panels .card > h3').allTextContents();
      expect(cards).toEqual(expectedCards(ALL_TOGGLES_ON, [name]));
      expect(cards).not.toContain(title);
      const sections = await page.locator('#panels .section-head').allTextContents();
      expect(sections).toEqual(expectedSections(ALL_TOGGLES_ON, [name]));
    });
  }

  test('host_metrics drops the charts but keeps the Host and Storage cards', async ({
    page,
    startStatus,
  }) => {
    const baseURL = await startStatus({
      server: { toggles: ALL_TOGGLES_ON, config: { disabledPanels: ['host_metrics'] } },
      tokens: SIGNED_IN,
    });
    await page.goto(`${baseURL}/status`);
    await expect(page.locator('.card', { hasText: 'Host' }).locator('.subgrid')).toHaveCount(1);
    await expect(page.locator('.card', { hasText: 'Host' }).locator('svg')).toHaveCount(0);
  });

  test('image hides the machine image block and an app section hides by its key', async ({
    page,
    startStatus,
  }) => {
    const baseURL = await startStatus({
      server: { toggles: ALL_TOGGLES_ON, config: { disabledPanels: ['image', 'release'] } },
      tokens: SIGNED_IN,
    });
    await page.goto(`${baseURL}/status`);
    await expect(page.locator('#panels .card > h3').first()).toBeVisible();
    await expect(page.locator('h4', { hasText: 'Machine image' })).toHaveCount(0);
    await expect(page.locator('.card > h3', { hasText: 'Release' })).toHaveCount(0);
    await expect(page.locator('.section-head', { hasText: 'Application' })).toHaveCount(0);
  });

  test('interruptions hides the Spot subsection', async ({ page, startStatus }) => {
    const baseURL = await startStatus({
      server: { toggles: ALL_TOGGLES_ON, config: { disabledPanels: ['interruptions'] } },
      tokens: SIGNED_IN,
    });
    await page.goto(`${baseURL}/status`);
    await expect(page.locator('#panels .card > h3', { hasText: 'Incidents' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Spot reclaims' })).toHaveCount(0);
  });
});

test.describe('facts panel', () => {
  test('renders each app section after the core panels, in payload order', async ({
    page,
    startStatus,
  }) => {
    const baseURL = await startStatus({
      server: {
        toggles: ALL_TOGGLES_ON,
        dataOverride: { status: 200, body: appSectionsPayload() },
      },
      tokens: SIGNED_IN,
    });
    await page.goto(`${baseURL}/status`);
    await expect(page.locator('#panels .card > h3').first()).toBeVisible();

    const cards = await page.locator('#panels .card > h3').allTextContents();
    expect(cards.slice(-4)).toEqual(['Cost (month to date)', 'Release', 'Limits', 'Broken']);
    const sections = await page.locator('#panels .section-head').allTextContents();
    expect(sections.at(-1)).toBe('Application');

    const release = page.locator('.card', { hasText: 'Release' });
    await expect(release.locator('dt').first()).toHaveText('Version');
    await expect(release.locator('dd').first()).toContainText('1.0.0');
    await expect(release.locator('dd .caption').first()).toHaveText(
      'Application release running on the host.',
    );
  });

  test('formats numbers, shows a dash for null, and wraps long values', async ({
    page,
    startStatus,
  }) => {
    const baseURL = await startStatus({
      server: {
        toggles: ALL_TOGGLES_ON,
        dataOverride: { status: 200, body: appSectionsPayload() },
      },
      tokens: SIGNED_IN,
    });
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(`${baseURL}/status`);
    const limits = page.locator('.card', { hasText: 'Limits' });
    await expect(limits.locator('dd').nth(0)).toContainText('1,234,567');
    await expect(limits.locator('dd').nth(1)).toHaveText('—');
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  });

  test('a PanelError section shows the error treatment under its titled key', async ({
    page,
    startStatus,
  }) => {
    const baseURL = await startStatus({
      server: {
        toggles: ALL_TOGGLES_ON,
        dataOverride: { status: 200, body: appSectionsPayload() },
      },
      tokens: SIGNED_IN,
    });
    await page.goto(`${baseURL}/status`);
    const broken = page.locator('.card', { hasText: 'Broken' });
    await expect(broken.locator('.err')).toHaveText('plugin section timed out');
    await expect(page.locator('.card', { hasText: 'Limits' }).locator('dl.kv')).toHaveCount(1);
  });

  test('no app sections: no Application heading', async ({ page, startStatus }) => {
    const baseURL = await startStatus({
      server: { toggles: { ...ALL_TOGGLES_ON, app: false } },
      tokens: SIGNED_IN,
    });
    await page.goto(`${baseURL}/status`);
    await expect(page.locator('#panels .card > h3').first()).toBeVisible();
    await expect(page.locator('.section-head', { hasText: 'Application' })).toHaveCount(0);
  });
});

test.describe('theme tokens', () => {
  test('valid tokens restyle the page and invalid ones are ignored', async ({
    page,
    startStatus,
  }) => {
    const tokens = { surface: '#303e4a', card: '#28333d', bad: 'not-a-color', bogus: '#ffffff' };
    const baseURL = await startStatus({
      server: { toggles: ALL_TOGGLES_ON },
      tokens: SIGNED_IN,
      localStorage: { [THEME_KEY]: JSON.stringify({ scheme: 'dark', tokens }) },
    });
    await page.goto(`${baseURL}/status`);
    await expect(page.locator('#panels .card > h3').first()).toBeVisible();

    const style = await page.evaluate(() => {
      const s = document.documentElement.style;
      return {
        surface: s.getPropertyValue('--sp-surface'),
        card: s.getPropertyValue('--sp-card'),
        bad: s.getPropertyValue('--sp-bad'),
        bogus: s.getPropertyValue('--sp-bogus'),
        cardBackground: getComputedStyle(document.querySelector('.card')!).backgroundColor,
      };
    });
    expect(style).toEqual({
      surface: '#303e4a',
      card: '#28333d',
      bad: '',
      bogus: '',
      cardBackground: 'rgb(40, 51, 61)',
    });
  });
});

test.describe('signed out', () => {
  test('shows the public view and a sign-in link to the configured URL', async ({
    page,
    startStatus,
  }) => {
    const baseURL = await startStatus({ server: { toggles: ALL_TOGGLES_ON } });
    await page.goto(`${baseURL}/status`);

    await expect(page.locator('#panels .card > h3')).toHaveText([
      'Reliability',
      'Incidents',
      'Changes',
    ]);
    await expect(page.locator('#who')).toHaveText('Public reliability snapshot');
    const gate = page.locator('#gate');
    await expect(gate.locator('h2')).toHaveText('Please sign in');
    await expect(gate.locator('a.btn')).toHaveAttribute('href', '/signin');
  });

  test('without a signInUrl the gate has no link', async ({ page, startStatus }) => {
    const baseURL = await startStatus({
      server: { toggles: ALL_TOGGLES_ON, config: { omit: ['signInUrl'] } },
    });
    await page.goto(`${baseURL}/status`);
    await expect(page.locator('#gate h2')).toHaveText('Please sign in');
    await expect(page.locator('#gate a.btn')).toHaveCount(0);
  });

  test('public_reliability off: a plain sign-in gate and no panels', async ({
    page,
    startStatus,
  }) => {
    const baseURL = await startStatus({
      server: { toggles: { ...ALL_TOGGLES_ON, public_reliability: false } },
    });
    await page.goto(`${baseURL}/status`);
    await expect(page.locator('#gate h2')).toHaveText('Please sign in');
    await expect(page.locator('.card')).toHaveCount(0);
  });

  test('disabledPanels also applies to the public view', async ({ page, startStatus }) => {
    const baseURL = await startStatus({
      server: { toggles: ALL_TOGGLES_ON, config: { disabledPanels: ['changes'] } },
    });
    await page.goto(`${baseURL}/status`);
    await expect(page.locator('#panels .card > h3')).toHaveText(['Reliability', 'Incidents']);
  });
});

test.describe('token refresh', () => {
  test('a 401 refreshes once and retries with the new token in the configured header', async ({
    page,
    startStatus,
  }) => {
    const baseURL = await startStatus({
      server: {
        toggles: ALL_TOGGLES_ON,
        firstDataOverride: { status: 401, body: { error: 'unauthorized' } },
      },
      tokens: { access: 'stale-token', refresh: 'a-refresh-token' },
    });
    const seen: (string | undefined)[] = [];
    page.on('request', (req) => {
      if (new URL(req.url()).pathname === '/status/data')
        seen.push(req.headers()[AUTH_HEADER.toLowerCase()]);
    });
    await page.goto(`${baseURL}/status`);

    await expect(page.locator('#panels .card > h3').first()).toHaveText('Reliability');
    expect(seen).toEqual(['stale-token', 'refreshed-access-token']);
    await expect(page.locator('#gate')).toBeHidden();
  });

  test('a 401 whose refresh fails falls back to the public view', async ({ page, startStatus }) => {
    const baseURL = await startStatus({
      server: {
        toggles: ALL_TOGGLES_ON,
        dataOverride: { status: 401, body: { error: 'unauthorized' } },
        refreshOverride: { status: 401, body: { error: 'no' } },
      },
      tokens: { access: 'stale-token', refresh: 'bad-refresh-token' },
    });
    await page.goto(`${baseURL}/status`);
    await expect(page.locator('#gate h2')).toHaveText('Please sign in');
    await expect(page.locator('#panels .card > h3')).toHaveText([
      'Reliability',
      'Incidents',
      'Changes',
    ]);
  });
});
