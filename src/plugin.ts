// SPDX-License-Identifier: MPL-2.0
/**
 * Sandbox side of the plugin. Runs inside Penpot's plugin sandbox: no DOM, no
 * canvas — so this file stays a thin proxy. All real work (decode → trace →
 * vector SVG) happens in the panel iframe, which asks the board for PNG pixels
 * through `grab-image` and hands the finished SVG back through `place-svg`.
 */
import type { PluginToUi, UiToPlugin, ShapeInfo } from './messages.ts';

// This panel is preview-led — you're judging a traced image before it lands on
// the board — so it opens wider and taller than a typical form plugin to give
// that preview room. The panel's "Expand" pill then trades the controls away for
// a full-column stage when you want to inspect the result at size.
penpot.ui.open('Lolly Filters', `?theme=${penpot.theme}`, {
  width: 480,
  height: 780,
});

function send(message: PluginToUi): void {
  penpot.ui.sendMessage(message);
}

function summarize(): ShapeInfo[] {
  return penpot.selection.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    width: s.width,
    height: s.height,
  }));
}

function findShape(id: string) {
  return (
    penpot.selection.find((s) => s.id === id) ??
    penpot.currentPage?.getShapeById(id) ??
    null
  );
}

penpot.ui.onMessage<UiToPlugin>(async (msg) => {
  if (msg.type === 'ready') {
    send({ type: 'init', theme: penpot.theme, selection: summarize() });
    return;
  }

  if (msg.type === 'grab-image') {
    const { requestId, shapeId } = msg;
    const shape = findShape(shapeId);
    if (!shape) {
      send({ type: 'error', requestId, message: 'Shape not found — select it again.' });
      return;
    }
    try {
      // A filter samples a grid off the decoded bitmap, so a 1× export of a small
      // shape would starve the trace. `scale` (set by the panel from the tool's
      // render size) oversamples to roughly the working resolution instead.
      const bytes = await shape.export({ type: 'png', scale: msg.scale ?? 2 });
      send({
        type: 'image-data',
        requestId,
        name: shape.name,
        width: shape.width,
        height: shape.height,
        bytes,
      });
    } catch (e) {
      send({ type: 'error', requestId, message: String((e as Error)?.message ?? e) });
    }
    return;
  }

  if (msg.type === 'place-svg') {
    const { requestId, svg, name, sourceShapeId } = msg;
    try {
      // WithImages, not the sync variant: a filter run with the raw camera frame
      // showing through (or any embedded bitmap) carries <image href="data:…">,
      // which the sync call drops.
      const group = await penpot.createShapeFromSvgWithImages(svg);
      if (!group) throw new Error('Penpot rejected the SVG.');
      group.name = name;

      const source = sourceShapeId ? findShape(sourceShapeId) : null;
      if (source) {
        // Beside the source, with a one-gutter gap — never on top of it.
        group.x = source.x + source.width + 24;
        group.y = source.y;
      } else {
        const { center } = penpot.viewport;
        group.x = center.x - group.width / 2;
        group.y = center.y - group.height / 2;
      }
      penpot.selection = [group];
      send({ type: 'placed', requestId, name: group.name });
    } catch (e) {
      send({ type: 'error', requestId, message: String((e as Error)?.message ?? e) });
    }
  }
});

penpot.on('selectionchange', () => {
  send({ type: 'selection', selection: summarize() });
});

penpot.on('themechange', (theme) => {
  send({ type: 'theme', theme: theme as 'light' | 'dark' });
});
