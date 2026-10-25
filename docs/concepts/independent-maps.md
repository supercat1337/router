# Maps are independent

`resolveMap` returns **one** map per transaction. The core never crosses map boundaries. Multiple maps coexist — one per auth state, tenant, feature flag, or A/B cohort — and a context switch is just a different return value.

```js
const resolveMap = ({ state }) =>
    !state.isAuthed ? guestMap : state.user.isAdmin ? adminMap : userMap;
```

## Why this matters

Most SPA routers keep **one** route tree and use guards to simulate different contexts. That works, but it has costs:

- guards fire on **every** navigation even if the context did not change;
- "which routes exist in which context" lives in guard code, not in data;
- type-inference (if any) sees the union of all routes everywhere.

State-relative maps invert the model:

| Concern                | One tree + guards            | Multiple maps           |
| :--------------------- | :--------------------------- | :---------------------- |
| "Does `/admin` exist?" | Ask the guard                | Check the map           |
| Type-inference         | Union of all routes          | Per-map, narrowed       |
| Guard cost             | Per navigation               | Zero — map swap is free |
| 404 policy             | One per app                  | One per map             |
| Auth leak risk         | Guard must remember to block | Route absent from map   |

## What it deliberately does **not** have

- **Cross-map redirects** — no `router.crossMapRedirect('/admin', '/login')`. If a route is absent in the current map, the miss is handled by `notFound` (or a `redirect()` from `notFound`). To move to a different context, change `state` and call `router.revalidate()`.
- **Global route registry** — no central list of names. Each map owns its names; `hasRoute(map, name)` is per-map.
- **Feature flags as route filters** — use a different map for each flag combination, or return a map whose tree already excludes disabled routes.

These are **non-goals**, not missing features. If you need them, TanStack Router (React) or Vue Router (Vue) is a better fit.

## Common patterns

```js
// Auth gate
const resolveMap = ({ state }) => (state.isAuthed ? userMap : guestMap);

// Tenant isolation — same shapes, different data
const resolveMap = ({ state }) =>
    state.tenant === 'acme' ? acmeMap : state.tenant === 'globex' ? globexMap : fallbackMap;

// A/B — different route sets per cohort
const resolveMap = ({ state }) => (state.cohort === 'B' ? v2Map : v1Map);

// Feature flag — flag off → route absent, not guarded
const resolveMap = ({ state }) => (state.flags.checkout ? withCheckoutMap : withoutCheckoutMap);
```

## See also

- [Routes are data](routes-are-data.md) — how to build a map.
- [`createRouter` in AGENTS.md](../../AGENTS.md) — the options.
- [`docs/recipes/protected-route.md`](../recipes/protected-route.md) — the guard-based alternative.
