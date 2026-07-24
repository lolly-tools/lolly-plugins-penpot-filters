// SPDX-License-Identifier: MPL-2.0
/**
 * Which Lolly filters the panel exposes, and which of each tool's inputs it
 * shows.
 *
 * The tools are loaded verbatim — a filter must behave identically here and on
 * lolly.tools, so nothing is patched. But every filter also carries a block of
 * lolly.tools brand-overlay inputs (logo watermark, lower-third name card,
 * headshot) that exist for social-video exports and make no sense dropped onto
 * a Penpot board. Rather than edit the manifests, the panel renders only the
 * ids listed here; the rest keep their manifest defaults, which are all "off".
 *
 * `source` names each tool's image input — they disagree (`photo` vs `image`),
 * and the panel has to know which one to feed.
 */

export interface FilterGroup {
  label: string;
  /** Input ids, in the order the panel should show them. */
  inputs: string[];
  /** Collapsed until the user opens it. */
  collapsed?: boolean;
}

export interface FilterDef {
  id: string;
  /** Short label for the tab strip — the manifest name is "Filter: Halftone". */
  label: string;
  /** The manifest input that takes the source image. */
  source: string;
  groups: FilterGroup[];
  /** Manifest defaults the panel overrides on mount. Reserved for defaults that
   *  are right on lolly.tools and wrong here — see filter-voronoi. */
  defaults?: Record<string, string | number | boolean>;
}

/**
 * The HSL/blend colour treatment block every filter carries — same ids, same
 * semantics, same order. Voronoi is the one exception: it has no `brightness`
 * (its cells take their colour from the source pixel directly, so there is no
 * pre-trace luminance stage to lift), hence the parameter rather than a shared
 * constant.
 */
function treatment({ brightness = true } = {}): FilterGroup {
  return {
    label: 'Colour treatment',
    collapsed: true,
    inputs: [
      ...(brightness ? ['brightness'] : []),
      'contrast', 'hue', 'saturation', 'lightness',
      'treatmentColor', 'blendMode', 'treatmentIntensity',
    ],
  };
}

/** Tab order, and — via the first entry — the filter the panel opens on.
 *  Halftone leads: it's the fastest to trace, the most forgiving of a low-
 *  contrast source, and the one whose output reads instantly as "this worked". */
export const FILTERS: FilterDef[] = [
  {
    id: 'filter-halftone',
    label: 'Halftone',
    source: 'image',
    groups: [
      {
        label: 'Dots',
        inputs: ['gridSize', 'dotScale', 'shape', 'invert', 'fit'],
      },
      {
        label: 'Colour',
        inputs: ['colorSource', 'colorLevels', 'fgColor', 'bgColor'],
      },
      {
        label: 'Tone',
        collapsed: true,
        inputs: ['gamma', 'smoothing', 'dither'],
      },
      treatment(),
    ],
  },
  {
    id: 'filter-posterize',
    label: 'Posterize',
    source: 'photo',
    groups: [
      {
        label: 'Separations',
        inputs: ['steps', 'threshold', 'thresholdLevel', 'invert', 'resample', 'colors'],
      },
      {
        label: 'Trace',
        inputs: ['quality', 'smoothing', 'transparentBg'],
      },
      treatment(),
    ],
  },
  {
    id: 'filter-scanline',
    label: 'Scanline',
    source: 'image',
    groups: [
      {
        label: 'Lines',
        inputs: ['lineSize', 'gapSize', 'separatePixels', 'everyLine', 'fit'],
      },
      {
        label: 'Ramp',
        inputs: ['highlight', 'light', 'mid', 'shade', 'shadow', 'background'],
      },
      treatment(),
    ],
  },
  {
    id: 'filter-voronoi',
    label: 'Voronoi',
    source: 'image',
    groups: [
      {
        label: 'Cells',
        inputs: ['cells', 'jitter', 'relax', 'seed'],
      },
      {
        label: 'Edges',
        inputs: ['edgeWidth', 'edgeColor', 'transparentBg'],
      },
      treatment({ brightness: false }),
    ],
    // Voronoi is the one filter whose manifest defaults are tuned for a Lolly
    // gallery card rather than a neutral start: an 80%-strength brand tint over
    // every cell, and the logo watermark switched on. Both are wrong for art the
    // user is about to drop into their own document — the cells should come out
    // the colour of the photo. The tint controls stay exposed at 0 so it's a dial
    // away, not removed.
    defaults: { treatmentColor: '', treatmentIntensity: 0, showLogo: false },
  },
];

/** Ids the panel drives itself rather than exposing as a control: the source
 *  image, the output size (taken from the Penpot shape), and `noFilter` (wired
 *  to the camera pane's own bypass toggle). */
export const PANEL_OWNED = new Set(['width', 'height', 'noFilter']);

export function filterById(id: string): FilterDef {
  const f = FILTERS.find((x) => x.id === id);
  if (!f) throw new Error(`Unknown filter "${id}"`);
  return f;
}
