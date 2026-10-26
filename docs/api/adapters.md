# `@supercat1337/router/adapters`

The only layer that converts between Browser URLs (BU) and Router-relative URLs (RRU), in both directions:

- `normalize(href)` — BU → RRU;
- `href(rru)` — RRU → BU.

## `createPathAdapter({ base }) → UrlAdapter`

History API mode. `base` is the app's mount pathname prefix.

```js
const adapter = createPathAdapter({ base: '/app/' });
```

- **`base` is required** unless a `<base href>` with trailing slash exists in the document. Auto-derive from `location.pathname` is refused (`TypeError`) — it gives the wrong base on deep links.
- **`read()`** returns a valid RRU; falls back to `'/'` if `location.pathname` is not under `base`, or if the computed RRU would contain `#`.
- **`write(url, 'push' | 'replace')`** — updates `history`.
- **`listen(cb)`** — subscribes to `popstate`.
- **`normalize(href)`** — returns RRU or `null` (cross-origin, non-http(s) scheme, outside base, same-document hash).
- **SSR:** `read()` returns `'/'`; `write` / `listen` are no-ops. Still needs explicit `base`.

## `createHashAdapter({ base? }) → UrlAdapter`

Hash mode (`#/users/5`). Default `base = location.pathname`.

```js
const adapter = createHashAdapter();
// or explicit:
const adapter = createHashAdapter({ base: '/app/' });
```

- **`read()`** returns RRU or `'/'` if the hash is not RRU-shaped (`#section`, `#/users#x`). SSR: throws `TypeError` (no hash without a browser).
- **SSR:** explicit `base` required.
- **In-page anchors** (`#section`) in hash mode are not supported via `href` — use `scrollIntoView` after `afterEnter`.

## `href(rru, opts?) → string`

Build a Browser URL from an RRU. **Required** — used by `<Link>` components and SSR.

- **Path mode:** `base + rru.slice(1)`. Search in the RRU (`?tab=1`) passes through.
- **Hash mode:** `base + search + '#' + rru`, where `search` defaults to `location.search`. Override via `opts.search` (needed in SSR, where `location` is absent). `opts.search` must be `''` or start with `?`.

```js
const a = createPathAdapter({ base: '/app/' });
a.href('/users/5'); // '/app/users/5'
a.href('/users/5?tab=1'); // '/app/users/5?tab=1'

const h = createHashAdapter();
h.href('/users/5'); // '/app?x=1#/users/5' (if location.search is '?x=1')
h.href('/users/5', { search: '' }); // '/app#/users/5'
```

Throws `TypeError` if `rru` does not start with `/`, or (hash mode only) if `opts.search` does not start with `?`.

Round-trip invariant (path mode, no same-document hash): `adapter.normalize(adapter.href(rru)) === rru`.

## `historyState() → unknown` and `replaceState(state) → void`

Read and write `history.state` **without changing the URL** — for scroll restoration and app-level per-entry state.

```js
adapter.replaceState({ scrollY: 0 });
adapter.historyState(); // { scrollY: 0 }
```

- **Both are required.** Custom adapters that don't track history state must return `null` from `historyState` and be a no-op in `replaceState` — the same contract as built-in adapters in SSR.
- **`historyState()`** returns the current `history.state` (or `null` when unavailable — SSR, non-browser contexts).
- **`replaceState(state)`** replaces the current history entry's state **without changing the URL**. Never triggers `popstate`, never appears in `historyCalls` in test mocks.

## `UrlAdapter` interface

```ts
export interface UrlAdapter {
    read(): string;
    write(url: string, mode: 'push' | 'replace'): void;
    listen(cb: (event: PopStateEvent | HashChangeEvent) => void): () => void;
    normalize(href: string): string | null;
    href(rru: string, opts?: HrefOptions): string;
    historyState(): unknown;
    replaceState(state: unknown): void;
    readonly base?: string;
}

export interface HrefOptions {
    search?: string;
}
```

All methods are **required** except `base`. Custom adapters (Electron, Tauri, memory, iframe) implement the full interface:

- `read()` must return a valid RRU (starts with `/`, no `#`, non-empty).
- `href()` must be the inverse of `normalize()` for in-scope URLs.
- `historyState()` / `replaceState()` must be present. Adapters without history-state tracking should return `null` / no-op — do not omit the methods.

## See also

- [`docs/ssr.md`](../ssr.md) — SSR-specific behavior (`href` in SSR, `opts.search`).
- [`docs/getting-started.md`](../getting-started.md) — adapter setup in the quick start.
