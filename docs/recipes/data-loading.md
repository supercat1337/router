# Data loading with loading / error UI

Optimistic: commit the RRU synchronously, render a skeleton, load data, render content. A loading failure is **page state** — it does not roll back the URL.

```js
let viewState = { loading: false, error: null, data: null };

router.on('afterEnter', async ({ snapshot }) => {
    const id = snapshot.navigationId;
    viewState = { loading: true, error: null, data: null };
    render(viewState);

    try {
        const data = await loadData(snapshot);
        if (!router.isCurrent(id)) return; // superseded
        viewState = { loading: false, error: null, data };
        render(viewState);
    } catch (error) {
        if (!router.isCurrent(id)) return;
        viewState = { loading: false, error, data: null };
        render(viewState);
    }
});
```

## Why optimistic

The alternative — blocking commit until data is loaded — is a **non-goal**:

- it contradicts the synchronous commit (`navigate()` must return a `Snapshot`);
- `popstate` cannot be blocked — the browser URL is already changed, so rollback is impossible without fighting the browser;
- it couples URL state to data-fetch success, which produces surprising "URL bounced back" UX.

The optimistic model is honest: **the URL reflects user intent, not data success**. A failed load is a page-level error, not a navigation failure — the user can retry, navigate away, or use browser back, all with predictable behavior.

## The `isCurrent` pattern

Every async continuation **must** check `isCurrent(id)`:

```js
const id = snapshot.navigationId;
const data = await loadData(snapshot);
if (!router.isCurrent(id)) return; // a newer transaction committed; discard
render(snapshot, data);
```

Without it:

- a slow `await` on `/users/5` can render **after** a fast navigation to `/users/6`, showing stale data under the new URL;
- a back/forward burst can produce out-of-order renders;
- `revalidate()` bumps `navigationId` even without a URL change, so re-renders interleave.

`isCurrent` is a monotonic equality check against the current `navigationId`. It's the **only** supported race-safety primitive. Do not compare URLs — `revalidate()` keeps the URL stable but changes the id.

## Loading state per route

If you want per-route loading UI (e.g. skeleton for `/users/:id`, spinner for `/admin`), store `viewState` per `snapshot.leaf.name` and clear on leave:

```js
const viewStates = new Map(); // leaf.name → { loading, error, data }

router.on('afterEnter', async ({ snapshot }) => {
    const leaf = snapshot.leaf;
    if (!isFile(leaf)) return;
    const id = snapshot.navigationId;

    viewStates.set(leaf.name, { loading: true });
    render(snapshot, viewStates.get(leaf.name));

    try {
        const data = await loadData(snapshot);
        if (!router.isCurrent(id)) return;
        viewStates.set(leaf.name, { loading: false, data });
        render(snapshot, viewStates.get(leaf.name));
    } catch (error) {
        if (!router.isCurrent(id)) return;
        viewStates.set(leaf.name, { loading: false, error });
        render(snapshot, viewStates.get(leaf.name));
    }
});
```

## Do not

- **Do not** wrap `loadData` in `resolveMap` — `resolveMap` must be synchronous. `resolver-promise` is a contract violation.
- **Do not** wrap `loadData` in `notFound` — same reason (`notFound-promise`).
- **Do not** roll back the URL on load failure — the URL is a fact, not a promise.
- **Do not** skip `isCurrent(id)` — the pattern above is a bug magnet without it.
- **Do not** use `navigationId` as a React `key` — use `url` / `params` / `leaf.name` for identity.

## For blocking loaders

If a route **must** have its data before the URL commits (e.g. checkout step with server validation), use the guard layer — not `afterEnter`. See [preload before navigate](preload-before-navigate.md).

## See also

- [Transactions are synchronous](../concepts/transactions.md) — why the core has no loaders.
- [Snapshots, `navigationId`, `navigationType`](../concepts/snapshots.md) — `isCurrent` semantics.
- [Code splitting](code-splitting.md) — the same `isCurrent` pattern for lazy view modules.
