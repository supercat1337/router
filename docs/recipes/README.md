# Recipes

Task-oriented. Skip around.

## Navigation patterns

-   [Protected route](protected-route.md) — guard layer + `createGuardedRouter`
-   [Auth maps](auth-maps.md) — guest / user / admin via `resolveMap`
-   [Preload before navigate](preload-before-navigate.md) — blocking loader in guards
-   [Guards + optimistic UI](guards-optimistic-ui.md) — `isCurrent` and `guard.pending()`
-   [Nested layout](nested-layout.md) — walk `snapshot.chain`, render layout by `leaf.layout`

## Data & code loading

-   [Data loading with loading / error UI](data-loading.md) — `afterEnter` + `isCurrent`
-   [Data loading with TanStack Query](afterEnter-tanstack-query.md) — `prefetchQuery` in `afterEnter`, shared cache
-   [Code splitting](code-splitting.md) — `file({ load })` + `afterEnter`
-   [Validating route names from data](validating-route-names.md) — `hasRoute` at load time

## Rendering

-   [Custom 404 render](custom-404.md)
-   [Scroll restoration](scroll-restoration.md) — `historyState` + `navigationType`
-   [Active links](active-links.md) — strict vs prefix matching for `<NavLink>`
-   [Search params patterns](search-params-patterns.md) — `replace` vs `push`, multi-value
-   [React integration](react.md)
-   [Vue integration](vue.md)

## Tooling

-   [Devtools](devtools.md) — `__SUPERCAT_ROUTER_DEVTOOLS__` hook
-   [How to write a custom adapter](how-to-write-custom-adapter.md) — Electron / Tauri / iframe
-   [Testing routes](testing-routes.md) — `createTestRouter` and `createMemoryAdapter`

## See also

-   [Concepts](../concepts/README.md) — the mental model.
-   [API reference](../api/README.md) — module reference.
-   [AGENTS.md](../../AGENTS.md) — Do / Don't for AI assistants.
