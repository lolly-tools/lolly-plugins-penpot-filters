// SPDX-License-Identifier: MPL-2.0
/**
 * Panel side of the plugin — everything with a DOM.
 *
 * The shape of it: pick a source image (the board selection, an upload, or the
 * camera), mount one of the four Lolly filter tools against it through the
 * engine's own loader + runtime, show the hydrated SVG live, and on "Add to
 * canvas" post that SVG to the sandbox to become a real Penpot shape.
 *
 * The engine does all the interesting work. This file is wiring: source →
 * runtime input, runtime state → preview, button → postMessage.
 */
import { loadTool } from '@engine/loader.ts';
import { createRuntime } from '@engine/runtime.ts';
import type { Runtime } from '@engine/runtime.ts';
import type { InputModelItem, InputValue } from '@engine/inputs.ts';
import type { AssetRef } from '@lolly-tools/core/host-v1';

import type { PluginToUi, UiToPlugin, ShapeInfo, Theme } from '../messages.ts';
import { createHost, PENPOT_COLORS, type FilterHost } from './host.ts';
import { describeFailure } from './media.ts';
import { FILTERS, filterByEffect, TOOL_ID, SOURCE_INPUT } from './filters.ts';
import { renderControls } from './controls.ts';

// ── plugin channel ────────────────────────────────────────────────────────────

let nextRequestId = 1;
const pending = new Map<number, { resolve: (m: PluginToUi) => void; reject: (e: Error) => void }>();

function post(msg: UiToPlugin): void {
  parent.postMessage(msg, '*');
}

/** Send a request and wait for the sandbox's matching reply. */
function request(build: (requestId: number) => UiToPlugin): Promise<PluginToUi> {
  const requestId = nextRequestId++;
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    post(build(requestId));
  });
}

// ── panel state ───────────────────────────────────────────────────────────────

type SourceKind = 'board' | 'upload' | 'camera';

interface Source {
  kind: SourceKind;
  ref: AssetRef;
  /** Board shape the pixels came from — where the result gets placed. */
  shapeId: string | null;
  label: string;
}

let theme: Theme = 'light';
let selection: ShapeInfo[] = [];
let source: Source | null = null;
let activeEffect = FILTERS[0].effect;
let runtime: Runtime | null = null;
let unsubscribe: (() => void) | null = null;
let live = false;
let model: InputModelItem[] = [];
let hydrated = '';
/** "Show original" is on — the tool's `noFilter` bypass, so the stage shows the
 *  source image instead of the trace. A compare toggle, reset on every new
 *  source (a fresh runtime starts unfiltered). */
let showOriginal = false;
/** Generation counter so a slow mount that the user has already moved on from
 *  can't install itself over the newer one. */
let mountSeq = 0;

const openGroups = new Set<string>();
const seededEffects = new Set<string>();
const host: FilterHost = createHost(PENPOT_COLORS.light);

// ── DOM ───────────────────────────────────────────────────────────────────────

const app = document.getElementById('app') as HTMLDivElement;
app.innerHTML = `
  <header class="tabs" role="tablist"></header>
  <section class="source">
    <div class="source-buttons">
      <button type="button" data-source="board">Use selection</button>
      <button type="button" data-source="upload">Upload…</button>
      <button type="button" data-source="camera">Use camera</button>
    </div>
    <p class="source-note muted"></p>
  </section>
  <section class="preview">
    <div class="stage" aria-live="polite"></div>
    <button type="button" class="compare" data-act="compare" aria-pressed="false" title="Show the source image, unfiltered" hidden>Original</button>
  </section>
  <p class="error" hidden></p>
  <section class="panel"></section>
  <footer class="actions">
    <button type="button" class="primary" data-act="place" disabled>Add to canvas</button>
  </footer>
  <input type="file" accept="image/*" hidden />
`;

const tabsEl = app.querySelector('.tabs') as HTMLElement;
const sourceNote = app.querySelector('.source-note') as HTMLElement;
const stage = app.querySelector('.stage') as HTMLElement;
const panel = app.querySelector('.panel') as HTMLElement;
const errorEl = app.querySelector('.error') as HTMLParagraphElement;
const placeBtn = app.querySelector('[data-act="place"]') as HTMLButtonElement;
const compareBtn = app.querySelector('[data-act="compare"]') as HTMLButtonElement;
const fileInput = app.querySelector('input[type=file]') as HTMLInputElement;

