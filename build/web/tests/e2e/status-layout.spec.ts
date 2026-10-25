/**
 * The layout must hold at every viewport and theme with each config toggle on
 * and off: no horizontal overflow, whatever the disabledPanels, app sections,
 * or deployment panel. Set STATUS_SHOTS_DIR to also write a full-page PNG per
 * combination for review.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { appSectionsPayload, payloadFor } from '../support/payload.ts';
import { ALL_TOGGLES_ON, THEME_KEY, type Toggles } from '../support/shell.ts';
import { expect, test } from './fixtures.ts';

const VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 393, height: 852 },
  { width: 768, height: 1024 },
  { width: 1280, height: 900 },
] as const;
const SCHEMES = ['light', 'dark'] as const;

const CORE_PANELS = [
  'reliability',
  'incidents',
  'changes',
  'interruptions',
  'host',
  'image',
  'storage',
  'deployment',
  'backups',
  'cost',
  'host_metrics',
  'bedrock',
] as const;

interface Variant {
  name: string;
  toggles: Toggles;
  disabledPanels: string[];
  apps: boolean;
}

const VARIANTS: Variant[] = [
  { name: 'baseline', toggles: ALL_TOGGLES_ON, disabledPanels: [], apps: false },
  { name: 'app-sections', toggles: ALL_TOGGLES_ON, disabledPanels: [], apps: true },
  { name: 'no-app', toggles: { ...ALL_TOGGLES_ON, app: false }, disabledPanels: [], apps: false },
  {
    name: 'no-deployment',
    toggles: { ...ALL_TOGGLES_ON, deployment: false },
    disabledPanels: [],
    apps: false,
  },
  ...CORE_PANELS.map((panel) => ({
    name: `disabled-${panel}`,
    toggles: ALL_TOGGLES_ON,
    disabledPanels: [panel],
    apps: false,
  })),
];

const SHOTS_DIR = process.env.STATUS_SHOTS_DIR;
if (SHOTS_DIR) mkdirSync(SHOTS_DIR, { recursive: true });

for (const variant of VARIANTS) {
  for (const viewport of VIEWPORTS) {
    for (const scheme of SCHEMES) {
      const label = `${variant.name} at ${viewport.width}px, ${scheme}`;
      test(`no horizontal overflow: ${label}`, async ({ page, startStatus }) => {
        await page.setViewportSize(viewport);
        const baseURL = await startStatus({
          server: {
            toggles: variant.toggles,
            config: { disabledPanels: variant.disabledPanels },
            dataOverride: {
              status: 200,
              body: variant.apps ? appSectionsPayload() : payloadFor(variant.toggles),
            },
          },
          tokens: { access: 'e2e-access-token' },
          localStorage: { [THEME_KEY]: JSON.stringify({ scheme }) },
        });
        await page.goto(`${baseURL}/status`);
        await expect(page.locator('#panels .card > h3').first()).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);

        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);

        if (SHOTS_DIR) {
          await page.screenshot({
            path: join(SHOTS_DIR, `${variant.name}-${viewport.width}-${scheme}.png`),
            fullPage: true,
          });
        }
      });
    }
  }
}

for (const viewport of VIEWPORTS) {
  for (const scheme of SCHEMES) {
    test(`no horizontal overflow: signed-out at ${viewport.width}px, ${scheme}`, async ({
      page,
      startStatus,
    }) => {
      await page.setViewportSize(viewport);
      const baseURL = await startStatus({
        server: { toggles: ALL_TOGGLES_ON },
        localStorage: { [THEME_KEY]: JSON.stringify({ scheme }) },
      });
      await page.goto(`${baseURL}/status`);
      await expect(page.locator('#gate h2')).toHaveText('Please sign in');

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);

      if (SHOTS_DIR) {
        await page.screenshot({
          path: join(SHOTS_DIR, `signed-out-${viewport.width}-${scheme}.png`),
          fullPage: true,
        });
      }
    });
  }
}
