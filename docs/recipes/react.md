# React integration

`@supercat1337/router` is framework-agnostic. The glue is small — ~30–50 lines — but you write it once. `router.subscribe` is exactly what `useSyncExternalStore` requires: one subscription, fires on every commit, `getSnapshot()` returns a stable reference when nothing changed.

## `useRouterSnapshot`

```jsx
import { useSyncExternalStore, useCallback } from 'react';

export function useRouterSnapshot(router) {
    const subscribe = useCallback(onChange => router.subscribe(onChange), [router]);
    return useSyncExternalStore(subscribe, () => router.getSnapshot());
}
```

## `<App>`

```jsx
import { isFile } from '@supercat1337/router';

function App({ router }) {
    const snapshot = useRouterSnapshot(router);

    if (snapshot.status === 'notFound') {
        return <NotFound result={snapshot.notFoundResult} />;
    }
    if (snapshot.status === 'error') {
        return <ErrorView error={snapshot.error} />;
    }
    return renderByLeaf(snapshot.leaf, snapshot.params);
}

function renderByLeaf(leaf, params) {
    if (!isFile(leaf)) return null;
    switch (leaf.name) {
        case 'login':
            return <Login />;
        case 'profile':
            return <Profile params={params} />;
        default:
            return null;
    }
}
```

## `<Link>` and `<NavLink>`

React Router ships these; here they're ~15 lines:

```jsx
export function Link({ router, to, replace = false, children, ...rest }) {
    // `to` is an RRU — use `map.url(...)` / `route.url(...)` to build it.
    return (
        <a href={to} data-router-link={replace ? 'replace' : ''} {...rest}>
            {children}
        </a>
    );
}

// For active marking, wrap attachActiveLinks once at app mount.
```

`attachLinks(router)` (from `@supercat1337/router/links`) intercepts clicks on any `[data-router-link]` — you don't need a component. If you want a `<Link>` component, render `<a href={rru} data-router-link>` — that's enough.

For a typed `<Link>` that takes a route name:

```jsx
export function RouteLink({ router, name, params, replace, children }) {
    const href = router.url(name, params);
    return (
        <a href={href} data-router-link={replace ? 'replace' : ''}>
            {children}
        </a>
    );
}

// <RouteLink router={router} name="userHome" params={{ id: '5' }}>Profile</RouteLink>
```

`router.url` narrows `name` to `RouteNameOf<R>` — typos are compile errors.

## Navigation helpers

```jsx
export function useNavigate(router) {
    return useCallback(
        (rru, { replace = false } = {}) => {
            return replace ? router.replace(rru) : router.navigate(rru);
        },
        [router]
    );
}

export function useParams() {
    const router = useRouterContext();
    return useRouterSnapshot(router).params;
}

export function useSearch() {
    const router = useRouterContext();
    return useRouterSnapshot(router).search;
}
```

`params` / `search` are read-only `Record<string, string>` — one object per snapshot, no per-route schema.

## `<Outlet>` (nested layouts)

`snapshot.chain` is the full chain of nodes. To render layout + content:

```jsx
function Outlet({ router }) {
    const snapshot = useRouterSnapshot(router);
    if (!isFile(snapshot.leaf)) return null;
    const layout = snapshot.leaf.layout ?? 'main';
    return layouts[layout]?.({ snapshot }) ?? null;
}
```

`layout` is app-owned metadata on `file({ name, layout: 'dashboard' })`. See [Nested layout](nested-layout.md).

## `useBlocker` (guarded navigation)

The guard layer is not a React concern — it's a router-layer decision. Wire it once:

```jsx
const { router, nav } = createGuardedRouter({
    /* ... */
});

function useGuardedNavigate() {
    return useCallback(
        (rru, { replace = false } = {}) => {
            return replace ? nav.replace(rru) : nav.navigate(rru);
        },
        [nav]
    );
}
```

For "unsaved changes" prompts, put the check inside a guard:

```js
guards: [
    async ({ url, from }) => {
        if (hasUnsavedChanges() && !(await confirm('Discard?'))) {
            return { block: true };
        }
        return 'allow';
    },
],
```

## Devtools

Mount `__SUPERCAT_ROUTER_DEVTOOLS__` **before** `createRouter`:

```js
globalThis.__SUPERCAT_ROUTER_DEVTOOLS__ = {
    register(router) {
        devtoolsPanel.attach(router);
    },
};
```

See [Devtools](devtools.md).

## Data loading

Data loading uses `afterEnter` + `isCurrent` — not React-specific:

```jsx
function useLoaderData(router, loader) {
    const [state, setState] = useState({ loading: true });
    useEffect(() => {
        let cancelled = false;
        const snap = router.getSnapshot();
        const id = snap.navigationId;
        setState({ loading: true });
        loader(snap).then(
            data => {
                if (!cancelled && router.isCurrent(id)) setState({ data });
            },
            error => {
                if (!cancelled && router.isCurrent(id)) setState({ error });
            }
        );
        return () => {
            cancelled = true;
        };
    }, [router, router.getSnapshot().url]); // keyed by URL
    return state;
}
```

For a route-level integration, keep the loading state at the router level (see [Data loading](data-loading.md)) and read it via `useRouterSnapshot`.

## Don't

- **Don't** stitch together `afterEnter` / `afterLeave` / `mapChanged` / `navigationError` — that pattern misses `revalidate()` without a URL change and misses prod error snapshots. `subscribe` fires on every commit.
- **Don't** use `snapshot.navigationId` as a React `key` — use `url` / `params` / `leaf.name` for identity. `navigationId` bumps on `revalidate()`.
- **Don't** `await` `router.navigate` / `router.replace` — they're synchronous. If you need guards, use `nav.navigate` / `nav.replace` (async).
- **Don't** mix `attachLinks` with React Router's `<Link>` — pick one.

## See also

- [Vue integration](vue.md) — same glue, `shallowRef`.
- [Data loading](data-loading.md) — `isCurrent` pattern.
- [`docs/api/guard.md`](../api/guard.md) — guard layer.