function showError(message: string | null): void {
  errorEl.hidden = !message;
  errorEl.textContent = message ?? '';
}

function setNote(text: string): void {
  sourceNote.textContent = text;
}

// ── source acquisition ────────────────────────────────────────────────────────

let assetSeq = 0;

/** Wrap a data URL as an AssetRef the tools can consume, and register it with
 *  the host so the runtime's re-resolve pass can find it again. */
function toAsset(url: string, name: string, width: number, height: number): AssetRef {
  return host.putAsset({
    source: 'user',
    id: `panel-${assetSeq++}`,
    type: 'raster',
    format: 'png',
    url,
    width,
    height,
    meta: { name },
  });
}

function bytesToDataUrl(bytes: Uint8Array, mime = 'image/png'): string {
  let binary = '';
  // Chunked: a single String.fromCharCode(...bytes) blows the argument limit on
  // anything above a few hundred KB, and a board export is routinely megabytes.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

async function useBoardSelection(): Promise<void> {
  const shape = selection[0];
  if (!shape) {
    showError('Select a shape, board or image on the canvas first.');
    return;
  }
  showError(null);
  setNote(`Grabbing “${shape.name}”…`);
  // Oversample small shapes: the trace samples a grid off the decoded bitmap, so
  // a 1× export of a 200 px icon would starve it. Capped at 4× so a full board
  // doesn't turn into a 60-megapixel decode.
  const scale = Math.min(4, Math.max(1, Math.round(1200 / Math.max(shape.width, shape.height))));
  const reply = await request((requestId) => ({ type: 'grab-image', requestId, shapeId: shape.id, scale }));
  if (reply.type !== 'image-data') return;

  await stopLive();
  source = {
    kind: 'board',
    ref: toAsset(bytesToDataUrl(reply.bytes), reply.name, reply.width, reply.height),
    shapeId: shape.id,
    label: reply.name,
  };
  setNote(`Filtering “${reply.name}”.`);
  await mount();
}

function useUpload(): void {
  fileInput.value = '';
  fileInput.click();
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  showError(null);
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
  const size = await new Promise<{ w: number; h: number }>((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 1080, h: 1080 });
    img.src = url;
  });
  await stopLive();
  source = { kind: 'upload', ref: toAsset(url, file.name, size.w, size.h), shapeId: null, label: file.name };
  setNote(`Filtering “${file.name}”.`);
  await mount();
});

async function useCamera(): Promise<void> {
  if (live) {
    // "Stop camera" keeps the frame you're looking at: freeze it to a still so
    // the controls go on working on it (see freezeLiveFrame).
    await freezeLiveFrame();
    return;
  }
  if (!host.media.isAvailable()) {
    showError('This browser has no camera API available to the plugin panel.');
    return;
  }
  showError(null);
  setNote('Starting the camera…');
  try {
    await host.media.start();
  } catch (e) {
    setNote('');
    showError(describeFailure(e));
    return;
  }
  // The camera drives the tool's own onFrame hook: the runtime re-traces once
  // per frame, so the preview IS the filter, not a video with a filter on top.
  // The source is set even though its ref carries no url — onFrame supplies the
  // pixels — because it's what names the result and arms "Add to canvas".
  source = { kind: 'camera', ref: toAsset('', 'Camera', 1080, 1080), shapeId: null, label: 'Camera' };
  if (!runtime) await mount();
  else placeBtn.disabled = !hydrated.trim();
  const started = await runtime?.startLive();
  if (!started) {
    host.media.stop();
    setNote('');
    showError('This filter can’t run live.');
    return;
  }
  live = true;
  setNote('Live — press “Add to canvas” to freeze the current frame.');
  syncSourceButtons();
}

async function stopLive(): Promise<void> {
  if (!live) return;
  runtime?.stopLive();
  host.media.stop();
  live = false;
  syncSourceButtons();
}

