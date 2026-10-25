import type { ThemeChoice } from '../status/config';

/**
 * Applies a config theme() result to the document. A null scheme leaves
 * status.css's prefers-color-scheme rules in charge; a null primary leaves
 * the stylesheet's accent. Approximate by design: the primary is used
 * directly as the accent rather than expanded into a tonal scheme.
 */

/** White vs near-black text over a solid color, by luminance. */
export function onColor(hex: string): string {
  const parsed = parseHex(hex);
  if (!parsed) return '#ffffff';
  const [r, g, b] = parsed;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.6 ? 'rgba(0,0,0,0.87)' : '#ffffff';
}

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let c = m[1] ?? '';
  if (c.length === 3) c = [...c].map((ch) => ch + ch).join('');
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}

/** theme() is consumer code: a throw or a malformed result falls back to the defaults. */
export function safeTheme(theme: () => ThemeChoice): ThemeChoice {
  try {
    const t = theme();
    return {
      scheme: t.scheme === 'light' || t.scheme === 'dark' ? t.scheme : null,
      primary: typeof t.primary === 'string' && parseHex(t.primary) ? t.primary : null,
    };
  } catch {
    return { scheme: null, primary: null };
  }
}

export function applyTheme(root: HTMLElement, choice: ThemeChoice): void {
  if (choice.scheme) root.setAttribute('data-theme', choice.scheme);
  if (choice.primary) {
    root.style.setProperty('--sp-secondary', choice.primary);
    root.style.setProperty('--sp-on-secondary', onColor(choice.primary));
  }
}
