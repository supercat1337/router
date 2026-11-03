# How to write a custom adapter

The `UrlAdapter` is the only layer that knows about Browser URLs (BU).
The core works in Router-relative URLs (RRU) — `read()` returns an RRU,
`write(url, mode)` accepts an RRU, `normalize(href)` converts a BU or
`href` to an RRU or `null`, `href(rru)` converts the other way.

Path and hash adapters cover most cases. Custom adapters are for
**non-browser environments** — Electron (`file://`), Tauri (custom
protocol), iframe, native shells with custom URL schemes.

## The interface

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
```

All methods are **required** except `base`. There is no such thing as a
partial `UrlAdapter`.

## The invariants

These are not optional — the core depends on them:

| Invariant                                                           | Why                                                                   |
| :------------------------------------------------------------------ | :-------------------------------------------------------------------- |
| `read()` starts with `/`, no `#`, non-empty                         | The router treats the value as an RRU; anything else is `invalid-rru` |
| `normalize(href(rru)) === rru` (path mode, no same-doc hash)        | Required for `attachLinks` / `attachActiveLinks` round-trip           |
| `href(rru)` throws `TypeError` if `rru` doesn't start with `/`      | Runtime contract; `attachLinks` relies on it                          |
| `historyState()` returns `null` when unavailable                    | SSR, non-browser, or adapters that don't track state                  |
| `replaceState(state)` never changes the URL, never fires `popstate` | It's a `history.state` write, not a navigation                        |
| `listen(cb)` returns an idempotent unsubscribe                      | The router calls it once, then relies on the return value             |

## Example: Electron `file://`

Electron loads the app from `file:///…/index.html`. `history.pushState`
works but the origin is `'null'`, and relative URLs are file paths. Two
ways to handle it:

**Option A — use path adapter, it works on `file://`.** `location.origin`
is the string `'null'`, so a cross-origin check is `abs.origin !== 'null'`
— which `createPathAdapter` already handles via the protocol check
(`http:` / `https:` only). Use it directly:

```js
import { createPathAdapter } from '@supercat1337/router/adapters';
const adapter = createPathAdapter({ base: '/app/' });
```

**Option B — custom scheme.** If your build serves the app from
`app://myapp/…` (common for security), write an adapter:

```js
export function createAppProtocolAdapter({ base = '/app/' } = {}) {
    return {
        base,
        read() {
            if (typeof location === 'undefined') return '/';
            const path = location.pathname;
            if (!path.startsWith(base)) return '/';
            const rru = '/' + path.slice(base.length) + location.search;
            return rru.includes('#') ? '/' : rru;
        },
        write(url, mode) {
            if (typeof history === 'undefined') return;
            const full = base + url.slice(1);
            history[mode === 'push' ? 'pushState' : 'replaceState'](null, '', full);
        },
        listen(cb) {
            if (typeof addEventListener === 'undefined') return () => {};
            addEventListener('popstate', cb);
            return () => removeEventListener('popstate', cb);
        },
        normalize(href) {
            const abs = new URL(href, location.href);
            if (abs.protocol !== 'app:') return null;
            if (!abs.pathname.startsWith(base)) return null;
            const rest = abs.pathname.slice(base.length);
            return '/' + rest + abs.search;
        },
        href(rru) {
            if (typeof rru !== 'string' || !rru.startsWith('/')) {
                throw new TypeError(`expected RRU starting with '/', got ${JSON.stringify(rru)}`);
            }
            return base + rru.slice(1);
        },
        historyState() {
            return typeof history !== 'undefined' ? history.state : null;
        },
        replaceState(state) {
            if (typeof history === 'undefined' || typeof location === 'undefined') return;
            history.replaceState(state, '', location.href);
        },
    };
}
```

This is `createPathAdapter` with the origin check replaced by a protocol
check. Most custom adapters are variations of this — pick the BU format,
map it to RRU.

## Example: Tauri custom protocol

Tauri serves the app from `tauri://localhost/…`. Same shape as above:

