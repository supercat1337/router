# SSR

The core is synchronous; SSR is a natural fit.

## Adapters

- **`createPathAdapter({ base })`** — explicit `base` is required in SSR (`TypeError` otherwise). `read()` returns `'/'`, `write` / `listen` are no-ops.
- **`createHashAdapter({ base })`** — in SSR without `location`, an explicit `base` is required. `read()` **throws** (no hash without a browser).

```js
// Server
import { createPathAdapter } from '@supercat1337/router/adapters';
const adapter = createPathAdapter({ base: '/app/' });

// Client
const adapter = createPathAdapter({ base: '/app/' });
```

## The initial transaction

`createRouter` runs the initial transaction on the server exactly as in the browser — minus the actual history write. `resolveMap` and `getState` are still pure functions.

```js
const router = createRouter({ resolveMap, getState, adapter });
const snapshot = router.getSnapshot(); // read after construction

// Render based on snapshot:
if (snapshot.status === 'matched') {
    html = renderLeaf(snapshot.leaf, snapshot.params);
} else if (snapshot.status === 'notFound') {
    html = render404(snapshot.notFoundResult);
}
```

`subscribe` works on the server, but the **initial commit happens inside `createRouter`**, before any listener can subscribe. Call `getSnapshot()` after construction to read the initial state.

## `attachLinks`, `attachPreload`, `attachActiveLinks`

All three are no-ops outside the browser — you can import and call them unconditionally; they return a no-op `detach`:

```js
const detach = attachLinks(router); // SSR: no-op
```

## Guard layer

Do **not** connect on the server. Access control is on the server; the guard layer is a client-side UX filter, not a security boundary.

```js
// ❌ Do not do this on the server
const { router, nav } = createGuardedRouter({
    /* ... */
});
```

Instead, do access control in your server route handler, then render the appropriate map.

## `getState` and hydration

On the server, `getState` reads from the request context (session, tenant, feature flags). On the client, `getState` reads from hydrated state.

```js
// Server
const getState = () => ({ isAuthed: req.session.isAuthed, tenant: req.tenant });

// Client — hydrate from a serialized initial state
const appState = window.__INITIAL_STATE__;
const getState = () => appState;
```

`state` is not part of `Snapshot` — the router does not serialize it. You serialize it yourself, then re-create the router on the client with the same state and URL. `resolveMap` on the client must produce the same map for the same `(state, url)`.

## Hydration mismatch

The initial snapshot on the client must be **identical** to the server's — otherwise React/Vue hydration warnings. Two rules:

1. **Same `resolveMap`** — pure function of `(state, url)`.
2. **Same initial URL** — server read `req.url`; client read `location.pathname + search`, or use the URL from `createPathAdapter` which reads `location` directly.

Because the core is synchronous, the initial transaction on the client runs **synchronously** before the first render — no flash, no mismatch.

## Do not

- **Don't** try to connect the guard layer on the server — access control belongs in your server handler.
- **Don't** expect `read()` to return the request URL — `createPathAdapter.read()` returns `'/'` in SSR; use `req.url` for the initial URL separately, or provide a custom adapter.
- **Don't** rely on `subscribe` to observe the initial commit — it fires **before** the listener attaches. Read `getSnapshot()` after `createRouter`.
- **Don't** serialize the `Router` — serialize the state and reconstruct on the client.

## See also

- [`docs/api/adapters.md`](api/adapters.md) — `createPathAdapter` / `createHashAdapter` SSR semantics.
- [Snapshots, `navigationId`, `navigationType`](concepts/snapshots.md) — what to render on the server.
- [Transactions are synchronous](concepts/transactions.md) — why SSR is a natural fit.
