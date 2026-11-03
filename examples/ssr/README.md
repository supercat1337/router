# SSR example

Minimal server-side rendering with `@supercat1337/router` — no framework,
no bundler, no build step. ~200 lines across four files.

## Run

```sh
cd examples/ssr
npm install
npm start
# → http://localhost:3000/
```

Open http://localhost:3000/. Try:

-   `/` — home page (root `index` route)
-   `/users/1`, `/users/2` — server-rendered user data
-   `/about` — static page
-   `/missing` — server-rendered 404 (`notFound` handler)

View source to see the SSR-rendered HTML.

## What this demonstrates

| Concern                                 | Where                                                   |
| :-------------------------------------- | :------------------------------------------------------ |
| Server reads `req.url` instead of `'/'` | `server.js` → `createServerAdapter(req)`                |
| XSS-safe state embedding                | `server.js` → `serializeState(state)`                   |
| Client reads the initial state          | `client.js` → `readInitialState()`                      |
| Dev-only hydration check                | `client.js` → `assertHydration(serverSnapshot, router)` |
| **Data loading before render**          | `server.js` → `await loadData(snapshot)`                |
| **Same loader on client**               | `client.js` → `router.on('afterEnter', ...)`            |

## Files

-   **`shared.js`** — the map, `resolveMap`, `getState`, `loadData`,
    `renderView`. Runs on **both** server and client. This is why SSR works:
    the route tree is code, not data — no serialization of routes.
-   **`server.js`** — plain Node.js HTTP server. `createServerAdapter`,
    `await loadData`, `serializeState` → HTML response.
-   **`client.js`** — `readInitialState`, `createRouter`, `assertHydration`,
    `attachLinks`, `afterEnter` for client-side navigations.

## The pattern

```
server:
  createRouter(adapter: createServerAdapter(req))   ← initial snapshot = req.url
  snapshot = router.getSnapshot()                    ← synchronous
  data = await loadData(snapshot)                    ← blocking, BEFORE render
  html = renderView(snapshot, data)
  embed: window.__INITIAL_STATE__ = serializeState(state)

client:
  state = readInitialState()
  router = createRouter(adapter: createPathAdapter())
  assertHydration(serverSnapshot, router)            ← dev check
  attachLinks(router)
  router.on('afterEnter', async ({ snapshot }) => {
      const data = await loadData(snapshot)          ← same loader, after nav
      if (router.isCurrent(snapshot.navigationId)) rerender(snapshot, data)
  })
```

**`afterEnter` does not fire for the initial commit** — the server already
rendered that HTML. The client's `afterEnter` hook is for subsequent
navigations only. This is documented in `docs/ssr.md`.

## What's not here

-   **Framework integration** — this is vanilla JS. For React, use
    `createRouterComponents` from `@supercat1337/router-react` (separate
    package).
-   **Cache / deduplication** — `loadData` runs on every navigation. In a
    real app, wrap it in a cache (TanStack Query, LRU, `@supercat1337/persist-core`).
    See `docs/recipes/afterEnter-tanstack-query.md`.
-   **State-relative maps** — single map here. For guest/user/admin, see
    `docs/recipes/auth-maps.md`.
-   **Streaming SSR** — not supported; the core is synchronous.
-   **HTTP/2, compression, static assets** — out of scope for an example.

## See also

-   [`docs/api/ssr.md`](../../docs/api/ssr.md) — full API reference.
-   [`docs/recipes/ssr-hydration.md`](../../docs/recipes/ssr-hydration.md) —
    the full hydration pattern (this example is a subset).
-   [`docs/ssr.md`](../../docs/ssr.md) — conceptual SSR guide.
-   [`examples/vanilla-spa`](../vanilla-spa/) — CSR with state-relative maps.
