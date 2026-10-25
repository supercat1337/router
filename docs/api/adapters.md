# `@supercat1337/router/adapters`

The only layer that converts between Browser URLs (BU) and Router-relative URLs (RRU).

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

## `UrlAdapter` interface

```ts
export interface UrlAdapter {
    read(): string;
    write(url: string, mode: 'push' | 'replace'): void;
    listen(cb: (event: PopStateEvent | HashChangeEvent) => void): () => void;
    normalize(href: string): string | null;
    readonly base?: string;
}
```

Custom adapters (Electron, Tauri, memory, iframe) implement this interface. `read()` must return a valid RRU (starts with `/`, no `#`, non-empty).

## See also

- [`docs/ssr.md`](../ssr.md) — SSR-specific behavior.
- [`docs/getting-started.md`](../getting-started.md) — adapter setup in the quick start.
