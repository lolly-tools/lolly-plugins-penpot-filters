// SPDX-License-Identifier: MPL-2.0
/**
 * Which of the Lolly filter tool's effects the panel exposes, and which of each
 * effect's inputs it shows.
 *
 * Upstream consolidated the old `filter-*` tools into one `filter` tool: a single
 * `effect` select switches between ten looks. Six emit vector SVG that lands as
 * an editable Penpot group — halftone, posterize, scanline, voronoi, dither,
 * ASCII — and four bake a raster image — duotone, pixel-stretch, imperfections,
 * glitch — that Penpot's `createShapeFromSvgWithImages` places as a bitmap shape.
 * The panel drives all ten; the tab's `raster` flag is the only thing that
 * differs (a note, not a code path — the framework takes both).
 *
 * The tool is loaded verbatim — an effect must behave identically here and on
 * lolly.tools, so nothing is patched. Its inputs are namespaced per effect
 * (`ht_`, `sc_`, `pz_`, `vo_`, `di_`, `as_`, `du_`, `px_`, `im_`, `gl_`), over a
 * shared colour-treatment block and a block of brand-overlay inputs (logo
 * watermark, lower-third name card, headshot) that exist for social-video
 * exports and make no sense on a Penpot board. Rather than edit the manifest, the
 * panel renders only the ids listed here; the rest keep their manifest defaults,
 * which are all "off". `vector`-typed inputs (image framing, per-channel offsets)
 * have no control in this panel's small renderer, so they're left off too.
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
  /** True for the effects that bake a bitmap rather than emit vector paths; they
   *  still place fine (Penpot takes both), but land as an image, not an editable
   *  group. Surfaced only as a tab tooltip. */
  raster?: boolean;
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
  {
    effect: 'dither',
    label: 'Dither',
    groups: [
      {
        label: 'Dither',
        inputs: ['di_algorithm', 'di_palette', 'di_colorCount', 'di_scale', 'di_fit'],
      },
      treatment(),
    ],
  },
  {
    effect: 'ascii',
    label: 'ASCII',
    groups: [
      {
        label: 'Characters',
        inputs: ['as_ramp', 'as_cellSize', 'as_fontWeight', 'as_invert', 'as_fit'],
      },
      {
        label: 'Colour',
        inputs: ['as_colorMode', 'as_fgColor', 'as_bgColor'],
      },
      {
        label: 'Tone',
        collapsed: true,
        inputs: ['as_threshold'],
      },
      treatment(),
    ],
  },
  // ── raster effects ─────────────────────────────────────────────────────────
  // These bake a bitmap; they place as an image rather than an editable group.
  {
    effect: 'duotone',
    label: 'Duotone',
    raster: true,
    groups: [
      {
        label: 'Treatment',
        inputs: ['du_treatment', 'du_treatmentAmount', 'du_treatShadow', 'du_treatMid', 'du_treatHighlight'],
      },
    ],
  },
  {
    effect: 'pixel-stretch',
    label: 'Pixel stretch',
    raster: true,
    groups: [
      {
        label: 'Stretch',
        inputs: ['px_direction', 'px_threshold', 'px_spread', 'px_feather'],
      },
    ],
  },
  {
    effect: 'imperfections',
    label: 'Imperfections',
    raster: true,
    groups: [
      {
        label: 'Press',
        inputs: ['im_preset', 'im_strength', 'im_seed', 'im_fit'],
      },
      {
        label: 'Ink',
        inputs: ['im_ink1', 'im_ink2', 'im_plates', 'im_misregAmount', 'im_bleedAmount'],
      },
      {
        label: 'Paper',
        collapsed: true,
        inputs: ['im_degradeAmount', 'im_paperTint', 'im_paperTintStrength', 'im_grainAmount'],
      },
    ],
  },
  {
    effect: 'glitch',
    label: 'Glitch',
    raster: true,
    groups: [
      {
        label: 'Pixel sort',
        inputs: ['gl_sortThreshold', 'gl_sortDirection', 'gl_sortBandLength'],
      },
      {
        label: 'Blocks',
        inputs: ['gl_blockAmount', 'gl_blockSize', 'gl_seed', 'gl_fit'],
      },
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
