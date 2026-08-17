import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
// Sibling checkout of github.com/lolly-tools/lolly. The plugin bundles the Lolly
// engine (tool loader + runtime + template hydration) straight from that working
// tree — there is no published package for it yet. CI sets LOLLY_DIR; locally it
// defaults to the sibling directory.
const LOLLY = process.env.LOLLY_DIR ? resolve(process.env.LOLLY_DIR) : resolve(HERE, '../lolly');

/**
 * The community tool this plugin exposes, loaded verbatim from the lolly tree.
 * Upstream consolidated the seven `filter-*` tools into one `filter` tool
 * (community/filter), whose `effect` input selects halftone / scanline /
 * posterize / voronoi (vector) or the raster effects. The panel drives the four
 * vector effects; the tool is still copied unmodified.
 */
export const TOOL_IDS = ['filter'] as const;

/** Files the engine's loader may ask for. styles.css is optional per tool. */
const TOOL_FILES = ['tool.json', 'template.html', 'hooks.js', 'styles.css'];

/**
 * The tools are DATA, not code we compile: the engine fetches `<id>/tool.json`,
 * `template.html` and `hooks.js` as text at mount time. So they're copied into
 * dist/tools/ verbatim on build, and served from memory in dev — never touched
 * by the bundler. Keeping them unmodified is the whole point: a filter behaves
 * identically here and on lolly.tools.
 */
function lollyTools(): Plugin {
  const srcDir = (id: string) => resolve(LOLLY, 'community', id);

  return {
    name: 'lolly-tools',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = /^\/tools\/([a-z0-9-]+)\/([a-z0-9.-]+)$/i.exec((req.url ?? '').split('?')[0]);
        if (!m) return next();
        const file = join(srcDir(m[1]), m[2]);
        if (!existsSync(file)) {
          res.statusCode = 404;
          return res.end('not found');
        }
        res.setHeader('content-type', m[2].endsWith('.json') ? 'application/json' : 'text/plain');
        res.end(readFileSync(file));
      });
    },
    generateBundle() {
      for (const id of TOOL_IDS) {
        if (!existsSync(srcDir(id))) {
          this.error(
            `Tool "${id}" not found at ${srcDir(id)} — set LOLLY_DIR to a lolly checkout.`,
          );
        }
        for (const f of TOOL_FILES) {
          const from = join(srcDir(id), f);
          if (!existsSync(from)) continue; // styles.css is optional
          this.emitFile({
            type: 'asset',
            fileName: `tools/${id}/${f}`,
            source: readFileSync(from),
          });
        }
      }
    },
  };
}

export default defineConfig({
  // Relative asset URLs so the same dist/ works at a domain root AND under a
  // GitHub Pages project subpath (/repo-name/).
  base: './',
  plugins: [lollyTools()],
  resolve: {
    alias: {
      '@lolly-tools/core/host-v1': resolve(LOLLY, 'packages/core/src/host-v1.ts'),
      '@lolly-tools/core': resolve(LOLLY, 'packages/core/src/index.ts'),
      '@engine': resolve(LOLLY, 'engine/src'),
      // The engine's own runtime deps. It lives inside the lolly tree, so its bare
      // imports would resolve against lolly's node_modules — which CI doesn't
      // install. Pin both to THIS repo's node_modules instead.
      'ajv/dist/2020.js': resolve(HERE, 'node_modules/ajv/dist/2020.js'),
      handlebars: resolve(HERE, 'node_modules/handlebars/dist/cjs/handlebars.js'),
    },
  },
  server: {
    cors: true,
    fs: { allow: [HERE, LOLLY] },
  },
  preview: {
    cors: true,
  },
  build: {
    target: 'es2022',
  },
});
