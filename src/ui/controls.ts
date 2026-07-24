// SPDX-License-Identifier: MPL-2.0
/**
 * Renders a tool's input model as panel controls.
 *
 * A deliberately small subset of the web shell's input renderer (2 400 lines
 * covering every control the whole catalog uses). The four filters between them
 * need six: slider, number, boolean, select, colour, and the one repeater —
 * posterize's per-separation swatch list.
 *
 * Controls are rebuilt from scratch on every model change rather than
 * diffed. A filter's hooks rewrite their own inputs constantly (posterize
 * re-seeds the whole palette when you change the step count), so "the DOM is a
 * function of the model" is the only version of this that stays correct — and
 * with ~15 visible rows it's imperceptible. The one concession: the control the
 * user is actively dragging keeps focus across the rebuild.
 */
import type { InputModelItem, InputValue } from '@engine/inputs.ts';
import type { FilterDef } from './filters.ts';
import { PANEL_OWNED } from './filters.ts';

export type OnChange = (id: string, value: InputValue) => void;

/** Colour values arrive either as a plain hex or as a resolved token
 *  ({ ref, value }) — `<input type=color>` only speaks the former. */
function hexOf(v: InputValue): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && 'value' in v && typeof v.value === 'string') return v.value;
  return '';
}

function visible(item: InputModelItem, values: Record<string, InputValue>): boolean {
  if (!item.showIf) return true;
  // A showIf value may be a single value or an array of accepted ones.
  return Object.entries(item.showIf).every(([k, v]) =>
    Array.isArray(v) ? v.includes(values[k] as InputValue) : values[k] === v,
  );
}

function row(label: string, help: string | undefined, control: HTMLElement): HTMLElement {
  const el = document.createElement('label');
  el.className = 'row';
  const name = document.createElement('span');
  name.className = 'row-label';
  name.textContent = label;
  if (help) name.title = help;
  el.append(name, control);
  return el;
}

function slider(item: InputModelItem, onChange: OnChange): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'slider';

  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(item.min ?? 0);
  input.max = String(item.max ?? 100);
  input.step = String(item.step ?? 1);
  input.value = String(item.value ?? item.default ?? 0);
  input.dataset.inputId = item.id;

  const out = document.createElement('output');
  out.textContent = input.value;

  // `input` (not `change`) so a drag re-traces live; the runtime already drops
  // overlapping hook runs, so a fast drag coalesces rather than queueing.
  input.addEventListener('input', () => {
    out.textContent = input.value;
    onChange(item.id, Number(input.value));
  });

  wrap.append(input, out);
  return wrap;
}

function numberBox(item: InputModelItem, onChange: OnChange): HTMLElement {
  const input = document.createElement('input');
  input.type = 'number';
  if (item.min != null) input.min = String(item.min);
  if (item.max != null) input.max = String(item.max);
  if (item.step != null) input.step = String(item.step);
  input.value = String(item.value ?? item.default ?? 0);
  input.dataset.inputId = item.id;
  input.addEventListener('change', () => onChange(item.id, Number(input.value)));
  return input;
}

function checkbox(item: InputModelItem, onChange: OnChange): HTMLElement {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = Boolean(item.value);
  input.dataset.inputId = item.id;
  input.addEventListener('change', () => onChange(item.id, input.checked));
  return input;
}

function select(item: InputModelItem, onChange: OnChange): HTMLElement {
  const el = document.createElement('select');
  el.dataset.inputId = item.id;
  for (const opt of item.options ?? []) {
    const o = document.createElement('option');
    o.value = String(opt.value);
    o.textContent = opt.label ?? String(opt.value);
    el.append(o);
  }
  el.value = String(item.value ?? item.default ?? '');
  el.addEventListener('change', () => onChange(item.id, el.value));
  return el;
}

