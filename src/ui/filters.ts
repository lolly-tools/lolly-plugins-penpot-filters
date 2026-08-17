// SPDX-License-Identifier: MPL-2.0
/**
 * Which of the Lolly filter tool's effects the panel exposes, and which of each
 * effect's inputs it shows.
 *
 * Upstream consolidated the seven `filter-*` tools into one `filter` tool: a
 * single `effect` select switches between halftone / scanline / posterize /
 * voronoi (which emit vector SVG) and duotone / pixel-stretch / imperfections
 * (which emit a raster image). This plugin's whole promise is an editable vector
 * group on the Penpot canvas, so it drives only the four vector effects and
 * leaves the raster three alone.
 *
 * The tool is loaded verbatim — an effect must behave identically here and on
 * lolly.tools, so nothing is patched. Its inputs are namespaced per effect
 * (`ht_`, `sc_`, `pz_`, `vo_`), with a shared colour-treatment block and a block
 * of brand-overlay inputs (logo watermark, lower-third name card, headshot) that
 * exist for social-video exports and make no sense on a Penpot board. Rather
 * than edit the manifest, the panel renders only the ids listed here; the rest
 * keep their manifest defaults, which are all "off".
 */

/** The one tool this plugin mounts. Its `effect` input picks the look. */
export const TOOL_ID = 'filter';

/** The manifest input that takes the source image. Unified across every effect
 *  now (the old tools disagreed — `photo` vs `image`), so the panel always feeds
 *  this one. */
export const SOURCE_INPUT = 'image';

export interface FilterGroup {
  label: string;
  /** Input ids, in the order the panel should show them. */
  inputs: string[];
  /** Collapsed until the user opens it. */
  collapsed?: boolean;
}

export interface FilterDef {
  /** The `effect` value this tab drives. */
  effect: string;
  /** Short label for the tab strip — the manifest option label is the same. */
  label: string;
  groups: FilterGroup[];
}

/**
 * The colour-treatment block every effect carries. Hue/saturation/lightness and
 * the treatment tint are shared, unprefixed inputs; `contrast` is shared too.
 * Brightness is the one per-effect member (`ht_brightness`, …) — voronoi has
 * none (its cells take their colour from the source pixel directly, so there's
 * no pre-trace luminance stage to lift), hence the optional id.
 */
function treatment(brightnessId?: string): FilterGroup {
  return {
    label: 'Colour treatment',
    collapsed: true,
    inputs: [
      ...(brightnessId ? [brightnessId] : []),
      'contrast', 'hue', 'saturation', 'lightness',
      'treatmentColor', 'blendMode', 'treatmentIntensity',
    ],
  };
}

/** Tab order, and — via the first entry — the effect the panel opens on.
 *  Halftone leads: it's the fastest to trace, the most forgiving of a low-
 *  contrast source, and the one whose output reads instantly as "this worked". */
export const FILTERS: FilterDef[] = [
  {
    effect: 'halftone',
    label: 'Halftone',
    groups: [
      {
        label: 'Dots',
        inputs: ['ht_gridSize', 'ht_dotScale', 'ht_shape', 'ht_invert', 'ht_fit'],
      },
      {
        label: 'Colour',
        inputs: ['ht_colorSource', 'ht_colorLevels', 'ht_fgColor', 'ht_bgColor'],
      },
      {
        label: 'Tone',
        collapsed: true,
        inputs: ['ht_gamma', 'ht_smoothing', 'ht_dither'],
      },
      treatment('ht_brightness'),
    ],
  },
  {
    effect: 'posterize',
    label: 'Posterize',
    groups: [
      {
        label: 'Separations',
        inputs: ['pz_steps', 'pz_threshold', 'pz_thresholdLevel', 'pz_invert', 'pz_resample', 'pz_colors'],
      },
      {
        label: 'Trace',
        inputs: ['pz_quality', 'pz_smoothing', 'pz_transparentBg'],
      },
      treatment('pz_brightness'),
    ],
  },
  {
    effect: 'scanline',
    label: 'Scanline',
    groups: [
      {
        label: 'Lines',
        inputs: ['sc_lineSize', 'sc_gapSize', 'sc_separatePixels', 'sc_everyLine', 'sc_fit'],
      },
      {
        label: 'Ramp',
        inputs: ['sc_highlight', 'sc_light', 'sc_mid', 'sc_shade', 'sc_shadow', 'sc_background'],
      },
      treatment('sc_brightness'),
    ],
  },
  {
    effect: 'voronoi',
    label: 'Voronoi',
    groups: [
      {
        label: 'Cells',
        inputs: ['vo_cells', 'vo_jitter', 'vo_relax', 'vo_seed'],
      },
      {
        label: 'Edges',
        inputs: ['vo_edgeWidth', 'vo_edgeColor', 'vo_transparentBg'],
      },
      treatment(),
    ],
  },
];

/** Ids the panel drives itself rather than exposing as a control: the effect
 *  selector (the tab strip), the source image, the output size (taken from the
 *  Penpot shape), the live-camera resolution, and `noFilter` (the raw-image
 *  bypass, meaningful only in the tool's own live pane). */
export const PANEL_OWNED = new Set(['effect', 'image', 'width', 'height', 'liveRes', 'noFilter']);

export function filterByEffect(effect: string): FilterDef {
  const f = FILTERS.find((x) => x.effect === effect);
  if (!f) throw new Error(`Unknown effect "${effect}"`);
  return f;
}