/**
 * Turn the live camera frame currently on screen into an ordinary still the
 * controls can keep working on.
 *
 * While live, the source ref carries no url — `onFrame` supplies the pixels — so
 * the moment the camera stops, a slider nudge would re-trace against that empty
 * ref and collapse the preview to the tool's "choose an image" placeholder.
 * Grabbing the frame as a still (before the video is torn down), registering it
 * as a normal image source, and re-feeding the runtime keeps the frozen frame
 * fully editable — and armed for "Add to canvas". A no-op when not live.
 */
async function freezeLiveFrame(): Promise<void> {
  if (!live) return;
  const video = host.media.video;
  const w = video?.videoWidth || 1080;
  const h = video?.videoHeight || 1080;
  const label = source?.label ?? 'Camera';
  const still = host.media.grabStill(); // read the frame before stopLive drops the video
  await stopLive();
  if (!still) return; // couldn't grab it — leave the last trace on screen
  source = { kind: 'camera', ref: toAsset(still, label, w, h), shapeId: null, label };
  await runtime?.setInput(SOURCE_INPUT, source.ref);
}

function syncSourceButtons(): void {
  for (const btn of app.querySelectorAll<HTMLButtonElement>('[data-source]')) {
    const kind = btn.dataset.source as SourceKind;
    btn.classList.toggle('active', kind === 'camera' ? live : !live && source?.kind === kind);
    if (kind === 'camera') btn.textContent = live ? 'Stop camera' : 'Use camera';
    if (kind === 'board') btn.disabled = selection.length === 0;
  }
  syncCompare();
}

/** The "Show original" toggle: only meaningful once there's a source, and its
 *  label/pressed state reflects which view the stage is currently showing. */
function syncCompare(): void {
  compareBtn.hidden = !source;
  compareBtn.classList.toggle('active', showOriginal);
  compareBtn.setAttribute('aria-pressed', String(showOriginal));
  compareBtn.textContent = showOriginal ? 'Filtered' : 'Original';
}

compareBtn.addEventListener('click', () => {
  showOriginal = !showOriginal;
  syncCompare();
  // `noFilter` is a tool input the panel drives itself rather than exposing as a
  // control — flipping it swaps the trace for the raw source, live or still.
  setInput('noFilter', showOriginal);
});

app.querySelector('.source-buttons')?.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-source]');
  if (!btn) return;
  const kind = btn.dataset.source as SourceKind;
  if (kind === 'board') void useBoardSelection();
  else if (kind === 'upload') useUpload();
  else void useCamera();
});

// ── mounting a filter ─────────────────────────────────────────────────────────

function renderTabs(): void {
  tabsEl.replaceChildren(
    ...FILTERS.map((f) => {
      const active = f.effect === activeEffect;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.role = 'tab';
      btn.setAttribute('aria-selected', String(active));
      btn.textContent = f.label;
      btn.className = active ? 'active' : '';
      btn.addEventListener('click', () => void selectEffect(f.effect));
      return btn;
    }),
  );
}

/** Seed an effect's default-open groups the first time it's shown. openGroups is
 *  shared across effects, so seeding only once for the whole panel would leave
 *  every later effect's groups shut; after this the user's own toggles win. */
function seedGroups(effect: string): void {
  if (seededEffects.has(effect)) return;
  seededEffects.add(effect);
  for (const g of filterByEffect(effect).groups) if (!g.collapsed) openGroups.add(g.label);
}

/**
 * Switch effect. One tool is mounted for the whole session, so a tab change is
 * just `effect` flipped on the live runtime — no reload, the decoded source is
 * reused (the hook caches it by URL), and a running camera keeps running (its
 * `onFrame` reads the new effect off the model). The controls repaint when the
 * model settles, so we don't paint here: the incoming effect's inputs are
 * `showIf`-hidden until the model actually carries the new effect, and painting
 * early would flash an empty panel.
 */
async function selectEffect(effect: string): Promise<void> {
  if (effect === activeEffect) return;
  activeEffect = effect;
  seedGroups(effect);
  renderTabs();
  if (runtime) setInput('effect', effect);
  else await mount();
}

/** Fetch one tool file as text. The tools sit in dist/tools/ next to the panel
 *  (copied verbatim from the lolly tree at build time — see vite.config.ts). */
