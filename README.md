# Lolly Filters for Penpot

A Penpot plugin that runs any image on your board through Lolly's `filter`
tool — halftone dots, posterized separations, scanlines, Voronoi cells, dither,
ASCII art, and four print/raster looks. Powered by the
[Lolly](https://lolly.tools) engine, running entirely in the user's browser. No
server component, nothing uploaded anywhere.

Six effects emit **vector** SVG — real paths and shapes that land as an editable
Penpot group — and four bake a **bitmap**. Penpot's
`createShapeFromSvgWithImages` places either, so both drop straight onto the
canvas.

## The filters

One tool, ten looks, chosen through its `effect` input.

**Vector** — placed as an editable group:

| Filter | What it does | Output |
|---|---|---|
| **Halftone** | Dots sized by local brightness, on a grid you control — circle/square/diamond, sampled colour or one ink, optional dithering. | thousands of `<circle>`/`<rect>` |
| **Posterize** | Splits luminance into N tonal bands, traces each into a filled separation (marching squares → Douglas–Peucker → corner-aware cubic Béziers), stacked darkest-on-top. Screenprint separations. | one `<path>` per separation |
| **Scanline** | Horizontal "infinity lines": line weight tracks tone across a five-stop colour ramp. | a handful of long `<path>`s |
| **Voronoi** | Shatters the image into a relaxed Voronoi mosaic, each cell flooded with its nearest source colour. | one `<polygon>` per cell |
| **Dither** | Ordered / Floyd–Steinberg / noise dithering down to a chosen palette. | a grid of cells |
| **ASCII** | Maps brightness to a character ramp, laid out as real text. | `<text>` glyphs |

**Raster** — placed as an image:

| Filter | What it does |
|---|---|
| **Duotone** | Tint / duotone / gradient / split-tone colour treatment. |
| **Pixel stretch** | Smears pixels past a threshold into stretched streaks. |
| **Imperfections** | Riso / photocopy / worn print character — misregistration, ink bleed, paper grain. |
| **Glitch** | Pixel-sort, RGB channel offset, and block corruption. |

## Where the image comes from

Two sources, both client-side:

- **Use selection** — the selected Penpot shape or board, rasterised via
  `shape.export({ type: 'png' })` and fed to the tool. The result is placed
  beside its source on the canvas.
- **Upload** — any local image file.

The tool also has a live-camera path, but Penpot's plugin sandbox blocks
`getUserMedia`, so there's no camera button — the machinery stays dormant in
`src/ui/media.ts` in case the sandbox ever permits it.

Over either source, a **Show original** toggle on the preview swaps the trace for
the untouched source image (the tool's `noFilter` input) — a one-click A/B while
you dial the effect in. An **Expand** toggle beside it folds the picker and the
controls away and grows the stage to fill the panel, so you can judge the result
at size before committing it; Esc or the pill brings the controls back. On a wide
panel the preview sits as a column beside the scrollable settings; drag it narrow
and the layout stacks.

## How it works

```
Penpot sandbox (src/plugin.ts)               Panel iframe (src/ui/)
──────────────────────────────               ────────────────────────────────
selection / themechange  ─────────────────▶  panel state
                          ◀────────────────  grab-image {shapeId, scale}
shape.export({type:'png'}) ───────────────▶  PNG bytes
                                             │  (or an upload)
                                             ▼
                                    loadTool()  ← dist/tools/filter/  (mounted once)
                                    createRuntime(tool, host, {effect, image, …})
                                             │
                              tabs → runtime.setInput('effect', …)
                                             │
                              community hooks.js decode → trace → SVG
                                             │
                                    runtime.getHydrated()  → live preview
                          ◀────────────────  place-svg {svg, sourceShapeId}
penpot.createShapeFromSvgWithImages()
```

The tool is the **unmodified** `community/filter` directory from the lolly repo —
`tool.json`, `template.html` and `hooks.js` copied verbatim into `dist/tools/` at
build time and fetched as text by the engine's own loader. (Upstream consolidated
the old seven `filter-*` tools into this one, with an `effect` input.) It's
mounted once for the session; switching tabs just sets `effect` on the live
runtime — the decoded source is reused, no reload. An effect behaves identically
here and on lolly.tools; nothing is forked.

What this repo actually adds is `src/ui/host.ts`: a `HostV1` capability bridge
scoped to what these effects reach for (`log`, `assets.get`, `profile.get`,
`compose.renderUrl`, `media`, and `raster.{canRaster,decode}` — the tool now
decodes its source image through `host.raster` rather than a hand-rolled
`<img>`, so without it every preview falls back to the tool's placeholder), plus
a (dormant) camera implementation (`src/ui/media.ts`) and a small control
renderer (`src/ui/controls.ts`) covering the six input types the effects use.

### Curated controls

The tool carries a lot the panel has no business showing: a block of lolly.tools
brand-overlay inputs (logo watermark, lower-third name card, headshot) meant for
social-video exports, and a few `vector`-typed inputs (image framing, per-channel
offsets) the panel's small renderer has no control for. Rather than patch the
manifest, `src/ui/filters.ts` lists — per effect, by their namespaced ids (`ht_`,
`sc_`, `pz_`, `vo_`, `di_`, `as_`, `du_`, `px_`, `im_`, `gl_`, plus the shared
colour-treatment block) — exactly the inputs the panel renders; everything else
keeps its manifest default, which is "off" for every overlay. The consolidated
tool ships neutral (no brand tint, logo off), so there's no value override to
make here.

## Development

Requires a sibling checkout of the lolly repo:

```
~/Build/lolly                        ← engine sources + community/filter
~/Build/lolly-plugins-penpot-filters ← this repo
```

```bash
npm install
npm run build        # dist/ = UI bundle + plugin.js + manifest.json + tools/
npm run preview      # serves dist/ at http://localhost:4403 with CORS
npm run typecheck
npm run smoke        # headless mount test (see below)
```

### Trying it in Penpot

1. `npm run preview`
2. In Penpot: Plugins (`Ctrl/Cmd + Alt + P`) → install from
   `http://localhost:4403/manifest.json`
3. Select an image, open the plugin, press **Use selection**.

Opening `http://localhost:4403/` directly (outside Penpot) works too — the
panel is a plain page. Everything except **Use selection** and **Add to
canvas** functions without a Penpot host, which is what the browser tests
drive.

### Headless mount smoke test

```bash
npm run smoke
```

Loads the `filter` tool through the real loader + runtime against the built
`dist/tools/`, and for each of the ten effects asserts it mounts, hydrates to an
`<svg>`, and that every input id `filters.ts` promises to render actually exists
in the manifest. It cannot cover the trace itself — that needs a real `<canvas>`,
and `host.raster` reports unavailable in the headless shell, so each effect
degrades to a placeholder card rather than throwing. Runs in CI before publish.

## Deploying

`dist/` is fully static. GitHub Pages hosting is wired up in
`.github/workflows/deploy-pages.yml`: on every push to `main` it clones the
public lolly repo as the sibling checkout, builds, smoke-tests, and publishes
`dist/`. Pages serves `Access-Control-Allow-Origin: *`, and the build uses
relative paths (`vite base: './'`, manifest `"version": 2`) so it works under
the project-pages subpath. Install in Penpot from:

```
https://lolly-tools.github.io/lolly-plugins-penpot-filters/manifest.json
```

One-time repo setting: **Settings → Pages → Source: GitHub Actions.**

## Known limitations

- **No camera.** Penpot's plugin panel is a cross-origin iframe that doesn't set
  `allow="camera"`, so `getUserMedia` is blocked — there's no camera button. The
  tool's live-frame path stays in the tree (`src/ui/media.ts`), dormant, in case
  a future Penpot build permits it.
- **Raster effects place as an image.** Duotone, pixel-stretch, imperfections and
  glitch bake a bitmap rather than vector paths — they still land on the canvas
  (Penpot takes both), just as a placed image, not an editable group.
- **The source is rasterised.** Filtering a Penpot shape goes through a PNG
  export, so the tracer sees pixels, not the shape's own vectors. Small shapes
  are oversampled (up to 4×) to give the trace something to bite into.
- **Halftone and Voronoi produce a lot of nodes.** A fine grid is thousands of
  elements; Penpot will import them, but the group gets heavy. Reach for the
  grid/cell-count sliders before the canvas does.
- **No download.** This plugin's output goes to the canvas. For files, use
  [lolly-plugins-penpot-export](https://github.com/lolly-tools/lolly-plugins-penpot-export)
  or lolly.tools itself.

## License

MPL-2.0, same as the Lolly engine.
