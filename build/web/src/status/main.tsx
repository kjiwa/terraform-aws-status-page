/**
 * Status page entry. Injects `<path prefix>/config.js` (a classic script that
 * sets window.STATUS_CONFIG), validates it, applies title and theme, then
 * mounts App. The path prefix is the page's own location.pathname without a
 * trailing slash, so the page works at /status and /status/.
 */
import { options, render } from 'preact';
import { applyTheme, safeTheme } from '../shared/theme';
import { App } from './App';
import { readConfig, setConfig, type StatusConfig } from './config';

// Preact batches a setState-triggered re-render to a microtask by default;
// click handlers and tests expect the DOM to reflect state immediately.
options.debounceRendering = (cb: () => void) => cb();

function loadConfigScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`${src} could not be loaded.`));
    document.head.appendChild(el);
  });
}

function domReady(): Promise<void> {
  if (document.readyState !== 'loading') return Promise.resolve();
  return new Promise((resolve) => document.addEventListener('DOMContentLoaded', () => resolve()));
}

function showConfigError(problems: string[]): void {
  document.getElementById('skeleton')?.remove();
  const el = document.getElementById('config-error');
  if (!el) return;
  render(
    <div>
      <h2>Status page is not configured</h2>
      <ul>
        {problems.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>,
    el,
  );
  el.classList.remove('hidden');
}

function hideDisabledSkeletons(names: string[]): void {
  for (const el of document.querySelectorAll<HTMLElement>('[data-panel]')) {
    if (names.includes(el.dataset.panel ?? '')) el.classList.add('hidden');
  }
}

function applyConfig(cfg: StatusConfig): void {
  const root = document.documentElement;
  applyTheme(root, safeTheme(cfg.theme));
  document.title = cfg.title;
  const heading = document.getElementById('title');
  if (heading) heading.textContent = cfg.title;
  hideDisabledSkeletons(cfg.disabledPanels);
  const surface = getComputedStyle(document.body).backgroundColor;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', surface);
}

async function boot(): Promise<void> {
  const prefix = location.pathname.replace(/\/$/, '');
  try {
    await loadConfigScript(`${prefix}/config.js`);
  } catch (e) {
    await domReady();
    showConfigError([e instanceof Error ? e.message : 'config.js could not be loaded.']);
    return;
  }
  await domReady();
  const result = readConfig(window.STATUS_CONFIG);
  if (!result.ok) {
    showConfigError(result.problems);
    return;
  }
  setConfig(result.config);
  applyConfig(result.config);
  const panelsRoot = document.getElementById('panels');
  if (panelsRoot) render(<App />, panelsRoot);
}

void boot();