```js
export function createTauriAdapter({ base = '/app/' } = {}) {
    return {
        // ... same as app-protocol, with `abs.protocol !== 'tauri:'`
        //     and `location.origin !== 'tauri://localhost'` in normalize.
    };
}
```

The point of the example: the adapter is **small** (8 methods, ~80
lines) — don't try to generalize. Write exactly what your environment
needs, test the invariants.

## Example: iframe (parent postMessage)

An iframe whose parent controls the URL. The adapter reads from a
`postMessage`-delivered URL, writes by posting to the parent:

```js
export function createIframeAdapter() {
    let current = '/';
    /** @type {Array<(e: PopStateEvent | HashChangeEvent) => void>} */
    const listeners = [];

    window.addEventListener('message', e => {
        if (e.data?.type === 'router:url') {
            current = e.data.url;
            for (const cb of listeners) cb(e);
        }
    });

    return {
        base: '/',
        read: () => current,
        write(url, mode) {
            current = url;
            window.parent.postMessage({ type: 'router:write', url, mode }, '*');
        },
        listen(cb) {
            listeners.push(cb);
            return () => {
                const i = listeners.indexOf(cb);
                if (i >= 0) listeners.splice(i, 1);
            };
        },
        normalize(href) {
            return href.startsWith('/') ? href : null;
        },
        href(rru) {
            if (!rru.startsWith('/')) throw new TypeError('expected RRU');
            return rru;
        },
        historyState: () => null,
        replaceState() {},
    };
}
```

`normalize` and `href` are minimal — the adapter works entirely in RRU,
the parent handles the BU translation. That's a valid choice when the
BU format is not yours.

## SSR semantics

The adapter is instantiated in SSR. It must not throw at construction,
and `read()` must not throw:

```js
read() { if (typeof location === 'undefined') return '/'; /* ... */ }
write(url, mode) { if (typeof history === 'undefined') return; /* ... */ }
listen(cb) { if (typeof addEventListener === 'undefined') return () => {}; /* ... */ }
historyState() { return typeof history !== 'undefined' ? history.state : null; }
replaceState(state) { if (typeof history === 'undefined') return; /* ... */ }
```

`normalize` is not called in SSR (`attachLinks` is a no-op outside the
browser) — behavior is undefined, but it shouldn't throw. All built-in
adapters follow this.

## Testing

Test the invariants, not the implementation:

```js
import { createMemoryAdapter } from '@supercat1337/router/testing';

// The memory adapter is the reference — every custom adapter should
// pass the same tests.
const a = createMemoryAdapter('/login');
t.is(a.read(), '/login');
t.is(a.href('/profile'), '/profile');
t.is(a.normalize(a.href('/profile')), '/profile');
```

For your adapter, the same tests plus environment-specific setup:

```js
// Path adapter round-trip
const a = createPathAdapter({ base: '/app/' });
t.is(a.normalize(a.href('/users/5?tab=1')), '/users/5?tab=1');
t.is(a.href('/'), '/app/');
```

## Don't

-   **Don't** omit `historyState` / `replaceState` — they're required.
    Return `null` / no-op if your environment doesn't have them.
-   **Don't** change the URL from `replaceState` — it's a `history.state`
    write. For URL changes, use `write`.
-   **Don't** fire `listen` callbacks from `write` — only browser
    popstate / hashchange should trigger `listen`. Programmatic `write` is
    the router's own action; re-emitting it would cause a double commit.
-   **Don't** return a `href` that doesn't round-trip through `normalize`
    (path mode, no same-document hash) — `attachLinks` relies on it.
-   **Don't** throw from `normalize` — return `null` for "not a router URL".
    The caller (attachLinks) interprets `null` as "let the browser handle
    it".
-   **Don't** try to unify path / hash / Electron / Tauri in one adapter
    with options. They differ enough; three small files are easier than
    one large one.

## See also

-   [`api/adapters.md`](../api/adapters.md) — full `UrlAdapter` reference,
    path / hash semantics, `href` / `normalize` details.
-   [`api/testing.md`](../api/testing.md) — `createMemoryAdapter`.
-   [`ssr.md`](../ssr.md) — SSR-specific behavior.
