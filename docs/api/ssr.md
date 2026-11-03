# `@supercat1337/router/ssr`

Server-side `UrlAdapter` and SSR hydration helpers. Four functions, no
framework dependency. The core router is already SSR-ready — the initial
transaction runs on the server — this module closes the four boilerplate
gaps that every SSR app writes by hand.

```sh
npm i @supercat1337/router
```

```js
import {
    createServerAdapter,
    serializeState,
    readInitialState,
    assertHydration,
} from '@supercat1337/router/ssr';
```

The `/ssr` subpath is version-locked to core — `@supercat1337/router@0.9.0`
ships `/ssr` at `0.9.0`.

## The pattern

```
server:
  createRouter(adapter: createServerAdapter(req))  ← initial snapshot = req.url
  snapshot = router.getSnapshot()                   ← synchronous
  data = await loadData(snapshot)                   ← blocking, BEFORE render
  html = renderView(snapshot, data)
  embed: window.__INITIAL_STATE__ = serializeState(state)

client:
  state = readInitialState()
  router = createRouter(adapter: createPathAdapter())
  assertHydration(serverSnapshot, router)           ← dev check
  attachLinks(router)
  router.on('afterEnter', async ({ snapshot }) => {
      const data = await loadData(snapshot)         ← same loader, after nav
      if (router.isCurrent(snapshot.navigationId)) rerender(snapshot, data)
  })
```

`afterEnter` does **not** fire for the initial commit — the server already
rendered that HTML. The client's `afterEnter` hook is for subsequent
navigations only.

A full working example: [`examples/ssr/`](../../examples/ssr/) — ~200
lines, no framework, no bundler.

## `createServerAdapter(req, opts?) → UrlAdapter`

Server-side `UrlAdapter` that reads from `req.url` (or `req.originalUrl`).
Without it, `createPathAdapter().read()` returns `'/'` in SSR (documented
in [`docs/ssr.md`](../ssr.md)), and the initial snapshot commits `/`
regardless of the request URL.

```js
const router = createRouter({
    resolveMap,
    getState,
    adapter: createServerAdapter(req, { base: '/app/' }),
});

router.getSnapshot().url; // '/users/5' — from req.url, not '/'
router.getSnapshot().navigationType; // 'initial'
```

| Option | Type     | Default | Notes                                                         |
| :----- | :------- | :------ | :------------------------------------------------------------ |
| `base` | `string` | `'/'`   | Mount prefix, same semantics as `createPathAdapter({ base })` |

`req.originalUrl` (Express) takes precedence over `req.url` — the mount
base is stripped correctly when Express rewrites `req.url` for a mounted
router.

**Do not use on the client.** `req.url` does not exist in the browser. Use
`createPathAdapter` / `createHashAdapter`.

**Adapter methods:**

-   `read()` — returns the RRU derived from `req.url` and `base`. Falls
    back to `'/'` if `req.url` is outside `base`.
-   `href(rru)` — `base + rru.slice(1)`. Same as path adapter.
-   `write` / `listen` / `replaceState` — no-ops. No history on the server.
-   `normalize` — returns `null`. `attachLinks` is a no-op in SSR; comparing
    a URL without `location` is undefined behaviour.
-   `historyState` — returns `null`.

## `serializeState(state) → string`

XSS-safe JSON for embedding in an HTML `<script>` tag.

```js
res.end(`<!DOCTYPE html>
<html><body>
    <div id="app">${html}</div>
    <script>window.__INITIAL_STATE__ = ${serializeState(state)};</script>
</body></html>`);
```

`JSON.stringify` alone is unsafe — a `</script>` in the payload closes the
script tag early, `<!--` opens an HTML comment, and `\u2028` / `\u2029`
(line / paragraph separators) are legal in JSON strings but break JS
parsing in older engines.

`serializeState` escapes `<`, `>`, `&`, `\u2028`, `\u2029`. The output is
a valid JS expression when embedded inside a `<script>` tag and parsed as
JSON. Round-trips with `JSON.parse` unchanged.

