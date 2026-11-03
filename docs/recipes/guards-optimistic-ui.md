# Guards + optimistic UI

Optimistic UI (`afterEnter` + `isCurrent`) and guards (async pre-commit
checks) **do not** interleave the way it looks. This recipe is about
what happens when they meet, and which patterns are safe.

## The two timelines

A guarded navigation (`nav.navigate`) has three phases:

```
guard chain → commit → afterEnter (and other events)
```

An optimistic UI has two:

```
commit → afterEnter → loadData (await) → if isCurrent(id) → render
```

The interaction:

| Guard decision    | Commit happens? | `afterEnter` fires? | Optimistic load starts? |
| :---------------- | :-------------: | :-----------------: | :---------------------: |
| `'allow'`         |       ✅        |         ✅          |           ✅            |
| `{ block: true }` |       ❌        |         ❌          |           ❌            |
| `redirect('/x')`  |  ✅ (for `/x`)  |    ✅ (for `/x`)    |      ✅ (for `/x`)      |
| guard throws      |  ❌ (blocked)   |         ❌          |           ❌            |

**Key implication:** if a guard blocks, `afterEnter` never fires, and
the data fetcher never runs. The user sees no change — no skeleton, no
error, no stale data. The URL is rolled back (for popstate) or unchanged
(for navigate).

## The `isCurrent` contract still holds

`isCurrent(id)` checks whether the snapshot with that `navigationId` is
still the committed one. In a guarded flow, `id` is captured **after**
the guard allows, in `afterEnter`. By then, the guard is no longer in
flight; the race is between `loadData` and **subsequent** navigations:

```js
router.on('afterEnter', async ({ snapshot }) => {
    const id = snapshot.navigationId;
    showSkeleton(snapshot);

    const data = await loadData(snapshot);

    if (!router.isCurrent(id)) return; // a newer nav committed — discard
    render(snapshot, data);
});
```

If a guard blocks the **next** nav, the previous snapshot remains
current — `isCurrent(id)` is still `true`, and the previous view keeps
its data. Correct.

If a guard **redirects** the next nav, a **new** snapshot commits for the
target — `isCurrent(id)` becomes `false`, the old load is discarded. The
new `afterEnter` fires for the target and starts its own load. Correct.

## The slow-guard case: `guard.pending()`

A guard can take seconds (network permission check, server-side
validation). During that time:

-   `nav.navigate` is pending (returns `Promise<NavResult>`)
-   No snapshot commits — `router.getSnapshot()` still returns the
    previous snapshot
-   `afterEnter` has **not** fired
-   `guard.pending()` returns `{ url, since, signal }` — the in-flight target

For a spinner during the guard, subscribe to pending state:

```js
setInterval(() => {
    const p = guard.pending();
    if (p) showGlobalSpinner(`checking ${p.url}…`);
    else hideGlobalSpinner();
}, 100);
```

The previous view stays visible until the guard resolves. This is
**correct** optimistic UI: the user sees the old page while the
permission check runs. If the guard allows, the new page appears; if it
blocks, nothing changes.

## State loss on unmount

The trap: optimistic data stored in component-local state (`useState`
in React, `ref` in Vue) is **lost on unmount**. If the guard blocks a
navigation that would have unmounted the component, its state is gone.

```jsx
// ❌ per-component state is lost on unmount
function Profile() {
    const [data, setData] = useState(null);
    useEffect(() => {
        const id = router.getSnapshot().navigationId;
        loadProfile().then(d => {
            if (router.isCurrent(id)) setData(d);
        });
    }, [router.getSnapshot().url]);
    return data ? <View data={data} /> : <Skeleton />;
}
```

