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
    expect(safeTheme(() => ({ scheme: 'dark', primary: '#336699' }))).toEqual({
      scheme: 'dark',
      primary: '#336699',
    });
  });

  it('nulls an unknown scheme and a malformed primary', () => {
    expect(
      safeTheme(() => ({ scheme: 'sepia' as unknown as 'light', primary: 'not-a-color' })),
    ).toEqual({ scheme: null, primary: null });
  });

  it('falls back to the defaults when theme() throws', () => {
    expect(
      safeTheme(() => {
        throw new Error('storage unavailable');
      }),
    ).toEqual({ scheme: null, primary: null });
  });
});

describe('applyTheme', () => {
  it('sets data-theme and the accent pair for an explicit choice', () => {
    applyTheme(document.documentElement, { scheme: 'light', primary: '#000000' });
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.style.getPropertyValue('--sp-secondary')).toBe('#000000');
    expect(document.documentElement.style.getPropertyValue('--sp-on-secondary')).toBe('#ffffff');
  });

  it('leaves the document untouched for a null choice', () => {
    applyTheme(document.documentElement, { scheme: null, primary: null });
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(document.documentElement.getAttribute('style')).toBeNull();
  });
});
