# Snapshots, `navigationId`, `navigationType`

The `Snapshot` is the router's committed state after a transaction. It is the single source of truth for "what is the current route". This page covers:

- **Pull vs push** — `getSnapshot` vs `subscribe`.
- **Immutability** — what's frozen, what's not.
- **`navigationId`** — transaction id, not history position.
- **`navigationType`** — transaction source, not history direction.

## Pull and push

Two ways to read the router's state:

```js
router.getSnapshot();               // pull — current state, synchronously
router.subscribe(snap => { ... });  // push — fires on every commit
```

Plus event-specific hooks:

```js
router.on("beforeLeave", ({ suffix, snapshot }) => { ... });
router.on("afterEnter",  ({ suffix, snapshot }) => { ... });
router.on("mapChanged",  ({ oldMap, newMap, snapshot }) => { ... });
router.on("navigationError", ({ type, error, snapshot }) => { ... });
router.on("commit",       ({ snapshot }) => { ... }); // == subscribe, as an event
```

Listeners are notified; return value is ignored. A `throw` inside a listener is caught (`onListenerError` hook, `console.error` fallback) and does **not** break the chain.

### Why `subscribe` exists

The "stitch together `afterEnter` / `afterLeave` / `mapChanged` / `navigationError`" pattern is subtly wrong:

- `revalidate()` with an unchanged URL commits a new snapshot but emits **no** `beforeEnter` / `afterEnter` (empty suffix);
- prod error snapshots emit only `navigationError`.

A framework adapter that listens to the four enter/leave/map events will miss both. `subscribe` fires **exactly once per commit** — it is the only correct hook for `useSyncExternalStore` / Vue `shallowRef`.

## Snapshot and Router are frozen

Every `Snapshot` is deeply frozen at runtime — `chain`, `params`, `partialParams`, `search`, and the `error` sub-object. The `Router` returned by `createRouter` is frozen too: `router.navigate = customFn` throws in strict mode. This makes "committed" a real contract for both.

Official extension points (all present before freeze):

- `attachLinks(router, { navigate, replace })` — override click handling;
- `guard.navigate()` — guard-aware navigate/replace;
- `router.subscribe(fn)` — observe every commit;
- `router.on(event, fn)` — observe specific events.

`adapter` is **not** frozen: test doubles mutate themselves, and freezing `adapter` would break test setups that patch `adapter.write`.

Two snapshot fields are app-owned and **not** frozen:

- `notFoundResult` — whatever your `notFound` handler returned;
- `error.error` — the original exception from `resolver-throw` / `notFound-throw`.

`snapshot.leaf` is a convenience — it's `chain[chain.length - 1]` or `undefined` for an empty chain (`notFound` / `error` at the root).

## `navigationId` — transaction id, not history position

Monotonic within the document. Increments on **every** transaction — including `revalidate()` even when nothing changed.

The only supported pattern is **correlating async work with the transaction** that started it:

```js
router.on('afterEnter', ({ snapshot }) => {
    const id = snapshot.navigationId;
    loadData(snapshot).then(data => {
        if (!router.isCurrent(id)) return; // stale — a newer transaction committed
        render(snapshot, data);
    });
});
```

**Not usable as:**

- a history position;
- a back/forward indicator;
- a "remount key" — compare `url` / `params` for that.

## `navigationType` — transaction source, not history direction

`navigationType` records **what triggered** the commit:

| Value          | Source                                                   |
| :------------- | :------------------------------------------------------- |
| `'initial'`    | the first commit inside `createRouter`                   |
| `'push'`       | `router.navigate(url)`                                   |
| `'replace'`    | `router.replace(url)`                                    |
| `'pop'`        | a `popstate` / `hashchange` from the browser             |
| `'revalidate'` | `router.revalidate()` — recompute without moving the URL |

```js
router.navigate('/profile');
router.getSnapshot().navigationType; // 'push'

router.replace('/profile');
router.getSnapshot().navigationType; // 'replace'

appState.isAuthed = true;
router.revalidate();
router.getSnapshot().navigationType; // 'revalidate'

// browser back/forward → 'pop'
```

Use it where the **kind** of transition matters: analytics, animation direction (popstate usually needs a different transition than push), scroll-restoration policy (`navigationType !== 'pop'` → scroll to top, `'pop'` → restore).

### Two properties to remember

1. **It's not a direction indicator.** A guard that redirects during a `popstate` commits via `router.replace(...)`, so the resulting snapshot has `navigationType: 'replace'`, not `'pop'`.
2. **It's not a "go back" button.** `router.back()` / `router.forward()` delegate to `history.back()` / `history.forward()`; the resulting commit arrives through the `popstate` listener as `'pop'`.

On error snapshots, `navigationType` reflects the **attempted** transaction, not the previous commit — a `resolver-throw` during `navigate()` produces `navigationType: 'push'`, not `'initial'`.

Direction (back vs forward) is deliberately **not** part of `Snapshot`: it would require stateful tracking in the adapter (`history.state.__idx`), which breaks the `(state, url) → map` contract and the guard layer's rollback/redirect semantics. For back/forward direction, track `history.state` yourself or use a companion adapter package.

## See also

- [Transactions are synchronous](transactions.md) — how a snapshot is produced.
- [`Router.subscribe` in AGENTS.md](../../AGENTS.md) — the framework-integration hook.
- [`docs/recipes/data-loading.md`](../recipes/data-loading.md) — the `isCurrent` pattern in practice.