When the user navigates away (guard allows or blocks — doesn't matter),
`Profile` unmounts, `data` is lost. When they come back, a fresh
`useState(null)` starts, and the fetch runs again.

**Fix:** store view state **outside** the component, keyed by route.

```js
// ✅ store per-route view state at router level
const viewStates = new Map(); // leaf.name → { loading, error, data }

router.on('afterEnter', async ({ snapshot }) => {
    const leaf = snapshot.leaf;
    if (!isFile(leaf)) return;
    const id = snapshot.navigationId;

    viewStates.set(leaf.name, { loading: true });
    try {
        const data = await loadData(snapshot);
        if (!router.isCurrent(id)) return;
        viewStates.set(leaf.name, { loading: false, data });
    } catch (error) {
        if (!router.isCurrent(id)) return;
        viewStates.set(leaf.name, { loading: false, error });
    }
    notifyViewChange(); // re-render subscribers
});
```

```jsx
function Profile({ router }) {
    const snapshot = useRouterSnapshot(router);
    const state = viewStates.get(snapshot.leaf?.name) ?? { loading: true };
    return state.data ? <View data={state.data} /> : <Skeleton />;
}
```

Now if the user navigates away and back, the data is still in
`viewStates`. If they navigate away mid-load, `isCurrent(id)` discards
the result — but the entry stays keyed by `leaf.name`, so the next visit
starts fresh.

See [`data-loading.md`](data-loading.md) → "Loading state per route" for
the fuller pattern.

## Combining with a state manager

Naive integration with Redux/Zustand/Pinia breaks `isCurrent`:

```js
// ❌ the store update happens after an await, but isCurrent isn't checked
useEffect(() => {
    loadData().then(d => dispatch(setData(d))); // no isCurrent guard
}, [url]);
```

If `loadData` resolves after a new navigation, `dispatch` sets data for
the **old** view, and the new view briefly shows stale content before
its own fetch resolves. The `isCurrent(id)` check is not optional — put
it **inside** the async continuation, **before** the dispatch:

```js
useEffect(() => {
    const id = router.getSnapshot().navigationId;
    loadData().then(d => {
        if (!router.isCurrent(id)) return;
        dispatch(setData(d));
    });
}, [url]);
```

The `id` must be captured **before** the await, not after — otherwise
you're checking `isCurrent(currentId)`, which is always true.

## Redirect chains

A guard that redirects starts a **new** transaction. `afterEnter` fires
**once**, for the final target — not for the original URL, not for
intermediate hops.

```js
guards: [({ url }) => (url === '/old' ? redirect('/new') : 'allow')];

await nav.navigate('/old');
// afterEnter fires with snapshot.url === '/new'
// snapshot.redirectedFrom is undefined — the guard started a new transaction
```

`snapshot.redirectedFrom` is only set for **in-transaction** redirects
(a `notFound` handler returning `redirect()`), not for guard redirects.
See [`snapshots.md`](../concepts/snapshots.md) → `redirectedFrom`.

Implication for optimistic UI: the loading skeleton for `/old` never
appears. The load for `/new` starts immediately. Correct — the user
asked for `/old`, got `/new`, and sees `/new`'s data.

## Don't

-   **Don't** use `afterEnter` as a place to **re-check** permissions — the
    guard layer exists for that. `afterEnter` is post-commit; re-checking
    there means undoing a commit.
-   **Don't** store optimistic data in component `useState` — it's lost on
    unmount. Store it at router/app level, keyed by `leaf.name`.
-   **Don't** omit `isCurrent(id)` — the only race-safety primitive.
    Compare `navigationId`, not URL.
-   **Don't** compare URLs to detect "did a newer nav start" —
    `revalidate()` keeps the URL stable but bumps the ID.
-   **Don't** expect `afterEnter` to fire for a blocked navigation — it
    won't. The old snapshot stays committed; the old view stays rendered.
-   **Don't** rely on guards for security — a user can disable JS or call
    `router.navigate()` directly (which bypasses guards).

## See also

-   [`data-loading.md`](data-loading.md) — the `afterEnter` + `isCurrent`
    pattern in detail.
-   [`preload-before-navigate.md`](preload-before-navigate.md) — blocking
    loaders in guards.
-   [`protected-route.md`](protected-route.md) — guard-layer wiring.
-   [`concepts/snapshots.md`](../concepts/snapshots.md) — `navigationId`,
    `isCurrent`, `redirectedFrom`.
-   [`concepts/transactions.md`](../concepts/transactions.md) — why
    guards live outside the transaction.
