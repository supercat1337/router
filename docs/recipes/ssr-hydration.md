# SSR hydration

Server-side render → XSS-safe state embedding → client hydration. This
recipe covers the full pattern with async data loading, which is the part
`/ssr` **cannot** abstract.

Prerequisite: [`docs/api/ssr.md`](../api/ssr.md) — the four functions.

## The two-sided pattern

```
server:                                    client:
  createServerAdapter(req)                    readInitialState()
  createRouter(...)                           createRouter(createPathAdapter())
  snapshot = router.getSnapshot()             assertHydration(serverSnap, router)
  data = await loadData(snapshot)             attachLinks(router)
  html = renderView(snapshot, data)           router.on('afterEnter', loadData)
  embed: __INITIAL_STATE__                    (no initial afterEnter)
         __SERVER_SNAPSHOT__
```

One map, one `resolveMap`, one `loadData`, one `renderView` — **shared
between server and client**. This is why SSR works: the route tree is
code, not data. Nothing about the tree needs to be serialized.

## Server side

```js
// server.js — plain Node.js
import { createServer } from 'node:http';
import { createRouter } from '@supercat1337/router';
import { createServerAdapter, serializeState } from '@supercat1337/router/ssr';
import { resolveMap, getState, loadData, renderView } from './shared.js';

createServer(async (req, res) => {
    // 1. Router with the server adapter — reads req.url.
    const router = createRouter({
        resolveMap,
        getState,
        adapter: createServerAdapter(req),
    });

    // 2. Initial snapshot — synchronous, reflects the request URL.
    const snapshot = router.getSnapshot();

    // 3. Load data BEFORE render. `afterEnter` does not fire for the
    //    initial commit — blocking is the only correct pattern for SSR.
    let data = null;
    try {
        data = await loadData(snapshot);
    } catch (e) {
        console.error('loadData failed:', e);
        // Render without data — `renderView` handles null.
    }

    // 4. Render + embed state. `serializeState` is XSS-safe.
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>App</title></head>
<body>
    <div id="app">${renderView(snapshot, data)}</div>
    <script>window.__INITIAL_STATE__ = ${serializeState(getState())};</script>
    <script>window.__SERVER_SNAPSHOT__ = ${serializeState({
        url: snapshot.url,
        status: snapshot.status,
        params: snapshot.params,
        search: snapshot.search,
    })};</script>
    <script type="module" src="/client.js"></script>
</body>
</html>`);
}).listen(3000);
```

**Why `createServerAdapter` and not `createPathAdapter`:** without it,
the initial snapshot commits `/` regardless of the request URL. The home
page would SSR correctly for `/`, but `/users/5` would render as `404`.
`createServerAdapter(req)` makes `snapshot.url` reflect the request.

**Why `await loadData` and not `afterEnter`:** `afterEnter` fires after
commit. The server needs the data **before** render, in the same tick as
the initial snapshot. This is the fundamental difference between CSR and
SSR — the client can commit an empty shell and load data after; the
server must send complete HTML.

## Client side

```js
// client.js
import { createRouter } from '@supercat1337/router';
import { createPathAdapter } from '@supercat1337/router/adapters';
import { attachLinks } from '@supercat1337/router/links';
import { readInitialState, assertHydration } from '@supercat1337/router/ssr';
import { resolveMap, loadData, renderView } from './shared.js';

// 1. Same state as the server — no refetch, no flash.
const state = readInitialState() ?? {};

const router = createRouter({
    resolveMap,
    getState: () => state,
    adapter: createPathAdapter({ base: '/' }),
});

// 2. Dev-only hydration check. Warns if resolveMap/getState produced
//    different results on server and client — the #1 cause of mismatch.
assertHydration(window.__SERVER_SNAPSHOT__, router);

// 3. Delegated click interception.
attachLinks(router);

// 4. Client-side data loading for subsequent navigations.
//    Does NOT fire for the initial commit — server already rendered that.
router.on('afterEnter', async ({ snapshot }) => {
    const data = await loadData(snapshot);
    if (!router.isCurrent(snapshot.navigationId)) return; // superseded
    document.getElementById('app').innerHTML = renderView(snapshot, data);
});
```

## The shared loader

`loadData` must be **the same function** on both sides. If server loads
via `fetch('/api/users/5')` and client via a different path, the returned
data will differ and hydration will warn.

```js
// shared.js
import { isFile } from '@supercat1337/router';

