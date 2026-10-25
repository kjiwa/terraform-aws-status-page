import type { Plugin, Rollup } from 'vite';

/**
 * Post-processes the HTML vite-plugin-singlefile inlines. Its generateBundle
 * hook matches singlefile's `enforce: 'post'` and `order: 'post'` and is listed
 * after viteSingleFile(), so it sees the already-inlined document.
 *
 * Inlined JS is already escaped against `</script` by vite-plugin-singlefile;
 * inlined CSS is not, so the `</style` gap is re-checked here.
 */
export function finalizeShell(options: { requiredMarkers?: string[] } = {}): Plugin {
  const requiredMarkers = options.requiredMarkers ?? [];

  return {
    name: 'status:finalize',
    enforce: 'post',
    generateBundle: {
      order: 'post',
      handler(_outputOptions, bundle) {
        for (const fileName of Object.keys(bundle)) {
          if (!/\.html?$/.test(fileName)) continue;
          const asset = bundle[fileName] as Rollup.OutputAsset;
          let html =
            typeof asset.source === 'string'
              ? asset.source
              : Buffer.from(asset.source).toString('utf-8');

          // Drop the <link> attributes singlefile carries onto <style>, and the
          // sourcemap breadcrumb Vite appends after the CSS.
          html = html
            .replace(/<style(\s+rel="stylesheet")?(\s+crossorigin)?(\s*>)/g, '<style$3')
            .replace(/\/\*\$vite\$:\d+\*\/\s*/g, '');

          // jsdom does not run type="module" scripts, and the bundle must run
          // before first paint, so it ships as a plain blocking script.
          html = html.replace(
            /<script type="module"((?:\s+\S+?)*)>/g,
            (_match: string, rest: string) => {
              const cleaned = rest.replace(/\s+crossorigin(=("[^"]*"|'[^']*'))?/g, '');
              return `<script${cleaned}>`;
            },
          );

          for (const block of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
            if (/<\/style/i.test(block[1] ?? '')) {
              throw new Error(
                `finalizeShell: ${fileName} has a literal </style in an inlined style.`,
              );
            }
          }

          for (const marker of requiredMarkers) {
            if (!html.includes(marker)) {
              throw new Error(`finalizeShell: ${fileName} is missing required marker: ${marker}`);
            }
          }

          if (!/<script(?![^>]*\bsrc=)[^>]*>\s*\S[\s\S]*?<\/script>/.test(html)) {
            throw new Error(`finalizeShell: ${fileName} has no non-empty inlined <script>.`);
          }

          asset.source = html;
        }
      },
    },
  };
}
