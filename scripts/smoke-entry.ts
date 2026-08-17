// SPDX-License-Identifier: MPL-2.0
/**
 * Headless smoke test for the tool-mounting path: load the one `filter` tool
 * through the engine's own loader, then for each vector effect the panel exposes,
 * mount a runtime against the panel's host bridge and assert the template
 * hydrates to an SVG.
 *
 * What this CAN'T cover: the trace itself. Every effect decodes its source on a
 * real <canvas> (via host.raster, which reports unavailable in this Node shell),
 * and then degrades to a placeholder card rather than throwing — so a pass here
 * means "loader, manifest validation, hook compilation, host bridge and
 * hydration all agree", not "the output looks right". The latter needs the panel
 * in a browser.
 *
 * Bundled by scripts/smoke.sh (esbuild) and run under Node.
 */
import { loadTool } from '@engine/loader.ts';
import { createRuntime } from '@engine/runtime.ts';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createHost, PENPOT_COLORS } from '../src/ui/host.ts';
import { FILTERS, TOOL_ID, SOURCE_INPUT } from '../src/ui/filters.ts';

// From the runner, not import.meta.url — the bundle lands in node_modules/.cache,
// nowhere near dist/.
const TOOLS = resolve(process.env.TOOLS_DIR ?? 'dist/tools');

const readToolFile = (path: string): Promise<string> =>
  Promise.resolve(readFileSync(resolve(TOOLS, path), 'utf8'));

let failures = 0;

// One tool now backs every tab, so load it once and check each effect against it.
const tool = await loadTool(TOOL_ID, readToolFile);
const declared = new Set((tool.manifest.inputs ?? []).map((i) => i.id));

for (const filter of FILTERS) {
  try {
    // Every id the panel promises to render must actually exist in the manifest
    // — a renamed input would otherwise vanish from the panel silently.
    const missing = [
      SOURCE_INPUT,
      ...filter.groups.flatMap((g) => g.inputs),
    ].filter((id) => !declared.has(id));
    if (missing.length) throw new Error(`unknown input ids: ${missing.join(', ')}`);

    const host = createHost(PENPOT_COLORS.light);
    const runtime = await createRuntime(tool, host, { effect: filter.effect });
    const hydrated = runtime.getHydrated();

    if (!hydrated.includes('<svg')) throw new Error('hydrated output carries no <svg>');
    if (!runtime.hasFrameHook) throw new Error('no onFrame hook — "Use camera" would be dead');

    console.log(`ok   ${filter.effect.padEnd(10)} ${hydrated.length} chars`);
  } catch (e) {
    failures += 1;
    console.error(`FAIL ${filter.effect}: ${String((e as Error)?.message ?? e)}`);
  }
}

if (failures) {
  console.error(`\n${failures} effect(s) failed to mount.`);
  process.exit(1);
}
console.log(`\nAll ${FILTERS.length} vector effects mount cleanly (${declared.size} inputs on ${TOOL_ID}).`);