```js
serializeState({ html: '</script><script>alert(1)</script>' });
// '"{\\"html\\":\\"\\u003c/script\\u003e\\u003cscript\\u003ealert(1)\\u003c/script\\u003e\\"}"'
// — no literal </script>, parsed back to the original string.
```

Throws `TypeError` when `state` is not JSON-serializable (`undefined`,
functions, circular references).

## `readInitialState<T>() → T | null`

Reads the state serialized by `serializeState` on the client. Reads from
`globalThis.__INITIAL_STATE__` — the conventional key for the embedded
script.

```js
const appState = readInitialState() ?? { isAuthed: false };
const router = createRouter({ getState: () => appState, ... });
```

Returns `null` outside the browser (SSR, tests, workers) or when the key
is unset. The generic parameter types the return value — the caller
asserts the shape, the function does not validate.

**Hydration note.** If you re-create the router on the client with
`readInitialState()`, `getState` returns the same data the server used.
This is what makes hydration pass — `resolveMap` and `getState` see the
same `(state, url)` pair on both sides.

## `assertHydration(serverSnapshot, router, opts?) → void`

Dev-only hydration check. Compares the server's initial snapshot with the
client router's committed snapshot.

```js
// server
const serverSnapshot = {
    url: snapshot.url,
    status: snapshot.status,
    params: snapshot.params,
    search: snapshot.search,
};
// embed: window.__SERVER_SNAPSHOT__ = serializeState(serverSnapshot);

// client
assertHydration(window.__SERVER_SNAPSHOT__, router);
```

A mismatch means `resolveMap` or `getState` produced different results on
the two sides — the app will render different content than the server
sent, and hydration will fail (React 18 logs a warning and discards
server HTML; Vue 3 does the same).

**Only four fields are compared:** `url`, `status`, `params`, `search`.
`chain` and `map` are not compared — they contain different object
identities on server and client; structural equality is not meaningful.

| Option  | Type      | Default                     | Notes                                    |
| :------ | :-------- | :-------------------------- | :--------------------------------------- |
| `dev`   | `boolean` | `NODE_ENV !== 'production'` | `false` → no-op                          |
| `throw` | `boolean` | `false`                     | `true` → throw instead of `console.warn` |

No-op in prod. In dev, warns with a diff listing every mismatched field.
With `throw: true`, throws an `Error` — useful in tests and CI, where a
`console.warn` would be lost in output.

The function reads only `serverSnapshot` — it does **not** serialize or
deserialize. You control the format; `assertHydration` expects an already-
parsed object.

## Types

```ts
export type HydrationSnapshot = Pick<Snapshot, 'url' | 'status' | 'params' | 'search'>;
```

Serialize only these four fields for `assertHydration`. `Snapshot` as a
whole contains non-serializable fields (`map` has `WeakMap` indexes,
`chain` has frozen object references).

## What `/ssr` does **not** do

-   **Async data loading before render.** `afterEnter` does not fire for
    the initial commit, so the server must block: `await loadData(snapshot)`
    before render. This is app-specific — `/ssr` cannot know your loader.
    See [`docs/recipes/ssr-hydration.md`](../recipes/ssr-hydration.md) for
    the full pattern.
-   **Route serialization.** The route tree is code, not data —
    `createMap` runs on both server and client with identical input. There
    is nothing to serialize. `resolveMap` is a pure function of
    `(state, url)`.
-   **Streaming SSR.** The core is synchronous; streaming requires
    framework support and is out of scope.
-   **Compression / static assets / HTTP/2.** Infrastructure concerns;
    framework or reverse proxy.

## See also

-   [`docs/ssr.md`](../ssr.md) — conceptual SSR guide.
-   [`docs/recipes/ssr-hydration.md`](../recipes/ssr-hydration.md) — full
    hydration pattern with data loading.
-   [`docs/api/adapters.md`](adapters.md) — `createPathAdapter` /
    `createHashAdapter`, the client-side counterpart.
-   [`examples/ssr/`](../../examples/ssr/) — minimal working example.
