# Auth maps: guest / user / admin

The core idea of `@supercat1337/router` is that the active route tree is a
**pure function of `(state, url)`**. Authentication is the canonical
example: instead of one tree + guards, you build **one map per context**
and let `resolveMap` pick the right one.

## Three maps, one resolver

```js
import { createMap, file, folder } from '@supercat1337/router';

// Shared: every context has login and reset-password.
const shared = {
    login: file({ name: 'login' }),
    'reset-password': file({ name: 'resetPassword' }),
};

const guestMap = createMap({ ...shared }, { notFound });

const userMap = createMap(
    {
        ...shared,
        profile: folder({
            index: file({ name: 'profile' }),
            settings: file({ name: 'profileSettings' }),
        }),
    },
    { notFound }
);

const adminMap = createMap(
    {
        ...shared,
        profile: folder({
            index: file({ name: 'profile' }),
            settings: file({ name: 'profileSettings' }),
        }),
        admin: folder({
            index: file({ name: 'adminHome' }),
            users: folder({
                ':id': file({ name: 'adminUser' }),
            }),
        }),
    },
    { notFound }
);

const resolveMap = ({ state }) =>
    !state.isAuthed ? guestMap : state.user.isAdmin ? adminMap : userMap;
```

```js
const appState = { isAuthed: false, user: { isAdmin: false } };
const router = createRouter({
    resolveMap,
    getState: () => appState,
    adapter: createPathAdapter({ base: '/app/' }),
});
```

Now `/admin/users/5` in the guest context is `notFound` — **the route does
not exist in the map**, there is no guard to remember to write. When the
user authenticates:

```js
appState.isAuthed = true;
appState.user.isAdmin = true;
router.revalidate(); // same URL, new map — /admin/users/5 now matches
```

## The shared-routes invariant

Every map must expose the same **navigation primitives** — login,
reset-password, 404. A drift between maps is a silent 404 the first time
a user hits a route that exists in one context but not another.

The clean way: a shared subtree.

```js
const publicRoutes = () => ({
    login: file({ name: 'login' }),
    'reset-password': file({ name: 'resetPassword' }),
});

const guestMap = createMap({ ...publicRoutes() }, { notFound });
const userMap = createMap({ ...publicRoutes(), ...userRoutes() }, { notFound });
const adminMap = createMap({ ...publicRoutes(), ...userRoutes(), ...adminRoutes() }, { notFound });
```

`publicRoutes()` is a function, not a shared object — each call returns
fresh `file()` nodes. `createMap` **enforces name uniqueness across the
map**, not across maps — so reusing the same `FileNode` instance across
maps would be fine, but returning fresh instances keeps maps structurally
independent.

`hasRoute` validates the invariant in one test:

```js
for (const map of [guestMap, userMap, adminMap]) {
    for (const name of ['login', 'resetPassword']) {
        assert(hasRoute(map, name), `${name} missing`);
    }
}
```

See [`map-consistency.test.js`](https://github.com/supercat1337/router/blob/main/tests/map-consistency.test.js)
in the core repo — same test, run against every shipped map.

## Type narrowing

If each map is a separate `createMap<...>` result, the **route-name union
narrows per map**:

```ts
// guestMap only knows login and resetPassword
guestMap.url('login'); // ✅
guestMap.url('profile'); // ❌ compile error

// userMap knows profile
userMap.url('profile'); // ✅
```

`createRouter` types the union of what `resolveMap` can return. In TS:

```ts
const router = createRouter<typeof appState, typeof guestMap | typeof userMap | typeof adminMap>({
    resolveMap,
    getState: () => appState,
    adapter,
});

router.url('login'); // ✅ — in every map
router.url('profile'); // ✅ — in userMap | adminMap, but not guestMap
```

If you want strictly per-map narrowing, use `map.url(...)` directly on
the map you have, not `router.url(...)`. `router.url(...)` reflects the
union of what `resolveMap` **might** return, not what it returned for the
current state. That's the honest type — `resolveMap` is a runtime function.

## `router.route(name)` — re-bind after a switch

`Route` handles are bound to their **own** map. After `state.isAuthed`
flips, routes from the old map keep working but are bound to the old
tree:

```js
// ❌ stale after auth switch
const userRoute = guestMap.route('login'); // bound to guestMap
appState.isAuthed = true;
router.revalidate();
userRoute.url(); // still produces guestMap's /login — same URL, but a stale handle

// ✅ re-bind to the current map
const userRoute = router.route('login');
```

For `login` the URL is identical across maps, so this is invisible — but
for routes with shared **names** and different **paths** (rare, but
possible in tenant routing), it matters. Rule: after any context switch,
re-fetch handles via `router.route(name)`, never store `Route` across
`revalidate()`.

## When to use maps, when to use guards

| Concern                                | Maps | Guards |
| :------------------------------------- | :--: | :----: |
| "Does `/admin` exist?"                 |  ✅  |   —    |
| Different routes per auth level        |  ✅  |   —    |
| Server-side validation before commit   |  —   |   ✅   |
| "Unsaved changes" prompt               |  —   |   ✅   |
| Dynamic permissions (per-resource)     |  —   |   ✅   |
| Multiple tenants, different route sets |  ✅  |   —    |
| Feature flag hides a section           |  ✅  |   —    |

The rule: **if the route exists or doesn't, use maps. If the navigation
depends on runtime checks, use guards.** They compose — a guard can
redirect to a different map context via `state` mutation + `revalidate`.

```js
// Map for structure, guard for "server says no".
const guards = [
    async ({ url }) => {
        if (!url.startsWith('/admin')) return 'allow';
        const canAccess = await fetch('/api/can-admin').then(r => r.ok);
        return canAccess ? 'allow' : redirect('/login');
    },
];
```

## Testing

`createTestRouter({ resolveMap, state })` is the natural pattern — no
setup, no teardown, flip `state` and re-assert:

```js
test('auth gate', t => {
    const state = { isAuthed: false, user: { isAdmin: false } };
    const { router } = createTestRouter({
        resolveMap,
        getState: () => state,
        initial: '/login',
    });

    t.is(router.navigate('/admin').status, 'notFound');

    state.isAuthed = true;
    state.user.isAdmin = true;
    router.revalidate();

    t.is(router.navigate('/admin').status, 'matched');
});
```

## Don't

-   **Don't** use `router.navigate` as an auth check — `navigate` returns
    `status: 'notFound'`, but it did **not** enforce anything. Access
    control is on the server.
-   **Don't** build a "one big map + guards for auth". It forces every map
    consumer to reason about the union, and guards fire on every nav even
    when auth state didn't change. Split the map.
-   **Don't** store a `Route` across map boundaries — see
    [`typed-routes.md`](../concepts/typed-routes.md) → "Do not store a
    `Route` across map boundaries".
-   **Don't** mutate `map` — it's frozen. Context switch = different map.

## See also

-   [`concepts/independent-maps.md`](../concepts/independent-maps.md) —
    the mental model.
-   [`concepts/typed-routes.md`](../concepts/typed-routes.md) — per-map
    narrowing.
-   [`api/guard.md`](../api/guard.md) — when maps aren't enough.
-   [`recipes/protected-route.md`](protected-route.md) — the guard-based
    alternative.
