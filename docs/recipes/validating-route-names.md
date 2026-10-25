# Validating route names from data

Route names sometimes come from outside your code — config files, feature flags, plugin manifests, CMS data. If you call `map.url(name)` with a bad name, it throws `TypeError` — intentionally, because a bad name is a **configuration bug**, not a navigation outcome.

The right pattern is to validate **once**, at data-load time, and then call `url()` freely.

## Validate once

```js
import { hasRoute } from '@supercat1337/router';

// Once, when loading config:
for (const item of config) {
    if (!hasRoute(userMap, item.route)) {
        throw new Error(`unknown route "${item.route}" in config`);
    }
}

// Everywhere else — no try/catch:
const href = userMap.url(item.route, item.params);
```

## What `hasRoute` checks

`hasRoute(map, name)` returns `true` iff `map.url(name, ...)` would not throw for the reason "route not found":

- **`true`** — a non-wildcard leaf with `name === name` exists.
- **`false`** — no such leaf, or the route is a wildcard `*` (no canonical URL), or `map` / `name` are invalid inputs.
- **Does not check params.** `hasRoute(map, 'user')` returns `true`, but `url('user')` still throws for missing `id`. Parameter presence is a data-validation question, not a route-existence one.

```js
const m = createMap({ users: folder({ ':id': file({ name: 'user' }) }) }, { notFound });

hasRoute(m, 'user'); // true
hasRoute(m, 'userGroup'); // false
m.url('user'); // TypeError — missing id
m.url('user', { id: '5' }); // '/users/5'
```

## Do not wrap `url()` in `try/catch`

```js
// ❌ Hides configuration bugs; the error should be caught once, at load time.
try {
    const href = map.url(nameFromConfig);
} catch {
    // silently fall back — now nobody knows the config is wrong
}
```

If you can't know at load time that a name is valid (e.g. the map switches at runtime), do:

```js
if (!hasRoute(router.getSnapshot().map, nameFromConfig)) {
    throw new Error(`unknown route "${nameFromConfig}" in current map`);
}
const href = router.url(nameFromConfig);
```

## `hasRoute` is not `try/catch` — it's a validation step

Use `hasRoute`:

- **once at data-load time** — fail fast, no try/catch everywhere;
- **per map switch** — if the map can change (auth, tenant), re-check.

Don't use `hasRoute`:

- **per render** — O(N) in tree size, no memoization;
- **as a substitute for typed names** — in TS with `createMap`, `map.url('typo')` is a compile error; `hasRoute` is for names from **external** sources.

## Wildcards

Wildcard-only routes (`*`) have no canonical URL — `hasRoute` returns `false` for them, and `url()` / `route()` also throw. This reflects a real constraint: a `*` route cannot be `url()`-generated; you must navigate to a URL that will match it.

```js
const m = createMap({ '*': file({ name: 'catchall' }) }, { notFound });
hasRoute(m, 'catchall'); // false
m.url('catchall'); // TypeError
```

## See also

- [`hasRoute` in AGENTS.md](../../AGENTS.md) — full semantics.
- [Typed routes and `Route` objects](../concepts/typed-routes.md) — compile-time narrowing.
- [Routes are data](../concepts/routes-are-data.md) — wildcard rules.
