# Lolly Filters for Penpot

A Penpot plugin that turns any image on your board into **vector** art —
posterized colour separations, halftone dots, scanlines, or Voronoi cells.
Powered by the [Lolly](https://lolly.tools) engine, running entirely in the
user's browser. No server component, nothing uploaded anywhere.

The output is SVG, always. The tracers emit real paths and shapes, and the
result lands on the canvas as an editable Penpot group — not a placed bitmap.

## The filters

| Filter | What it does | Output |
|---|---|---|
| **Posterize** | Splits luminance into N tonal bands, traces each into a filled separation (marching squares → Douglas–Peucker → corner-aware cubic Béziers), stacked darkest-on-top. Screenprint separations. | one `<path>` per separation |
| **Halftone** | Dots sized by local brightness, on a grid you control — circle/square/diamond, sampled colour or one ink, optional dithering. | thousands of `<circle>`/`<rect>` |
| **Scanline** | Horizontal "infinity lines": line weight tracks tone across a five-stop colour ramp. | a handful of long `<path>`s |
| **Voronoi** | Shatters the image into a relaxed Voronoi mosaic, each cell flooded with its nearest source colour. | one `<polygon>` per cell |

The duotone and pixel-stretch filters from the Lolly catalog are deliberately
out of scope here.

## Where the image comes from

Three sources, all of them client-side:

- **Use selection** — the selected Penpot shape or board, rasterised via
  `shape.export({ type: 'png' })` and fed to the tracer. The result is placed
  beside its source on the canvas.
- **Upload** — any local image file.
- **Use camera** — the panel drives the tool's own `onFrame` hook off a live
  `getUserMedia` stream, so the preview **is** the filter re-tracing ~30× a
  second, not a video with an effect layered over it. "Add to canvas" freezes
  the frame you're looking at and commits it as vector.

## How it works

```
Penpot sandbox (src/plugin.ts)               Panel iframe (src/ui/)
──────────────────────────────               ────────────────────────────────
selection / themechange  ─────────────────▶  panel state
                          ◀────────────────  grab-image {shapeId, scale}
shape.export({type:'png'}) ───────────────▶  PNG bytes
                                             │  (or an upload, or a camera frame)
                                             ▼
                                    loadTool()  ← dist/tools/filter-*/
                                    createRuntime(tool, host, initial)
                                             │
                              community hooks.js decode → trace → SVG
                                             │
                                    runtime.getHydrated()  → live preview
                          ◀────────────────  place-svg {svg, sourceShapeId}
penpot.createShapeFromSvgWithImages()
```

The four tools are the **unmodified** `community/filter-*` directories from the
lolly repo — `tool.json`, `template.html` and `hooks.js` copied verbatim into
`dist/tools/` at build time and fetched as text by the engine's own loader. A
filter behaves identically here and on lolly.tools; nothing is forked.

What this repo actually adds is `src/ui/host.ts`: a ~150-line `HostV1`
capability bridge scoped to what these four tools reach for (`log`,
`assets.get`, `profile.get`, `compose.renderUrl`, `media`), plus a camera
implementation (`src/ui/media.ts`) and a small control renderer
(`src/ui/controls.ts`) covering the six input types the filters use.

### Curated controls

Every filter also carries a block of lolly.tools brand-overlay inputs (logo
watermark, lower-third name card, headshot) that make no sense dropped onto a
Penpot board. Rather than patch the manifests, `src/ui/filters.ts` lists the
input ids the panel renders; the rest keep their manifest defaults. The one
value override is Voronoi's — its manifest ships an 80%-strength brand tint and
the logo on, both tuned for a gallery card. The tint dial stays exposed at 0.

## Development

Requires a sibling checkout of the lolly repo:

```
~/Build/lolly                        ← engine sources + community/filter-*
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

Loads all four filters through the real loader + runtime against the built
`dist/tools/`, and asserts each one mounts, hydrates to an `<svg>`, declares an
`onFrame` hook, and actually declares every input id `filters.ts` promises to
render. It cannot cover the trace itself — that needs a real `<canvas>`, and
each filter deliberately degrades to a placeholder card in a headless shell
rather than throwing. Runs in CI before publish.

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

- **Camera inside the panel depends on Penpot.** The plugin panel is a
  cross-origin iframe, so `getUserMedia` only reaches the camera if Penpot sets
  `allow="camera"` on it. When it doesn't, the browser rejects with
  `NotAllowedError` — indistinguishable from the user denying permission — so
  the panel names both possibilities rather than blaming the user. Verified
  working standalone; **needs confirming against a live Penpot build.**
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
