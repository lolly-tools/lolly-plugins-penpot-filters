// SPDX-License-Identifier: MPL-2.0
/**
 * Typed message protocol between the sandboxed plugin (plugin.ts, no DOM) and
 * the panel UI iframe (src/ui/, full DOM + canvas). Everything crossing the
 * boundary is structured-clone friendly — plain objects and Uint8Arrays.
 */

/** What the panel needs to know about one selected shape. */
export interface ShapeInfo {
  id: string;
  name: string;
  type: string;
  width: number;
  height: number;
}

export type Theme = 'light' | 'dark';

export type PluginToUi =
  | { type: 'init'; theme: Theme; selection: ShapeInfo[] }
  | { type: 'selection'; selection: ShapeInfo[] }
  | { type: 'theme'; theme: Theme }
  | {
      type: 'image-data';
      requestId: number;
      name: string;
      width: number;
      height: number;
      /** PNG bytes of the selected shape, as returned by shape.export(). */
      bytes: Uint8Array;
    }
  | { type: 'placed'; requestId: number; name: string }
  | { type: 'error'; requestId: number; message: string };

export type UiToPlugin =
  | { type: 'ready' }
  /** Rasterise a selected shape to PNG so the panel can filter its pixels. */
  | { type: 'grab-image'; requestId: number; shapeId: string; scale?: number }
  /** Drop a finished filter render onto the board next to its source. */
  | {
      type: 'place-svg';
      requestId: number;
      svg: string;
      name: string;
      /** Shape the render came from — the new shape is placed beside it. */
      sourceShapeId: string | null;
    };
