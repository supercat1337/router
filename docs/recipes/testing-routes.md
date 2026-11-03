# Testing routes

`@supercat1337/router/testing` ships `createTestRouter` and
`createMemoryAdapter` — the same helpers the core uses internally.
This recipe is about **testing application code that uses the router**,
not the router itself.

## The basic setup

```js
import { createMap, file } from '@supercat1337/router';
import { createTestRouter } from '@supercat1337/router/testing';

const map = createMap(
    {
        login: file({ name: 'login' }),
        profile: file({ name: 'profile' }),
    },
    { notFound: () => null }
);

test('navigating to /profile commits a matched snapshot', t => {
    const { router, adapter } = createTestRouter({ map, initial: '/login' });

    const snap = router.navigate('/profile');
    t.is(snap.status, 'matched');
    t.is(snap.url, '/profile');
    t.deepEqual(adapter.writeCalls, [{ url: '/profile', mode: 'push' }]);
});
```

`createTestRouter` is a shorthand for `createRouter` + `createMemoryAdapter`.
It returns `{ router, adapter }`; the router is exactly `Router<S, R>`
(same type as `createRouter` returns); the adapter is `MemoryAdapter` —
the core `UrlAdapter` plus test-only methods (`writeCalls`, `trigger`,
`setCurrent`, `reset`).

## Fresh router per test

No setup/teardown gymnastics — create a fresh `router` inside each test:

```js
test('initial state', t => {
    const { router } = createTestRouter({ map, initial: '/login' });
    t.is(router.getSnapshot().url, '/login');
});

test('navigates', t => {
    const { router } = createTestRouter({ map, initial: '/login' });
    router.navigate('/profile');
    t.is(router.getSnapshot().url, '/profile');
});
```

The router is frozen and self-contained — no global state, no cleanup
needed. `test` (not `test.serial`) is correct for pure router tests —
nothing touches `globalThis`.

## Simulating popstate

`adapter.setCurrent(url)` changes what `read()` returns **without**
recording a write. `adapter.trigger()` fires all `listen()` subscribers —
exactly what `popstate` does in the browser.

```js
test('popstate commits a new snapshot', t => {
    const { router, adapter } = createTestRouter({ map, initial: '/login' });

    adapter.setCurrent('/profile');
    adapter.trigger();

    const snap = router.getSnapshot();
    t.is(snap.url, '/profile');
    t.is(snap.navigationType, 'pop');
    t.deepEqual(adapter.writeCalls, []); // popstate does not write
});
```

`setCurrent` is the only way to simulate a browser-initiated change.
`write()` from the router goes through `navigate` / `replace`, not
`setCurrent`.

## Asserting history writes

`adapter.writeCalls` is an ordered log of `{ url, mode }` — every call
the router makes to `adapter.write`:

```js
test('push vs replace', t => {
    const { router, adapter } = createTestRouter({ map, initial: '/login' });

    router.navigate('/profile');
    router.replace('/profile?tab=1');
    router.navigate('/login');

    t.deepEqual(adapter.writeCalls, [
        { url: '/profile', mode: 'push' },
        { url: '/profile?tab=1', mode: 'replace' },
        { url: '/login', mode: 'push' },
    ]);
});

test('no-op navigate does not write', t => {
    const { router, adapter } = createTestRouter({ map, initial: '/login' });
    router.navigate('/login'); // already here
    t.deepEqual(adapter.writeCalls, []);
});
```

`reset()` clears `writeCalls` and history state but **preserves the
current URL** — useful for isolating phases within a long test:

```js
router.navigate('/profile');
adapter.reset();
router.navigate('/login');
t.deepEqual(adapter.writeCalls, [{ url: '/login', mode: 'push' }]);
t.is(adapter.historyState(), null);
```

## Multi-map: `resolveMap`

`createTestRouter` accepts either `map` (static) or `resolveMap` (dynamic),
not both. For state-relative routing:

```js
const guestMap = createMap({ login: file({ name: 'login' }) }, { notFound });
const userMap = createMap(
    { login: file({ name: 'login' }), profile: file({ name: 'profile' }) },
    { notFound }
);

test('auth gate switches map', t => {
    /** @type {{ isAuthed: boolean }} */
    const state = { isAuthed: false };
    const { router } = createTestRouter({
        resolveMap: ({ state: s }) => (s.isAuthed ? userMap : guestMap),
        getState: () => state,
        initial: '/login',
    });

    // Guest: /profile is notFound.
    t.is(router.navigate('/profile').status, 'notFound');

    // Flip state and revalidate — same URL, new map.
    state.isAuthed = true;
    router.revalidate();
    t.is(router.getSnapshot().status, 'notFound'); // still /profile, but re-evaluated

    // Now /profile exists.
    router.navigate('/login');
    t.is(router.navigate('/profile').status, 'matched');
});
```

`state` + `getState` are mutually exclusive, same as `map` + `resolveMap`.
`createTestRouter` throws if both are provided, or if neither.

## Guard tests

`createTestRouter` does **not** wire the guard layer — it calls
`createRouter`, not `createGuardedRouter`. Guards do not run; `nav.navigate`
does not exist on the returned object. For guard tests, wire manually:

```js
import { createGuardedRouter } from '@supercat1337/router/guard';
import { createMemoryAdapter } from '@supercat1337/router/testing';

test('guard blocks admin route', async t => {
    const adapter = createMemoryAdapter('/login');
    const { router, nav } = createGuardedRouter({
        adapter,
        resolveMap: () => userMap,
        getState: () => ({}),
        guards: [({ url }) => (url.startsWith('/admin') ? { block: true } : 'allow')],
        dev: true,
    });

    const result = await nav.navigate('/admin');
    t.is(result.status, 'blocked');
    t.is(router.getSnapshot().url, '/login');
});
```

`createMemoryAdapter` is the only piece from `/testing` needed here —
it implements the full `UrlAdapter` contract.

## What not to do

-   **Do not** test `getHistory`, `dryMatch`, `getActiveMap`,
    `resolveMapFor`, or `getRedirectPath` — they are `@internal` and
    stripped from `dist/types.d.ts`. Testing them couples your suite to
    implementation details that may disappear without a semver bump.
-   **Do not** reuse a single router across tests. Each test gets its own;
    no shared mutable state.
-   **Do not** use `test.serial` for pure router tests — there's no
    `globalThis` mutation, `test` is correct and faster.
-   **Do not** assert on `snapshot` object identity across transactions
    — a new snapshot is created on every commit, even if nothing
    "interesting" changed.

## Don't

-   **Don't** import `tests/helpers/memory-adapter.js` from the core repo
    into your project — use `@supercat1337/router/testing` instead. The
    core's test helper is not published; `createMemoryAdapter` is the
    public equivalent, version-locked to the core.
-   **Don't** wrap `createTestRouter` in your own `beforeEach`/`afterEach`
    unless you actually need shared state — the factory is cheap.

## See also

-   [`docs/api/testing.md`](../api/testing.md) — full `createTestRouter` /
    `createMemoryAdapter` reference.
-   [`docs/concepts/transactions.md`](../concepts/transactions.md) — what
    `navigationType: 'pop'` and `'push'` mean.
-   [`docs/api/guard.md`](../api/guard.md) — guard layer wiring.
-   [`docs/recipes/protected-route.md`](protected-route.md) — the pattern
    these tests exercise.
