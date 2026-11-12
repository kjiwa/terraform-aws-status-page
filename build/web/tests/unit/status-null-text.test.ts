import { describe, expect, it } from 'vitest';
import { mountStatus } from '../support/mount.ts';
import { payloadFor } from '../support/payload.ts';
import { ALL_TOGGLES_ON } from '../support/shell.ts';

const LEAKED = /\b(null|undefined|NaN)\b/;

function leakedText(doc: Document): string[] {
  const found: string[] = [];
  for (const el of doc.querySelectorAll('body, body *')) {
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
    for (const attr of ['title', 'aria-label', 'aria-valuetext']) {
      const value = el.getAttribute(attr);
      if (value && LEAKED.test(value)) found.push(`${attr}: ${value}`);
    }
    for (const node of el.childNodes) {
      if (node.nodeType === 3 && node.textContent && LEAKED.test(node.textContent)) {
        found.push(`text: ${node.textContent}`);
      }
    }
  }
  return found;
}

describe('rendered text never leaks a missing value', () => {
  it('shows no null, undefined or NaN on a strip whose partial cells lack expected_samples', async () => {
    const payload = payloadFor(ALL_TOGGLES_ON);
    if ('error' in payload.reliability) throw new Error('fixture reliability is an error');
    for (const range of Object.values(payload.reliability.ranges)) {
      for (const cell of range?.cells ?? []) {
        if (cell.samples) {
          cell.partial = true;
          cell.expected_samples = null;
        }
      }
    }

    const mounted = mountStatus({
      toggles: ALL_TOGGLES_ON,
      tokens: { access: 'test-access-token' },
      routes: { data: [{ status: 200, body: payload }] },
    });
    await mounted.settled();
    expect(mounted.pageErrors).toEqual([]);

    const strip = mounted.document.querySelector('[role="slider"]');
    if (!strip) throw new Error('status-null-text: no reliability strip');
    const count = Number(strip.getAttribute('aria-valuemax')) + 1;
    const KeyboardEvent = (mounted.window as unknown as { KeyboardEvent: typeof KeyboardEvent })
      .KeyboardEvent;
    const readouts: string[] = [];
    strip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    for (let i = 0; i < count; i++) {
      readouts.push(strip.getAttribute('aria-valuetext') ?? '');
      readouts.push(strip.closest('.card')?.querySelector('.strip-key')?.textContent ?? '');
      strip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    }

    expect(readouts.some((t) => t.includes('in progress'))).toBe(true);
    expect(readouts.filter((t) => LEAKED.test(t))).toEqual([]);
    expect(leakedText(mounted.document)).toEqual([]);
  });
});
