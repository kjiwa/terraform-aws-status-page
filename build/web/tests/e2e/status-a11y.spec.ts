/**
 * Accessibility properties checked in a real browser: axe per theme and
 * width, the 44px touch-target floor, per-scheme theme-color, and the
 * skeleton's busy state.
 */
import AxeBuilder from '@axe-core/playwright';
import { ALL_TOGGLES_ON, THEME_KEY } from '../support/shell.ts';
import { expect, test } from './fixtures.ts';

const SIGNED_IN = { access: 'e2e-access-token' };
const WIDTHS = [393, 1280] as const;
const THEMES = ['light', 'dark'] as const;
const TOUCH_MIN = 44;
// getComputedStyle serialization of the default --sp-surface per scheme.
const SURFACE = { light: 'rgb(255, 255, 255)', dark: 'rgb(20, 20, 20)' } as const;

for (const width of WIDTHS) {
  for (const theme of THEMES) {
    test(`axe finds no violations at ${width}px, ${theme} theme`, async ({ page, startStatus }) => {
      await page.setViewportSize({ width, height: 900 });
      const baseURL = await startStatus({
        server: { toggles: ALL_TOGGLES_ON },
        tokens: SIGNED_IN,
        localStorage: { [THEME_KEY]: JSON.stringify({ scheme: theme }) },
      });
      await page.goto(`${baseURL}/status`);
      await expect(page.locator('#panels .card > h3').first()).toBeVisible();
      const results = await new AxeBuilder({ page }).analyze();
      expect(
        results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
      ).toEqual([]);
    });

    test(`every button and disclosure is at least ${TOUCH_MIN}px at ${width}px, ${theme} theme`, async ({
      page,
      startStatus,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      const baseURL = await startStatus({
        server: { toggles: ALL_TOGGLES_ON },
        tokens: SIGNED_IN,
        localStorage: { [THEME_KEY]: JSON.stringify({ scheme: theme }) },
      });
      await page.goto(`${baseURL}/status`);
      await expect(page.locator('#panels .card > h3').first()).toBeVisible();
      const small = await page.evaluate((min) => {
        const out: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>('button, a.btn, summary')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.height < min || r.width < min) {
            out.push(
              `${el.tagName.toLowerCase()} "${(el.textContent ?? el.ariaLabel ?? '').trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`,
            );
          }
        }
        return out;
      }, TOUCH_MIN);
      expect(small).toEqual([]);
    });
  }
}

test.describe('theme-color', () => {
  const metaContent = (page: import('@playwright/test').Page, scheme: 'light' | 'dark') =>
    page
      .locator(`meta[name="theme-color"][media="(prefers-color-scheme: ${scheme})"]`)
      .getAttribute('content');

  for (const os of THEMES) {
    test(`system theme: each meta carries its own scheme's surface (OS ${os})`, async ({
      page,
      startStatus,
    }) => {
      await page.emulateMedia({ colorScheme: os });
      const baseURL = await startStatus({ server: { toggles: ALL_TOGGLES_ON }, tokens: SIGNED_IN });
      await page.goto(`${baseURL}/status`);
      await expect(page.locator('#panels .card > h3').first()).toBeVisible();
      expect(await metaContent(page, 'light')).toBe(SURFACE.light);
      expect(await metaContent(page, 'dark')).toBe(SURFACE.dark);
    });
  }

  for (const chosen of THEMES) {
    test(`explicit ${chosen} theme sets both metas to its surface, whatever the OS`, async ({
      page,
      startStatus,
    }) => {
      await page.emulateMedia({ colorScheme: chosen === 'dark' ? 'light' : 'dark' });
      const baseURL = await startStatus({
        server: { toggles: ALL_TOGGLES_ON },
        tokens: SIGNED_IN,
        localStorage: { [THEME_KEY]: JSON.stringify({ scheme: chosen }) },
      });
      await page.goto(`${baseURL}/status`);
      await expect(page.locator('#panels .card > h3').first()).toBeVisible();
      expect(await metaContent(page, 'light')).toBe(SURFACE[chosen]);
      expect(await metaContent(page, 'dark')).toBe(SURFACE[chosen]);
    });
  }
});

test('the skeleton is aria-busy while loading and gone once the panels render', async ({
  page,
  startStatus,
}) => {
  const baseURL = await startStatus({ server: { toggles: ALL_TOGGLES_ON }, tokens: SIGNED_IN });
  await page.route('**/status/data', () => new Promise(() => {}));
  await page.goto(`${baseURL}/status`);
  await expect(page.locator('#skeleton')).toHaveAttribute('aria-busy', 'true');

  await page.unroute('**/status/data');
  await page.reload();
  await expect(page.locator('#panels .card > h3').first()).toBeVisible();
  await expect(page.locator('#skeleton')).toHaveCount(0);
});