function colorPicker(item: InputModelItem, onChange: OnChange): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'color';

  const hex = hexOf(item.value);
  const input = document.createElement('input');
  input.type = 'color';
  input.value = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#000000';
  input.dataset.inputId = item.id;
  input.addEventListener('input', () => onChange(item.id, input.value));

  // Several colour inputs treat empty as "none / inherit the paper" (scanline's
  // background, posterize's treatment colour). A colour well can't express that,
  // so the clear button is the only way back to the default once you've picked.
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'ghost';
  clear.textContent = '×';
  clear.title = 'Clear';
  clear.addEventListener('click', (e) => {
    e.preventDefault();
    onChange(item.id, '');
  });

  wrap.append(input);
  if (!hex) wrap.classList.add('is-empty');
  wrap.append(clear);
  return wrap;
}

/**
 * A `blocks` repeater. Only posterize uses one, and only with a single `color`
 * sub-field per row — so this handles exactly that shape rather than the
 * general case. Rows are the tonal separations, darkest first, paper last.
 */
function blocks(item: InputModelItem, onChange: OnChange): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'blocks';

  const rows = Array.isArray(item.value) ? (item.value as InputValue[]) : [];
  const field = item.fields?.[0];
  const fieldId = field?.id ?? 'color';

  rows.forEach((entry, i) => {
    const value =
      entry && typeof entry === 'object' && !Array.isArray(entry)
        ? hexOf((entry as Record<string, InputValue>)[fieldId] ?? '')
        : hexOf(entry);

    const swatch = document.createElement('input');
    swatch.type = 'color';
    swatch.value = /^#[0-9a-f]{6}$/i.test(value) ? value : '#808080';
    swatch.title = i === rows.length - 1 ? 'Paper / lightest separation' : `Separation ${i + 1}`;
    swatch.addEventListener('input', () => {
      const next = rows.map((r, j) =>
        j === i ? { ...(r as Record<string, InputValue>), [fieldId]: swatch.value } : r,
      );
      onChange(item.id, next);
    });
    wrap.append(swatch);
  });

  if (!rows.length) {
    const empty = document.createElement('span');
    empty.className = 'muted';
    empty.textContent = 'Sampled from the image once it loads.';
    wrap.append(empty);
  }

  return wrap;
}

function controlFor(item: InputModelItem, onChange: OnChange): HTMLElement | null {
  switch (item.type) {
    case 'number':
      return item.display === 'slider' ? slider(item, onChange) : numberBox(item, onChange);
    case 'boolean':
      return checkbox(item, onChange);
    case 'select':
      return select(item, onChange);
    case 'color':
      return colorPicker(item, onChange);
    case 'blocks':
      return blocks(item, onChange);
    case 'text':
      return null; // no text input survives the panel's allowlist
    default:
      return null;
  }
}

/**
 * Build the control panel for one filter.
 *
 * @param openGroups  labels of groups the user has expanded — passed in and
 *   read back by the caller so a rebuild doesn't collapse everything.
 */
export function renderControls(
  filter: FilterDef,
  model: InputModelItem[],
  onChange: OnChange,
  openGroups: Set<string>,
): HTMLElement {
  const byId = new Map(model.map((i) => [i.id, i]));
  const values: Record<string, InputValue> = Object.fromEntries(model.map((i) => [i.id, i.value]));

  const root = document.createElement('div');
  root.className = 'controls';

  for (const group of filter.groups) {
    const items = group.inputs
      .filter((id) => !PANEL_OWNED.has(id))
      .map((id) => byId.get(id))
      .filter((i): i is InputModelItem => Boolean(i) && visible(i as InputModelItem, values));

    if (!items.length) continue;

    const details = document.createElement('details');
    details.className = 'group';
    // openGroups is seeded with the non-collapsed groups on first mount, so this
    // one flag covers both the default state and everything the user has since
    // opened or shut.
    details.open = openGroups.has(group.label);
    details.addEventListener('toggle', () => {
      if (details.open) openGroups.add(group.label);
      else openGroups.delete(group.label);
    });

    const summary = document.createElement('summary');
    summary.textContent = group.label;
    details.append(summary);

    for (const item of items) {
      const control = controlFor(item, onChange);
      if (!control) continue;
      details.append(row(item.label ?? item.id, item.help, control));
    }

    root.append(details);
  }

  return root;
}
