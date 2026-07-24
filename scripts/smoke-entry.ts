// SPDX-License-Identifier: MPL-2.0
/**
 * Headless smoke test for the tool-mounting path: for each filter, load it
 * through the engine's own loader, mount a runtime against the panel's host
 * bridge, and assert the template hydrates to an SVG.
 *
 * What this CAN'T cover: the trace itself. Every filter decodes its source on a
 * real <canvas>, and each one deliberately degrades to a placeholder card in a
 * headless shell rather than throwing — so a pass here means "loader, manifest
 * validation, hook compilation, host bridge and hydration all agree", not "the
 * output looks right". The latter needs the panel in a browser.
 *
 * Bundled by scripts/smoke.sh (esbuild) and run under Node.
 */
import { loadTool } from '@engine/loader.ts';
import { createRuntime } from '@engine/runtime.ts';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createHost, PENPOT_COLORS } from '../src/ui/host.ts';
import { FILTERS } from '../src/ui/filters.ts';

// From the runner, not import.meta.url — the bundle lands in node_modules/.cache,
// nowhere near dist/.
const TOOLS = resolve(process.env.TOOLS_DIR ?? 'dist/tools');

const readToolFile = (path: string): Promise<string> =>
  Promise.resolve(readFileSync(resolve(TOOLS, path), 'utf8'));

let failures = 0;

for (const filter of FILTERS) {
  try {
    const tool = await loadTool(filter.id, readToolFile);

    // Every id the panel promises to render must actually exist in the manifest
    // — a renamed input would otherwise vanish from the panel silently.
    const declared = new Set((tool.manifest.inputs ?? []).map((i) => i.id));
    const missing = [
      filter.source,
      ...filter.groups.flatMap((g) => g.inputs),
    ].filter((id) => !declared.has(id));
    if (missing.length) throw new Error(`unknown input ids: ${missing.join(', ')}`);

    const host = createHost(PENPOT_COLORS.light);
    const runtime = await createRuntime(tool, host, {});
    const hydrated = runtime.getHydrated();

    if (!hydrated.includes('<svg')) throw new Error('hydrated output carries no <svg>');
    if (!runtime.hasFrameHook) throw new Error('no onFrame hook — "Use camera" would be dead');

    console.log(`ok   ${filter.id.padEnd(18)} ${hydrated.length} chars, ${declared.size} inputs`);
  } catch (e) {
    failures += 1;
    console.error(`FAIL ${filter.id}: ${String((e as Error)?.message ?? e)}`);
  }
}

if (failures) {
  console.error(`\n${failures} filter(s) failed to mount.`);
  process.exit(1);
}
console.log(`\nAll ${FILTERS.length} filters mount cleanly.`);
