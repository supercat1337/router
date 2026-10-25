# Devtools

The router exposes a **dev-only side channel** so devtools extensions can discover and inspect live router instances — without any of it being part of the public API.

## Install the hook **before** `createRouter`

```js
globalThis.__SUPERCAT_ROUTER_DEVTOOLS__ = {
    register(router) {
        // Called synchronously from createRouter (dev mode only).
        // The router has the full runtime surface:
        //   router.getSnapshot()   → current committed Snapshot
        //   router.getHistory()    → last 50 committed snapshots (dev-only)
        //   router.subscribe(fn)   → every future commit
        //   router.adapter.base    → distinguishes multiple routers
        myDevtoolsPanel.attach(router);
    },
};

const router = createRouter({ resolveMap, getState, adapter });
// → __SUPERCAT_ROUTER_DEVTOOLS__.register(router) has been called
```

## Contract

- Read from `globalThis.__SUPERCAT_ROUTER_DEVTOOLS__` **inside** `createRouter`, only when `dev: true` (or `NODE_ENV !== 'production'`).
- `register(router)` is called synchronously **before** `createRouter` returns.
- If `register` throws, the error is swallowed — devtools must not break the app.
- Multiple routers → multiple `register` calls. No `unregister`: routers live for the page lifetime. Track via `WeakRef` if you need to.
- The hook and its shape are **not** part of the public API. No semver commitment on `register` beyond the contract above.

## Why not a `window` event

Events are stateless — an extension installed **after** the first commit misses history. `register` hands the extension the router instance, so it can pull `getHistory()` and `getSnapshot()` immediately, then subscribe for future commits.

## `Symbol.toStringTag`

The router sets `Symbol.toStringTag = 'Router'`, so DevTools shows `Router { adapter, navigate, ... }` instead of `{ ... }`. This is automatic — no setup needed.

## Typical devtools flow

```js
register(router) {
    // 1. Pull current state
    const snap = router.getSnapshot();

    // 2. Pull history (dev-only API)
    const history = router.getHistory();   // Snapshot[] — last 50

    // 3. Subscribe for future commits
    const unsubscribe = router.subscribe(s => panel.update(s));

    // 4. Distinguish routers
    const label = router.adapter.base ?? 'memory';

    // 5. Track lifetime
    panel.addRouter(label, { router, unsubscribe });
}
```

## Don't

- **Don't** use the devtools hook in application code — it's a side channel for extensions.
- **Don't** call `getHistory` / `dryMatch` / `getActiveMap` / `resolveMapFor` / `getRedirectPath` in application code — they're `@internal` and stripped from `dist/types.d.ts`.
- **Don't** rely on `register` receiving a stable identity — a router per page is fine, but the hook may be called multiple times.

## For interactive debugging

For quick console inspection, use:

```js
router.getSnapshot();
router.subscribe(s => console.log(s));
```

No hook installation needed.

## See also

- [`docs/api/README.md`](../api/README.md) — dev-only methods.
- [Snapshots, `navigationId`, `navigationType`](../concepts/snapshots.md) — what to inspect.
