import { afterEach, describe, expect, it } from 'vitest';
import { applyTheme, onColor, safeTheme } from '../../src/shared/theme.ts';

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('style');
});

describe('onColor', () => {
  it('picks white on dark colors and near-black on light ones', () => {
    expect(onColor('#000000')).toBe('#ffffff');
    expect(onColor('#ffffff')).toBe('rgba(0,0,0,0.87)');
  });

  it('expands 3-digit hex', () => {
    expect(onColor('#fff')).toBe('rgba(0,0,0,0.87)');
    expect(onColor('#000')).toBe('#ffffff');
  });

  it('falls back to white for a malformed color', () => {
    expect(onColor('rebeccapurple')).toBe('#ffffff');
    expect(onColor('#12')).toBe('#ffffff');
  });
});

describe('safeTheme', () => {
  it('passes a valid choice through', () => {
    expect(safeTheme(() => ({ scheme: 'dark', primary: '#336699', tokens: null }))).toEqual({
      scheme: 'dark',
      primary: '#336699',
      tokens: null,
    });
  });

  it('nulls an unknown scheme and a malformed primary', () => {
    expect(
      safeTheme(() => ({
        scheme: 'sepia' as unknown as 'light',
        primary: 'not-a-color',
        tokens: null,
      })),
    ).toEqual({ scheme: null, primary: null, tokens: null });
  });

  it('falls back to the defaults when theme() throws', () => {
    expect(
      safeTheme(() => {
        throw new Error('storage unavailable');
      }),
    ).toEqual({ scheme: null, primary: null, tokens: null });
  });

  it('keeps allowlisted tokens with valid colors and drops the rest', () => {
    const tokens = {
      surface: '#303e4a',
      card: 'rgb(40 51 61)',
      muted: 'not-a-color',
      'no-such-token': '#ffffff',
      bad: 42,
    } as unknown as Record<string, string>;
    expect(safeTheme(() => ({ scheme: null, primary: null, tokens })).tokens).toEqual({
      surface: '#303e4a',
      card: 'rgb(40 51 61)',
    });
  });

  it('nulls tokens that are not an object or hold no valid entry', () => {
    const bad = (tokens: unknown) =>
      safeTheme(() => ({ scheme: null, primary: null, tokens }) as never).tokens;
    expect(bad('#fff')).toBeNull();
    expect(bad({})).toBeNull();
    expect(bad({ surface: 'nope' })).toBeNull();
  });
});

describe('applyTheme', () => {
  it('sets data-theme and the accent pair for an explicit choice', () => {
    applyTheme(document.documentElement, { scheme: 'light', primary: '#000000', tokens: null });
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.style.getPropertyValue('--sp-secondary')).toBe('#000000');
    expect(document.documentElement.style.getPropertyValue('--sp-on-secondary')).toBe('#ffffff');
  });

  it('leaves the document untouched for a null choice', () => {
    applyTheme(document.documentElement, { scheme: null, primary: null, tokens: null });
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(document.documentElement.getAttribute('style')).toBeNull();
  });

  it('sets each token as --sp-<name>, after primary so tokens.secondary wins', () => {
    applyTheme(document.documentElement, {
      scheme: 'dark',
      primary: '#000000',
      tokens: { surface: '#303e4a', secondary: '#77abd9' },
    });
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--sp-surface')).toBe('#303e4a');
    expect(style.getPropertyValue('--sp-secondary')).toBe('#77abd9');
    expect(style.getPropertyValue('--sp-on-secondary')).toBe('#ffffff');
  });
});
