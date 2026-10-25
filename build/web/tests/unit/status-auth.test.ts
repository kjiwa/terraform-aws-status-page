/**
 * The gate/auth state machine is the arm a render snapshot describes
 * worst -- these are targeted DOM/fetch-call assertions instead. Covers:
 * signed-out with and without the public fallback, a 401 that recovers via
 * refresh, a 403, and a bare 500.
 */
import { describe, expect, it } from 'vitest';
import { mountStatus } from '../support/mount.ts';
import { payloadFor, publicPayload } from '../support/payload.ts';
import { ALL_TOGGLES_ON } from '../support/shell.ts';

function gateOf(document: Document): Element {
  const gate = document.getElementById('gate');
  if (!gate) throw new Error('status-auth: #gate missing from the mounted document');
  return gate;
}

describe('status-auth', () => {
  it('signed out, public_reliability on: public panels render above a signin gate', async () => {
    const mounted = mountStatus({
      toggles: ALL_TOGGLES_ON,
      routes: {
        public: [{ status: 200, body: publicPayload() }],
      },
    });
    await mounted.settled();

    expect(mounted.pageErrors).toEqual([]);
    expect(mounted.fetchCalls.map((c) => c.url)).toEqual(['/status/public']);
    const cardTitles = Array.from(
      mounted.document.querySelectorAll('.card > h3'),
      (el) => el.textContent,
    );
    expect(cardTitles).toEqual(['Reliability', 'Incidents', 'Changes']);
    const gate = gateOf(mounted.document);
    expect(gate.classList.contains('hidden')).toBe(false);
    expect(gate.querySelector('h2')?.textContent).toBe('Please sign in');
  });

  it('signed out, /status/public 404s (feature off): a plain signin gate, no panels', async () => {
    const mounted = mountStatus({
      toggles: ALL_TOGGLES_ON,
      routes: {
        public: [{ status: 404, body: { error: 'not found' } }],
      },
    });
    await mounted.settled();

    expect(mounted.pageErrors).toEqual([]);
    expect(mounted.document.querySelectorAll('.card')).toHaveLength(0);
    const gate = gateOf(mounted.document);
    expect(gate.querySelector('h2')?.textContent).toBe('Please sign in');
    expect(gate.querySelector('a.btn')).not.toBeNull();
  });

  it('signed out, /status/public falls through to the app origin (feature off, real edge shape): a plain signin gate, no rejection', async () => {
    const mounted = mountStatus({
      toggles: ALL_TOGGLES_ON,
      routes: {
        // No CloudFront behavior for /status/public when public_reliability
        // is off -- the real edge answers with the app origin's SPA shell,
        // 200 text/html, not a JSON 404. See api.ts's tryPublic().
        public: [{ status: 200, body: '<!doctype html>...', contentType: 'text/html' }],
      },
    });
    await mounted.settled();

    expect(mounted.pageErrors).toEqual([]);
    expect(mounted.document.querySelectorAll('.card')).toHaveLength(0);
    const gate = gateOf(mounted.document);
    expect(gate.querySelector('h2')?.textContent).toBe('Please sign in');
    expect(gate.querySelector('a.btn')).not.toBeNull();
  });

  it('a 401 on /status/data recovers via refresh and retries successfully', async () => {
    const mounted = mountStatus({
      toggles: ALL_TOGGLES_ON,
      tokens: { access: 'stale-access-token', refresh: 'a-refresh-token' },
      routes: {
        data: [
          { status: 401, body: { error: 'unauthorized' } },
          { status: 200, body: payloadFor(ALL_TOGGLES_ON) },
        ],
        refresh: [{ status: 200, body: { access_token: 'fresh-access-token' } }],
      },
    });
    await mounted.settled();

    expect(mounted.pageErrors).toEqual([]);
    expect(mounted.fetchCalls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET /status/data',
      'POST /auth/refresh',
      'GET /status/data',
    ]);
    expect(mounted.window.localStorage.getItem('status_token')).toBe('fresh-access-token');
    const cardTitles = Array.from(
      mounted.document.querySelectorAll('.card > h3'),
      (el) => el.textContent,
    );
    expect(cardTitles).toContain('Reliability');
    expect(gateOf(mounted.document).classList.contains('hidden')).toBe(true);
  });

  it('a 403 falls back to a forbidden gate', async () => {
    const mounted = mountStatus({
      toggles: ALL_TOGGLES_ON,
      tokens: { access: 'member-access-token' },
      routes: {
        data: [{ status: 403, body: { error: 'forbidden' } }],
        public: [{ status: 404, body: { error: 'not found' } }],
      },
    });
    await mounted.settled();

    expect(mounted.pageErrors).toEqual([]);
    const gate = gateOf(mounted.document);
    expect(gate.querySelector('h2')?.textContent).toBe('Insufficient permissions');
    expect(gate.querySelector('p')?.textContent).toContain('not permitted');
    // "forbidden" shows no sign-in link: signing in again would not help.
    expect(gate.querySelector('a.btn')).toBeNull();
  });

  it('a bare 500 shows the generic error gate', async () => {
    const mounted = mountStatus({
      toggles: ALL_TOGGLES_ON,
      tokens: { access: 'test-access-token' },
      routes: {
        data: [{ status: 500, body: { error: 'internal' } }],
      },
    });
    await mounted.settled();

    expect(mounted.pageErrors).toEqual([]);
    const gate = gateOf(mounted.document);
    expect(gate.querySelector('h2')?.textContent).toBe("Couldn't load status");
    expect(gate.querySelector('p')?.textContent).toContain('500');
  });
});
