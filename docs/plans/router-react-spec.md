# `@supercat1337/router-react` — API spec

**Status:** draft. Do not implement before this document is reviewed and frozen.
**Depends on:** `@supercat1337/router@>=0.8.0` — needs `router.onListenerError` (0.8.0, additive) and the `param-duplicate` invariant.
**Repo:** separate from core. `peerDependencies: { "@supercat1337/router": ">=0.8.0 <1.0.0" }`.

## Non-goals

-   **No `<RouterErrorBoundary>`.** A React error boundary cannot catch an unhandled rejection from `afterEnter` — it runs outside the render loop. View errors → `<ErrorBoundary>`; listener errors → `useListenerError`.
-   **No `useBlocker`.** Name collides with React Router and implies a blocking API the core does not have. Replaced by `usePendingNavigation` (read-only guard state).
-   **No `<Suspense>` integration in v1.** `file({ load })` stays app-managed via `afterEnter` + `router.isCurrent(id)`. Loader integration, if it happens, is a separate package (`router-react-loaders`) and a separate spec. Adding it to `router-react` v1 would contradict the core's `router-loaders` non-goal.
-   **No drop-in React Router compat.** Different mental model. A `from-react-router.md` recipe documents the mapping; it is not an API.
-   **CSR-only in v1.** SSR requires `getServerSnapshot` for `useSyncExternalStore` and snapshot serialization/hydration — both need the `ssr` subpath, which is Phase 4. `router-react` v1 is documented as CSR-only; SSR users are directed to `router-react` v2 or to the manual glue in `docs/recipes/react.md`.

## Factory: `createRouterComponents(router, options?)`

Returns `{ Link, NavLink, useSnapshot, useParams, useRouteParams, useSearch, useNavigate, useGuardedNavigate, usePendingNavigation, useListenerError }`.

-   `router` — from `createRouter` / `createGuardedRouter`.
-   `options.nav?` — if present, `<Link>` / `useNavigate` go through `nav.navigate` (async, guarded). If absent, they use `router.navigate` (sync). `useGuardedNavigate` throws if `nav` is absent.
-   Opt-in typed wrapper. No React Context, no provider. One import, one generic, one integration point.

## Components

### `<Link href={rru} replace? search? />`

Low-level, RRU-based. Renders `<a href={adapter.href(rru, { search })}>`.

**Self-attaches `onClick`** — does not require `attachLinks`. Modifier keys, `target`, `download`, `defaultPrevented` handled identically to `attachLinks`. Calls `event.preventDefault()` and `nav.navigate(rru)` / `router.navigate(rru)`.

**Does not co-exist with `attachLinks` on the same elements.** Documented explicitly — a `<Link>` click would otherwise be intercepted twice (React handler + document listener). `event.stopPropagation()` in `<Link>`'s handler prevents the double-fire; `attachLinks` on the document still works for non-`<Link>` elements.

### `<RouteLink name params? search? replace? />`

Typed, name-based. Calls `router.url(name, params)` to build the RRU, then behaves as `<Link>`. `name` narrowed by `RouteNameOf<R>`; `params` typed by `RouteParamsOf<R, N>`.

### `<NavLink href={rru} end? />`

`<Link>` + `aria-current`. With `end: false` (**default**), uses `getChainPrefixes(snapshot).includes(rru)`. With `end: true`, strict `snapshot.url === rru`. Default `end: false` (prefix) — matches React Router's `<NavLink>`.

## Hooks

### `useSnapshot(selector?)`

`useSyncExternalStore(router.subscribe, router.getSnapshot)`. With a selector, memoized (via `use-sync-external-store/shim/with-selector` or a hand-rolled `useRef` + `Object.is`). Without, returns the whole `Snapshot`.

**v1 is CSR-only** — `getServerSnapshot` is not provided. SSR warning is expected and documented. If you need SSR now, use the manual glue in `docs/recipes/react.md`.

### `useParams()`

`snapshot.params` — runtime `Record<string, string>`. Not typed per route.

### `useRouteParams(name)`

Returns `RouteParamsOf<R, N> | null`. `null` when the active leaf is not `name`. Type-safe without duplicating the route name at the call site:

```tsx
const { Link, useRouteParams } = createRouterComponents(router);

function UserProfile() {
    const params = useRouteParams('userHome');
    if (!params) return null; // not on userHome
    return <div>{params.id}</div>; // typed
}
```

### `useSearch()`

`snapshot.search`.

### `useNavigate()`

Returns `(rru: string) => void`, sync. Delegates to `router.navigate` (or `nav.navigate` if `options.nav` was passed).

### `useGuardedNavigate()`

Returns `(rru: string) => Promise<NavResult>`. Throws if `options.nav` was not passed to `createRouterComponents`.

### `usePendingNavigation()`

`guard.pending()` + subscribe. Returns `{ url, since, signal } | null`. No-op (`null`) when no guard is wired — does not throw, does not warn.

### `useListenerError()`

Subscribes to `router.onListenerError`, returns `{ errors: Error[], clear: () => void }`. Requires `router.onListenerError(cb)` in core (0.8.0, additive — see Phase 0.7).

```tsx
const { useListenerError } = createRouterComponents(router);
const { errors, clear } = useListenerError();

return errors.length > 0 ? (
    <div className="router-errors">
        {errors.map((e, i) => (
            <pre key={i}>{e.message}</pre>
        ))}
        <button onClick={clear}>Dismiss</button>
    </div>
) : null;
```

## StrictMode / Concurrent

-   `useSnapshot` uses `useSyncExternalStore` — safe by construction.
-   `<Link>` click handler is stable (no `useCallback` identity churn).
-   No `useEffect`-based subscriptions — all via `useSyncExternalStore`.
-   StrictMode double-invoke of `useSyncExternalStore` subscribe/unsubscribe is handled correctly (the core's `subscribe` returns an idempotent unsubscribe).

## Open questions (resolve before coding)

1. **Selector for `useSnapshot`.** `use-sync-external-store/shim/with-selector` is a small dependency (~1 KB gzip). Acceptable, or hand-roll? Decision pending.
2. **`<Link>` and `attachLinks` coexistence.** Current decision: `<Link>` calls `event.stopPropagation()`. Confirm no edge case in shadow DOM / portals.
3. **`useRouteParams(name)` typings.** Needs `RouteParamsOf` from core; `router.route(name)` narrowing should flow through. Confirm with a type test.
4. **`<Link>`'s `href` prop name.** `<Link href>` (HTML-aligned) vs `<Link to>` (React Router-aligned). Current decision: `href` for `<Link>`, `name` for `<RouteLink>`. Rationale: `href` makes it obvious the value is an RRU, not a route name.
5. **`getServerSnapshot` opt-in.** If `ssr` subpath ships before v2, `createRouterComponents(router, { ssr: true })` could accept a `getServerSnapshot` option. Out of scope for v1.

## Not in v1, revisit later

-   `<Suspense>` integration for `file({ load })`.
-   `getServerSnapshot` / SSR serialization.
-   `useBlocker`-style "unsaved changes" — users write this in a guard (see `docs/recipes/protected-route.md`).
-   Prefetch-on-viewport — `router.prefetch` + `IntersectionObserver` is 10 lines of app code; not worth a component in v1.
