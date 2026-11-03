# Data loading with TanStack Query

`@supercat1337/router` has no built-in loaders — `resolveMap` and
`notFound` must be synchronous. Data loading belongs in `afterEnter`,
with `router.isCurrent(id)` for race safety. This recipe shows the
canonical pairing with [TanStack Query](https://tanstack.com/query) —
a mature cache-and-invalidation layer that handles retries, deduplication,
and background refetch.

`router.prefetch(url)` and `attachPreload` warm the same cache — hover
or prefetch on `afterEnter` loads data before the user clicks.

## Why `afterEnter`, not `useQuery`

`useQuery` is a hook — it runs inside a component render. `afterEnter`
fires **outside** the render loop, on every commit. They serve different
purposes:

-   `useQuery` — for **component-level** data (a sidebar, a widget) that
    lives alongside the route.
-   `afterEnter` + `queryClient.fetchQuery` — for **route-level** data
    that gates the page render.

The pattern: `afterEnter` prefetches / fetches the route's data into the
query cache, and the route component reads it with `useQuery`. The
component is trivial (loading / error / data), the cache is shared.

```js
// app.js
const queryClient = new QueryClient();

router.on('afterEnter', async ({ snapshot }) => {
    const leaf = snapshot.leaf;
    if (!isFile(leaf)) return;

    const queryKey = leaf.name; // unique per map — enforced by createMap
    const fetcher = fetchers[leaf.name];
    if (!fetcher) return;

    const id = snapshot.navigationId;
    await queryClient.prefetchQuery({
        queryKey: [queryKey, snapshot.params],
        queryFn: () => fetcher(snapshot),
        staleTime: 30_000,
    });
    // prefetchQuery never throws — the component handles the error state.
    // isCurrent is not needed here: the cache is keyed by queryKey, so a
    // superseded commit just warms a cache entry that may not be read.
});
```

```jsx
// UserProfile.jsx
function UserProfile({ router }) {
    const snapshot = useSyncExternalStore(
        cb => router.subscribe(cb),
        () => router.getSnapshot()
    );
    const { data, error, isLoading } = useQuery({
        queryKey: ['user', snapshot.params],
        queryFn: () => fetchers.user(snapshot),
        staleTime: 30_000,
    });

    if (isLoading) return <Skeleton />;
    if (error) return <ErrorView error={error} />;
    return <Profile data={data} />;
}
```

## Why `prefetchQuery`, not `fetchQuery`

`fetchQuery` **throws** on failure. In `afterEnter`, an unhandled
rejection is outside the transaction — it goes to the browser's
`unhandledrejection` handler, not `onListenerError`. `prefetchQuery`
never throws; it warms the cache, and the component's `useQuery`
handles loading / error states with React idioms.

If you want to **block** on data failure (e.g. checkout), use the
guard layer, not `afterEnter`. See [`preload-before-navigate.md`](preload-before-navigate.md).

## Prefetch on hover

`attachPreload` warms the same cache on pointer-intent. Reuse the same
fetcher:

```js
attachPreload(router, {
    preload: async (leaf, ctx) => {
        if (!isFile(leaf)) return;
        const fetcher = fetchers[leaf.name];
        if (!fetcher) return;
        if (ctx.signal.aborted) return;
        await queryClient.prefetchQuery({
            queryKey: [leaf.name], // params unknown until the user navigates
            queryFn: () => fetcher({ params: {} }), // best-effort — may miss
            staleTime: 30_000,
        });
    },
});
```

If the route needs params, hover-prefetch cannot know them. Prefetch
the **list** (`/users`) on hover of the list page; the **item**
(`/users/5`) fetches on `afterEnter`, once params are known.

## Invalidation

Invalidate from the same query cache — don't reach into the router:

```js
// After a mutation, invalidate the affected routes.
await queryClient.invalidateQueries({ queryKey: ['user'] });
// The route component's useQuery refetches automatically; afterEnter
// does not need to fire again.
```

Do **not** call `router.revalidate()` to refetch — `revalidate` re-runs
the map resolver, not the data fetcher. `invalidateQueries` is the
correct tool.

## Don't

-   **Don't** call `useQuery` inside `afterEnter` — it's a hook, runs
    only in component render.
-   **Don't** use `fetchQuery` in `afterEnter` — a rejection there is an
    unhandled promise rejection, not a transaction error.
-   **Don't** skip `staleTime` — without it, `useQuery` refetches on
    every render (default is `0`), defeating the prefetch.
-   **Don't** put loaders in `resolveMap` — sync contract violation
    (`resolver-promise`).
-   **Don't** call `router.revalidate()` for data refetch — it doesn't
    refetch; use `invalidateQueries`.

## See also

-   [`data-loading.md`](data-loading.md) — the `afterEnter` + `isCurrent`
    pattern without a library.
-   [`preload-before-navigate.md`](preload-before-navigate.md) — blocking
    loaders in guards.
-   [`code-splitting.md`](code-splitting.md) — lazy view modules.
-   [`docs/api/links.md`](../api/links.md) — `attachPreload`.
