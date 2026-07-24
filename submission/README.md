# Penpot Hub submission assets

Everything the [plugin submission form](https://penpot.app/penpothub/plugins/create-plugin)
asks for, kept in the repo so a resubmission (or a listing refresh after a UI
change) doesn't start from scratch.

| File | Form field | Size | Constraint |
|---|---|---|---|
| `icon-400.png` | Plugin icon | 400×400 | max 400×400, PNG/JPG, 5 MB |
| `cover.png` | Cover image | 1390×724 | max 1390×724, PNG/JPG, 5 MB |
| `shot-halftone.png` | Plugin image 1 | 840×1520 (2×) | max 3 images, 5 MB each |
| `shot-posterize.png` | Plugin image 2 | 840×1520 (2×) | |
| `shot-voronoi.png` | Plugin image 3 | 840×1520 (2×) | |
| `submission.md` | — | | Draft of every text field |

The icon is rendered from the 2048px Lolly master (`lolly/icon.avif`); it is the
Lolly brand mark, shared with the export plugin.

## Regenerating

The screenshots and the cover are captured from the **deployed** panel, not a
mockup — the cover's four tiles are real SVG output pulled out of the live
stage. So they only need regenerating when the UI or the filters change, and
they should be regenerated *after* a deploy, never before, or the listing will
show something users can't get.

The capture scripts aren't committed: they're throwaway Playwright drivers that
load the Pages URL, upload a synthetic source image, and screenshot. Rebuilding
one takes a few minutes and is less work than keeping a browser-automation
dependency alive in a repo that otherwise has none.
