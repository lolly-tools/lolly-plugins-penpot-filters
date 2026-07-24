// SPDX-License-Identifier: MPL-2.0
/**
 * A minimal HostV1 capability bridge, scoped to what the four filter tools
 * actually reach for.
 *
 * The web shell's bridge is a ~90 KB affair backed by IndexedDB, a render
 * pipeline and a network layer. None of that applies inside a Penpot panel: the
 * only "assets" are images the user just handed us (board selection, upload,
 * camera still), state lives for exactly as long as the panel is open, and
 * export never runs — the panel reads the runtime's hydrated SVG directly and
 * posts it to the sandbox.
 *
 * Grepping `host.<something>` across the four tools' hooks.js yields exactly:
 * log, assets.get, profile.get, compose.renderUrl, media. Everything else here
 * exists only because HostV1 declares it non-optional.
 */
import { createTokenSet } from '@engine/tokens.ts';
import type {
  HostV1, AssetRef, AssetQuery, AssetPickerOpts, Profile, TokenSet,
} from '@lolly-tools/core/host-v1';
import { createMediaApi, type MediaApi } from './media.ts';

/** Semantic colours a couple of the filters use as input defaults
 *  (`{color.semantic.text}`, `{color.semantic.surface}`,
 *  `{color.semantic.primary}`). Mirrored onto the panel's own CSS variables so
 *  a filter's out-of-the-box palette matches the Penpot theme it opened in. */
export interface SemanticColors {
  text: string;
  surface: string;
  primary: string;
}

export const PENPOT_COLORS: Record<'light' | 'dark', SemanticColors> = {
  light: { text: '#0a0a0a', surface: '#ffffff', primary: '#7efff5' },
  dark: { text: '#ffffff', surface: '#18181a', primary: '#7efff5' },
};

export interface FilterHost extends HostV1 {
  /** Register an image the tools can resolve by id (board grab, upload, still). */
  putAsset(ref: AssetRef): AssetRef;
  /** Swap the semantic palette when Penpot changes theme. */
  setColors(colors: SemanticColors): void;
  media: MediaApi;
}

function tokenDoc(c: SemanticColors) {
  const color = (hex: string) => ({ $type: 'color', $value: hex });
  return {
    color: {
      semantic: { text: color(c.text), surface: color(c.surface), primary: color(c.primary) },
    },
  };
}

const unsupported = (what: string) => () =>
  Promise.reject(new Error(`${what} isn't available inside the Penpot panel.`));

export function createHost(initialColors: SemanticColors): FilterHost {
  // Images the panel has produced this session, keyed by the synthetic id we
  // minted for them. The runtime re-resolves any asset ref that carries an id
  // (saved sessions store stale blob: URLs), so this has to answer for every
  // ref we ever hand to setInput — not just the current one.
  const assets = new Map<string, AssetRef>();
  let colors = initialColors;
  let tokens: TokenSet = createTokenSet(tokenDoc(colors));

  const media = createMediaApi();

  const host: FilterHost = {
    version: '1',
    shell: 'web',

    putAsset(ref) {
      assets.set(ref.id, ref);
      return ref;
    },

    setColors(next) {
      colors = next;
      tokens = createTokenSet(tokenDoc(colors));
    },

    log(level, msg, ctx) {
      // Tool logs are diagnostics, not user-facing. Keep them in the console so
      // a misbehaving filter is debuggable from the panel's devtools.
      const line = `[lolly-filters] ${msg}`;
      if (level === 'error') console.error(line, ctx ?? '');
      else if (level === 'warn') console.warn(line, ctx ?? '');
      else console.debug(line, ctx ?? '');
    },

    profile: {
      // No profile inside Penpot — the personalisation inputs that read it
      // (lower-third name/headshot) are hidden from the panel anyway.
      get: () => Promise.resolve({} as Profile),
      subscribe: () => () => {},
    },

    assets: {
      get: (id: string) => {
        const ref = assets.get(id);
        return ref
          ? Promise.resolve(ref)
          : Promise.reject(new Error(`Unknown image "${id}".`));
      },
      query: (_filter: AssetQuery) => Promise.resolve([...assets.values()]),
      // The panel owns image selection (Board / Upload / Camera), so the tools'
      // own picker never opens.
      pick: (_opts: AssetPickerOpts) => Promise.resolve(null),
      isAvailable: (id: string) => Promise.resolve(assets.has(id)),
    },

    tokens: {
      get: () => Promise.resolve(tokens),
      colors: () => Promise.resolve(tokens.colors()),
      resolve: (ref: string) => Promise.resolve(tokens.resolve(ref)),
      themes: () => Promise.resolve(tokens.themes()),
    },

    media,

    compose: {
      // Composition means "render another Lolly tool as my image", which needs
      // lolly.tools. A panel that phoned home would break the plugin's promise
      // that nothing leaves the browser, so it resolves to nothing and the tool
      // falls back to its own placeholder.
      renderUrl: () => Promise.resolve(null),
      render: unsupported('Composing another tool') as never,
    },

    state: {
      save: () => Promise.resolve(),
      load: () => Promise.resolve(null),
      list: () => Promise.resolve([]),
      delete: () => Promise.resolve(),
    },

    clipboard: {
      writeText: (text: string) => navigator.clipboard.writeText(text),
      writeImage: unsupported('Copying images') as never,
    },

    export: {
      // Never called: the panel reads runtime.getHydrated() (already an SVG
      // document) and posts it to the sandbox, which is the whole delivery path.
      render: unsupported('Rendering') as never,
      download: unsupported('Downloading') as never,
      file: unsupported('Downloading') as never,
    },
  };

  return host;
}
