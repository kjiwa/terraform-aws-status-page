/**
 * What the panels say about scope and identity: captions that name what a
 * number measures, plain-language enum names, identifiers behind a
 * disclosure, and the machine image's age and pending-replacement note.
 */
import { describe, expect, it } from 'vitest';
import type { GETStatusDataResponse } from '../../src/generated/status-payload.d.ts';
import { mountStatus } from '../support/mount.ts';
import { payloadFor } from '../support/payload.ts';
import { ALL_TOGGLES_ON } from '../support/shell.ts';

async function cardsOf(data: GETStatusDataResponse): Promise<(title: string) => Element> {
  const mounted = mountStatus({
    toggles: ALL_TOGGLES_ON,
    tokens: { access: 'test-access-token' },
    routes: { data: [{ status: 200, body: data }] },
  });
  await mounted.settled();
  expect(mounted.pageErrors).toEqual([]);
  return (title) => {
    const card = [...mounted.document.querySelectorAll('#panels .card')].find(
      (c) => c.querySelector('h3')?.textContent === title,
    );
    if (!card) throw new Error(`no ${title} card`);
    return card;
  };
}

const text = (el: Element) => el.textContent ?? '';

describe('captions', () => {
  it('Reliability names the median recovery window and its sample', async () => {
    const card = (await cardsOf(payloadFor(ALL_TOGGLES_ON)))('Reliability');
    expect(text(card)).toContain('Median recovery, last 30 days');
    expect(text(card)).toMatch(
      /Median outage duration across \d+ outages? that started in the last 30 days/,
    );
  });

  it('Reliability omits the median when no episode falls in the window', async () => {
    const data = payloadFor(ALL_TOGGLES_ON);
    data.incidents = [];
    const card = (await cardsOf(data))('Reliability');
    expect(text(card)).not.toContain('Median recovery');
  });

  it('Host says what CPU and memory average over', async () => {
    const card = (await cardsOf(payloadFor(ALL_TOGGLES_ON)))('Host');
    expect(text(card)).toContain("CPU is the average across the group's instances");
    expect(text(card)).toContain('memory is the average the instances report');
  });

  it('Cost says it is account-wide', async () => {
    const card = (await cardsOf(payloadFor(ALL_TOGGLES_ON)))('Cost (month to date)');
    expect(text(card)).toContain('Account-wide, month to date through yesterday (UTC)');
  });

  it('Changes names the SiteUp downtime measurement and its retention scope', async () => {
    const card = (await cardsOf(payloadFor(ALL_TOGGLES_ON)))('Changes');
    expect(text(card)).toContain(
      'Downtime is SiteUp loss during each change (90 s slack on either side), measured at 1-minute resolution for 15 days and 5-minute for 63 days; older changes show a dash.',
    );
  });

  it('Incidents explains that only alarm-length outages appear there', async () => {
    const card = (await cardsOf(payloadFor(ALL_TOGGLES_ON)))('Incidents');
    expect(text(card)).toContain(
      'Outages long enough to raise the site-down alarm; shorter dips show on the Reliability strip and in Changes.',
    );
  });
});

describe('plain-language names and identifiers', () => {
  it('Host shows the lifecycle in words and keeps ids in a closed disclosure', async () => {
    const card = (await cardsOf(payloadFor(ALL_TOGGLES_ON)))('Host');
    expect(text(card)).toContain('Spot (discounted, can be reclaimed)');
    const ids = card.querySelector('details');
    expect(ids).not.toBeNull();
    expect(ids?.hasAttribute('open')).toBe(false);
    expect(text(ids as Element)).toContain('i-04b3f86acd63292d94');
    const outside = text(card).replace(text(ids as Element), '');
    expect(outside).not.toMatch(/\bi-[0-9a-f]{8,}/);
    expect(outside).not.toContain('Lifecycle spot');
  });

  it('Storage shows the volume state in words and keeps ids in a closed disclosure', async () => {
    const card = (await cardsOf(payloadFor(ALL_TOGGLES_ON)))('Storage');
    expect(text(card)).toContain('In use (attached)');
    const ids = card.querySelector('details');
    expect(ids?.hasAttribute('open')).toBe(false);
    const outside = text(card).replace(text(ids as Element), '');
    expect(outside).not.toMatch(/\bvol-[0-9a-f]{8,}/);
  });
});

describe('machine image', () => {
  it('shows its age and that a newer image is adopted at the next replacement', async () => {
    const card = (await cardsOf(payloadFor(ALL_TOGGLES_ON)))('Deployment');
    expect(text(card)).toContain('9 days since built');
    expect(text(card)).toContain('A newer image is adopted at the next replacement.');
  });

  it('says nothing about a newer image when none is pending or it is unknown', async () => {
    for (const pending of [false, null]) {
      const data = payloadFor(ALL_TOGGLES_ON);
      const img = data.image && !('error' in data.image) ? data.image.images[0] : undefined;
      if (!img || 'error' in img) throw new Error('fixture lacks an image');
      img.newer_image_pending = pending;
      const card = (await cardsOf(data))('Deployment');
      expect(text(card)).not.toContain('newer image');
    }
  });
});
