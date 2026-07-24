# Penpot Hub submission — Lolly Filters

Form: https://penpot.app/penpothub/plugins/create-plugin

---

**Plugin title**

Lolly Filters

---

**Description**

Turn any image on your board into editable vector art. Select a shape, upload a
file, or point your camera at something — Lolly Filters traces it into
posterized colour separations, halftone dots, scanlines or Voronoi cells, shows
you the result live, and drops it onto the canvas as a real Penpot group you can
select, recolour and reshape.

The output is SVG, always: paths, circles and polygons, never a placed bitmap.

Everything runs in your browser. No account, no upload, no server — your images
never leave the tab.

---

**Key features and use cases**

- Four vector filters — Halftone (dots sized by brightness), Posterize
  (screenprint-style tonal separations), Scanline (weighted horizontal lines),
  Voronoi (a relaxed cell mosaic flooded with source colour).
- Live preview. Every slider retraces the art as you drag it; what you see is
  what lands on the canvas.
- Three sources: the current board selection, a local image file, or your camera
  in real time.
- True vector output via createShapeFromSvg — an editable group, not an image
  fill. Recolour separations, nudge cells, restyle dots after the fact.
- Fully client-side. Nothing is uploaded, so it works offline and on
  confidential material.
- Good for: poster and print-look artwork, screenprint separations, retro/CRT
  treatments, generative-looking backgrounds, turning a photo into something
  that survives being scaled up.

---

**URL manifest**

https://lolly-tools.github.io/lolly-plugins-penpot-filters/manifest.json

---

**Repository URL**

https://github.com/lolly-tools/lolly-plugins-penpot-filters

---

**Author** — Andy Fitzsimon

**Contact email** — andy@fitzsimon.com.au   *(not published)*

**Preferred contact method** — [confirm: GitHub @ndftz, or a social link]

**Author's website** — https://lolly.tools/info

---

## Assets

| Field | File | Size | Notes |
|---|---|---|---|
| Plugin icon (max 400×400, 5 MB) | `icon-400.png` | 400×400 | Rendered from the 2048px Lolly master |
| Cover image (max 1390×724, 5 MB) | `cover.png` | 1390×724 | Panel + real filter output, not a mockup |
| Plugin image 1 (max 3) | `shot-halftone.png` | 840×1520 @2× | |
| Plugin image 2 | `shot-posterize.png` | 840×1520 @2× | |
| Plugin image 3 | `shot-voronoi.png` | 840×1520 @2× | |

All screenshots are of the **deployed** build at the manifest URL above, so they
match what a reviewer will see on install.

---

## Before submitting

- The form says submissions are verified functional before publication —
  install from the manifest URL and run through it once in the Penpot build a
  reviewer would use.
- **Camera is the one unverified path in Penpot itself.** The panel is a
  cross-origin iframe, so getUserMedia only reaches the camera if Penpot sets
  `allow="camera"` on it. It works standalone; if it turns out to be blocked in
  Penpot, drop "or point your camera at something" from the description and the
  camera bullet from the features list before submitting, rather than promising
  something the reviewer can't reproduce.
- The icon is the Lolly brand mark, not a filters-specific one. Fine if that's
  the intent; worth a distinct mark if these ship as a family.
