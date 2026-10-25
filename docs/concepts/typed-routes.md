# Typed routes and `Route` objects

`createMap` accepts a `const` type parameter, so the data literal is preserved. The result is a `RouterMap<RouteName, ParamsMap>` where `RouteName` is the union of every `file({ name })` in the tree, and `ParamsMap` maps each name to its accumulated `:name` params.

## Route names

```ts
const map = createMap(
    {
        login: file({ name: 'login' }),
        users: folder({
            ':id': folder({
                index: file({ name: 'userHome' }),
                edit: file({ name: 'userEdit' }),
            }),
        }),
    },
    { notFound }
);

type Names = Parameters<typeof map.url>[0];
// → 'login' | 'userHome' | 'userEdit'

map.url('login'); // ✓
map.url('profiel'); // ✗ compile error
```

The union covers **every** `file({ name })` in the tree, including wildcards' names — even though wildcards have no canonical URL. Calling `map.url('catchall')` for a `*` route is a runtime `TypeError`, not a compile error (the name exists, but has no URL).

## Route params

Params narrow per route, accumulated across levels:

```ts
map.url('userHome', { id: '5' }); // ✓ — 'id' required
map.url('userHome', { idd: '5' }); // ✗ compile error — unknown key
map.url('userHome'); // ✗ compile error — missing 'id'

map.url('userEdit', { id: '5' }); // ✓ — /users/:id/edit
map.url('report', { year: '2024', month: '06' }); // ✓ — /reports/:year/:month
```

A route with no `:name` accepts no params (or an empty `Record`):

```ts
map.url('login'); // ✓
map.url('login', {}); // ✓
map.url('login', { anything: 'x' }); // ✗ compile error
```

## Through `createRouter`

Both narrowing layers follow the map:

```ts
const router = createRouter<AppState, typeof map>({
    resolveMap: () => map,
    getState: () => appState,
    adapter,
});

router.url('userHome', { id: '5' }); // ✓
router.url('userHome'); // ✗ compile error
router.url('profiel'); // ✗ compile error
```

## `Route` objects

`map.route(name)` and `router.route(name)` return a `Route<N, P>` handle — a frozen, branded, cached object that combines the route name with its params:

```ts
const userRoute = map.route('userHome');

userRoute.name; // 'userHome' (literal)
userRoute.params; // ['id'] — readonly
userRoute.url({ id: '5' }); // '/users/5'
userRoute.url(); // ✗ compile error — 'id' required
userRoute.url({ idd: '5' }); // ✗ compile error — unknown param
```

`Route` is cached per map — `map.route('userHome') === map.route('userHome')`. Pass the handle around instead of the string name; every call site keeps the typed params.

```js
// Menu config — name → handle, once
const menu = [
    { route: map.route('login'), label: 'Log in' },
    { route: map.route('userEdit'), label: 'Account' },
];

menu.forEach(item => {
    const a = document.createElement('a');
    const params = item.route.params.length > 0 ? { id: currentUserId } : undefined;
    a.href = item.route.url(params);
    a.textContent = item.label;
});
```

`route.params` is the runtime source of truth for the `:name` keys the route requires. Use it to build forms, validate external data, or render debug info without re-parsing the URL.

## Do not store a `Route` across map boundaries

A `Route` is bound to its own `RouterMap` — the same object keeps producing URLs for that map even after `resolveMap` returns a different one. When the active map may have changed (auth, tenant, feature flag), call `router.route(name)` again to bind to the current map.

```js
// ❌ Stale after auth switch
const userRoute = mapA.route('user');
switchContext();
userRoute.url({ id: '5' }); // still produces mapA's URL

// ✅ Re-bind after switch
const userRoute = router.route('user');
```

Use `isRoute(x)` to brand-check a handle — `instanceof` will not work, and structural lookalikes return `false`.

## Caveats

- **TS 5.0+ required** for `const` type parameters. On older compilers, names widen to `string` and params widen to `Record<string, string>` — the API still works, only narrowing is lost.
- **JS + JSDoc** infers the union only if the data literal is written inline in `createMap(...)`. If you split it into a `const data = {...}` first, the literal type may widen in some setups — annotate with `/** @type {const} */` if needed.
- **Fallback to `Record<string, string>`** for hand-built / unparameterized `RouterMap`. If `ParamsMap` is not inferable, `url(name, params?)` accepts any `Record<string, string>` — this is the pre-0.6 behavior.
- **`Record<string, string>` is not assignable to `{ id: string }`** — a bare `Record` does not guarantee the key is present. If you have a widened object, type it precisely (`{ id: string; extra: string }`) or cast.
- **Compile-time cost is real** — `RouteParamsFor<T>` is recursive. Maps with hundreds of files may add a few seconds to `tsc`. The runtime is untouched.

## When to use which

| Need                                      | Use                                                   |
| :---------------------------------------- | :---------------------------------------------------- |
| One-off URL build                         | `map.url(name, params)` or `router.url(name, params)` |
| Same route used multiple times            | `map.route(name)` or `router.route(name)`             |
| Runtime introspection of params           | `route.params`                                        |
| Presence check for a route name from data | `hasRoute(map, name)`                                 |

See [`hasRoute` in AGENTS.md](../../AGENTS.md) for validation of route names from external data.

## See also

- [Routes are data](routes-are-data.md) — the tree syntax.
- [Reading query parameters](query-params.md) — `MatchResult.search`.
- [`docs/recipes/validating-route-names.md`](../recipes/validating-route-names.md) — `hasRoute` at data-load time.
