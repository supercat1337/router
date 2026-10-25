# Concepts

The mental model behind `@supercat1337/router`. Read in order the first time — each page builds on the previous one.

## Reading order

1. **[Routes are data](routes-are-data.md)** — `file` / `folder` / `createMap`, key syntax (`:name`, `*`, `index`), invariants, fallback rules.

2. **[Maps are independent](independent-maps.md)** — `resolveMap`, multiple contexts (auth / tenant / feature flag), why cross-map features are non-goals.

3. **[Transactions are synchronous](transactions.md)** — the LOOP (`getState → resolveMap → match → … → events`), what "atomic" means, contract violations, where async belongs.

4. **[Snapshots, `navigationId`, `navigationType`](snapshots.md)** — pull vs push, what's frozen, transaction id vs history position, transaction source vs history direction.

5. **[Typed routes and `Route` objects](typed-routes.md)** — `RouteNames<T>`, `RouteParamsFor<T>`, `Route<N, P>` handles, caveats (TS 5.0+, JSDoc).

6. **[Reading query parameters](query-params.md)** — `MatchResult.search`, decoding, duplicates, what search is _not_.

## If you're short on time

The 4 facts that cover 90% of correctness:

- **The core is synchronous.** `resolveMap` and `notFound` must not return Promises — that's a contract violation (`resolver-promise` / `notFound-promise`).
- **Navigation is atomic.** `router.navigate('/x')` returns a `Snapshot` synchronously; events fire after commit; no `await`.
- **URLs are Router-relative (RRU).** `Snapshot.url` starts with `/`, no `#`. Browser URLs live only inside the adapter.
- **Maps are independent.** No cross-map features, no global route registry — `resolveMap` returns a different map for a different context.

## Not concepts, but related

- **[Recipes](../recipes/README.md)** — task-oriented; skip around. Protected route, data loading, code splitting, React / Vue integration, custom 404, etc.
- **[API reference](../api/README.md)** — subpath module reference + cheat-sheet.
- **[AGENTS.md](../../AGENTS.md)** — correctness checklist for AI assistants (Do / Don't, non-goals, common mistakes).

## See also

- [`README.md`](../../README.md) — landing page, quick start.
- [`docs/getting-started.md`](../getting-started.md) — install + first router.
- [`docs/ssr.md`](../ssr.md) — SSR is a natural fit for a synchronous core.
- [`docs/comparison.md`](../comparison.md) — how this differs from TanStack Router / React Router / Vue Router.