async function fetchToolFile(path: string): Promise<string> {
  const res = await fetch(new URL(`tools/${path}`, document.baseURI));
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.text();
}

async function mount(): Promise<void> {
  const seq = ++mountSeq;
  unsubscribe?.();
  unsubscribe = null;
  runtime = null;
  // A newly-mounted runtime starts from a clean slate; a value queued against
  // the torn-down one would land on the wrong runtime.
  queued.clear();
  // A fresh runtime traces (noFilter defaults off), so the compare toggle resets
  // with it — a new source starts filtered.
  showOriginal = false;

  const filter = filterByEffect(activeEffect);
  stage.classList.add('busy');

  try {
    const tool = await loadTool(TOOL_ID, fetchToolFile);
    if (seq !== mountSeq) return;

    // The effect and the source image go in as initial state, so the very first
    // hydration already carries the right traced art — no empty-placeholder flash.
    const initial: Record<string, InputValue> = { effect: activeEffect };
    if (source && source.ref.url) initial[SOURCE_INPUT] = source.ref;
    // Output size follows the source, so a 16:9 board doesn't come back square.
    const dims = sourceDimensions(tool.manifest.render);
    if (dims) Object.assign(initial, dims);

    const rt = await createRuntime(tool, host, initial);
    if (seq !== mountSeq) return;
    runtime = rt;
    seedGroups(activeEffect);

    unsubscribe = rt.subscribe((state) => {
      model = state.model;
      hydrated = state.hydrated;
      paint();
    });
    model = rt.getModel();
    hydrated = rt.getHydrated();
    paint();
    showError(null);
  } catch (e) {
    if (seq !== mountSeq) return;
    showError(`Couldn’t load ${filter.label}: ${String((e as Error)?.message ?? e)}`);
  } finally {
    if (seq === mountSeq) stage.classList.remove('busy');
  }
}

/** Match the render's aspect to the source image, keeping the manifest's own
 *  size as the long edge. `width`/`height` are shared across every effect now, so
 *  this applies to all four; `fit` still letterboxes within the frame. */
function sourceDimensions(
  render: { width?: number; height?: number } | undefined,
): { width: number; height: number } | null {
  const w = source?.ref.width;
  const h = source?.ref.height;
  if (!w || !h || !render?.width) return null;
  const long = Math.max(render.width, render.height ?? render.width);
  return w >= h
    ? { width: long, height: Math.round((long * h) / w) }
    : { width: Math.round((long * w) / h), height: long };
}

// ── keeping controls usable while they're being used ─────────────────────────

/** True from pointerdown on a control until the pointer is released anywhere. */
let dragging = false;
/** A control rebuild that was deferred because the user was mid-drag. */
let rebuildPending = false;

panel.addEventListener('pointerdown', () => {
  dragging = true;
});
// On window, not the panel: a slider drag routinely ends with the pointer well
// outside the panel, and a pointerup we never saw would wedge `dragging` on.
window.addEventListener('pointerup', () => {
  if (!dragging) return;
  dragging = false;
  if (rebuildPending) paint();
});

function paint(): void {
  const filter = filterByEffect(activeEffect);
  // For a vector effect the hydrated template is `{{{svgContent}}}` — a complete
  // `<svg>` — followed by the tool's export-chrome `<script>`s, which never run
  // (scripts assigned via innerHTML don't execute) and whose web-shell selectors
  // find nothing here anyway. Dropping it in and reading back the `<svg>` is all
  // the panel needs.
  stage.innerHTML = hydrated;

  // Mid-drag, replacing the controls would destroy the very element the pointer
  // is captured on — the drag dies on the first frame and the slider becomes
  // almost impossible to move. Defer the rebuild to pointerup; the preview keeps
  // updating live throughout, which is the part the user is actually watching.
  if (dragging) {
    rebuildPending = true;
  } else {
    rebuildPending = false;
    // A hook can rewrite any input (posterize re-seeds its whole palette when
    // the step count changes), so the rebuild is wholesale — but the control the
    // user was on has to survive it, or keyboard adjustment loses focus after
    // every single arrow press.
    const focused = (document.activeElement as HTMLElement | null)?.dataset?.inputId;
    panel.replaceChildren(
      renderControls(filter, model, setInput, openGroups),
    );
    if (focused) {
      panel.querySelector<HTMLElement>(`[data-input-id="${CSS.escape(focused)}"]`)?.focus();
    }
  }

  placeBtn.disabled = !hydrated.trim() || !source;
  syncCompare();
}