export async function loadData(snapshot) {
    if (!isFile(snapshot.leaf)) return null;
    switch (snapshot.leaf.name) {
        case 'user':
            return fetch(`/api/users/${snapshot.params.id}`).then(r => r.json());
        case 'home':
            return fetch('/api/home').then(r => r.json());
        default:
            return null;
    }
}
```

If you use TanStack Query on the client (recommended for cache /
deduplication), see
[`afterEnter-tanstack-query.md`](afterEnter-tanstack-query.md). The
server-side call becomes `queryClient.fetchQuery({ queryKey, queryFn })`
— but the `queryFn` is the **same** `loadData` that the client uses.

## Common mistakes

### 1. `afterEnter` on the server

```js
// ❌ Never fires — the initial commit happened inside createRouter.
router.on('afterEnter', async ({ snapshot }) => {
    const data = await loadData(snapshot);
    render(data);
});
```

`subscribe` works on the server, but the initial commit is before any
listener can attach. The server must load data synchronously — `await`
around the transaction, not inside a listener.

### 2. Different `resolveMap` or `getState` on server and client

```js
// server
const getState = () => ({ isAuthed: req.session.user != null });

// client
const getState = () => ({ isAuthed: localStorage.getItem('token') != null });
```

If the server sees `isAuthed: true` and the client sees `false`, they
resolve different maps and render different trees. `assertHydration`
will warn — that's what it's for. Fix: serialize the server's `getState`
result, hydrate it on the client, use it as the client's `getState`.

```js
// server
const state = { isAuthed: req.session.user != null };
// embed: serializeState(state)
// client
const state = readInitialState(); // { isAuthed: true } — same object
const router = createRouter({ getState: () => state, ... });
```

### 3. Forgetting `serializeState`

```js
// ❌ XSS — a </script> in the payload closes the tag.
`<script>window.__INITIAL_STATE__ = ${JSON.stringify(state)}</script>`;
```

Use `serializeState(state)` — it escapes `<`, `>`, `&`, `\u2028`, `\u2029`.
Round-trips with `JSON.parse` unchanged.

### 4. Running `assertHydration` in production

```js
// ❌ Wastes CPU and logs on every page load.
assertHydration(serverSnapshot, router);
```

No-op by default when `NODE_ENV === 'production'`. If you control
`dev` elsewhere, pass `{ dev: false }` explicitly. For tests, pass
`{ throw: true }` so a mismatch fails CI instead of being swallowed by
`console.warn`.

### 5. Trying to serialize `Snapshot.map` or `Snapshot.chain`

```js
// ❌ map has WeakMap indexes, chain has frozen object references.
JSON.stringify(snapshot); // → "{}" or throws on cycles.
```

Serialize only what the client needs: `url`, `status`, `params`, `search`
for `assertHydration`; `state` (from `getState`) for `readInitialState`.
The route tree is code — the client re-creates it.

## Don't

-   **Don't** call `router.navigate(req.url)` on the server to fix the
    initial snapshot. It starts a second transaction with
    `navigationType: 'push'` — `assertHydration` will compare against the
    wrong source. Use `createServerAdapter(req)`.
-   **Don't** use `createServerAdapter` on the client. It reads `req.url`
    which does not exist in the browser.
-   **Don't** load data in `resolveMap` or `notFound` — both are
    synchronous by contract (`resolver-promise` / `notFound-promise`).
-   **Don't** cache loader results across requests with a module-level
    variable. `loadData` runs in a fresh request context; caching belongs
    in a per-request cache or in TanStack Query on the client.

## Don't do SSR at all if

-   **You don't need SEO / first-paint performance.** CSR is simpler — no
    hydration, no dual `getState`, no `afterEnter` split. `router-react` v1
    is CSR-only for this reason.
-   **Your app has heavy client-only state** (auth tokens in `localStorage`,
    WebSocket connections). SSR cannot see them; the client will re-render
    anyway.
-   **You're on a framework with its own SSR** (Next.js, Nuxt, SvelteKit).
    Those have their own router + hydration. `@supercat1337/router` is
    framework-agnostic; using it inside framework SSR is possible but
    bypasses the framework's own conventions.

## See also

-   [`docs/api/ssr.md`](../api/ssr.md) — full `/ssr` reference.
-   [`docs/ssr.md`](../ssr.md) — conceptual SSR guide.
-   [`docs/recipes/data-loading.md`](data-loading.md) — `afterEnter` +
    `isCurrent` for the client-only case.
-   [`docs/recipes/afterEnter-tanstack-query.md`](afterEnter-tanstack-query.md)
    — cache + dedupe for `loadData`.
-   [`examples/ssr/`](../../examples/ssr/) — runnable example, no
    framework, no bundler.