/**
 * Feed a control's value to the runtime, at most one in flight at a time.
 *
 * A drag fires `input` far faster than a filter can re-trace (halftone emits
 * ~1 700 circles a pass), so letting every event start its own hook run would
 * pile up work the user has already scrolled past. Instead the newest value per
 * input wins and the rest are dropped — the render the user ends on is always
 * the one they released on.
 */
let inflight: Promise<void> | null = null;
const queued = new Map<string, InputValue>();

function setInput(id: string, value: InputValue): void {
  queued.set(id, value);
  if (inflight) return;
  const drain = async (): Promise<void> => {
    try {
      while (queued.size) {
        const [nextId, nextValue] = queued.entries().next().value as [string, InputValue];
        queued.delete(nextId);
        await runtime?.setInput(nextId, nextValue);
      }
    } finally {
      // Cleared in `finally`, not after the loop: one hook that throws must not
      // leave the queue permanently blocked, silently freezing every control.
      inflight = null;
    }
  };
  inflight = drain();
}

// ── committing to the canvas ──────────────────────────────────────────────────

function currentSvg(): string | null {
  const svg = stage.querySelector('svg');
  if (!svg) return null;
  const clone = svg.cloneNode(true) as SVGElement;
  // Penpot parses the markup standalone, so the namespace has to be explicit
  // even though the browser left it implicit on a document-parsed element.
  if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  if (!clone.getAttribute('xmlns:xlink')) {
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  }
  return new XMLSerializer().serializeToString(clone);
}

placeBtn.addEventListener('click', async () => {
  const svg = currentSvg();
  if (!svg) return;
  const filter = filterByEffect(activeEffect);
  // Freeze the frame the user is looking at BEFORE locking the button: the SVG is
  // already captured, and freezing turns the live feed into a still so the panel
  // stays editable after the commit (and stops the camera repainting mid-add). A
  // no-op for a non-camera source.
  await freezeLiveFrame();
  placeBtn.disabled = true;
  placeBtn.textContent = 'Adding…';
  try {
    const reply = await request((requestId) => ({
      type: 'place-svg',
      requestId,
      svg,
      name: `${filter.label} — ${source?.label ?? 'render'}`,
      sourceShapeId: source?.shapeId ?? null,
    }));
    if (reply.type === 'placed') setNote(`Added “${reply.name}” to the canvas.`);
  } finally {
    placeBtn.textContent = 'Add to canvas';
    placeBtn.disabled = false;
  }
});

// ── plugin messages ───────────────────────────────────────────────────────────

function applyTheme(next: Theme): void {
  theme = next;
  document.documentElement.dataset.theme = theme;
  host.setColors(PENPOT_COLORS[theme]);
}

window.addEventListener('message', (event: MessageEvent<PluginToUi>) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'init') {
    applyTheme(msg.theme);
    selection = msg.selection;
    syncSourceButtons();
    // Nothing selected is the common cold-open case; say what to do rather than
    // showing an empty stage with no explanation.
    setNote(
      selection.length
        ? `“${selection[0].name}” is selected — press “Use selection”.`
        : 'Select something on the canvas, upload an image, or use your camera.',
    );
    return;
  }
  if (msg.type === 'theme') {
    applyTheme(msg.theme);
    return;
  }
  if (msg.type === 'selection') {
    selection = msg.selection;
    syncSourceButtons();
    return;
  }
  if (msg.type === 'error') {
    showError(msg.message);
  }

  const waiter = 'requestId' in msg ? pending.get(msg.requestId) : undefined;
  if (waiter && 'requestId' in msg) {
    pending.delete(msg.requestId);
    waiter.resolve(msg);
  }
});

// ── boot ──────────────────────────────────────────────────────────────────────

applyTheme((new URLSearchParams(location.search).get('theme') as Theme) ?? 'light');
renderTabs();
syncSourceButtons();
void mount();
post({ type: 'ready' });
