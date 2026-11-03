# `@supercat1337/router/testing`

In-memory `UrlAdapter` and a `createTestRouter` factory for unit and
integration tests. Not part of the core router — opt-in.

```js
import { createTestRouter } from '@supercat1337/router/testing';
import { createMap, file } from '@supercat1337/router';

const map = createMap({ login: file({ name: 'login' }) }, { notFound: () => null });
const { router, adapter } = createTestRouter({ map, initial: '/login' });
```

## `createTestRouter(options)` → `{ router, adapter }`

Shorthand for `createRouter` + `createMemoryAdapter`. `router` is exactly
`Router<S, R>` (same type `createRouter` returns); `adapter` is
`MemoryAdapter` — the core `UrlAdapter` plus test-only methods.

| Option       | Type         | Default | Notes                                                |
| :----------- | :----------- | :------ | :--------------------------------------------------- |
| `map`        | `R`          | —       | Static map. Shorthand for `resolveMap: () => map`.   |
| `resolveMap` | `(ctx) => R` | —       | Dynamic map. Mutually exclusive with `map`.          |
| `state`      | `S`          | —       | Static state. Shorthand for `getState: () => state`. |
| `getState`   | `() => S`    | —       | State getter. Mutually exclusive with `state`.       |
| `initial`    | `string`     | `'/'`   | Initial RRU.                                         |
| `dev`        | `boolean`    | `true`  | Throws on classified diagnostics.                    |

At least one of `map` / `resolveMap` is required.

## `createMemoryAdapter(initial?)` → `MemoryAdapter`

Implements `UrlAdapter`. Extra methods:

| Method            | Purpose                                                       |
| :---------------- | :------------------------------------------------------------ |
| `writeCalls`      | Readonly array of `{ url, mode }` — every `write()` call.     |
| `trigger()`       | Fires all `listen()` subscribers — simulate `popstate`.       |
| `setCurrent(url)` | Changes `read()` output without recording a write.            |
| `reset()`         | Clears `writeCalls` and history state. Current URL preserved. |

## Patterns

**Test isolation** — fresh router per test:

```js
test('...', t => {
    const { router, adapter } = createTestRouter({ map, initial: '/login' });
    // ...
});
```

**Popstate** — `setCurrent` + `trigger`:

```js
adapter.setCurrent('/profile');
adapter.trigger();
t.is(router.getSnapshot().url, '/profile');
t.is(router.getSnapshot().navigationType, 'pop');
```

**Multi-map** — `resolveMap`:

```js
const { router } = createTestRouter({
    resolveMap: ({ state }) => (state.isAuthed ? userMap : guestMap),
    state: { isAuthed: false },
});
```

**Prod behavior** — `dev: false`:

```js
const { router } = createTestRouter({ map, dev: false });
t.is(router.navigate('/missing').status, 'notFound');
```

`writeCalls` описан в таблице, но не показан в паттернах. Один блок:

**History writes** — assert push vs replace:

```js
router.navigate('/profile');
router.replace('/profile');
t.deepEqual(adapter.writeCalls, [
    { url: '/profile', mode: 'push' },
    { url: '/profile', mode: 'replace' },
]);

adapter.reset();
t.deepEqual(adapter.writeCalls, []); // current URL preserved: '/profile'
```

## What `createTestRouter` does not wire

`createTestRouter` wraps `createRouter` — **not** `createGuardedRouter`. Guards
do not run. `nav.navigate` / `nav.replace` do not exist on the returned object.

For guarded-navigation tests, wire manually with `createMemoryAdapter`:

```js
import { createGuardedRouter } from '@supercat1337/router/guard';
import { createMemoryAdapter } from '@supercat1337/router/testing';

const adapter = createMemoryAdapter('/login');
const { router, nav } = createGuardedRouter({
    adapter,
    resolveMap: () => map,
    getState: () => ({}),
    guards: [() => 'allow'],
    dev: true,
});

const result = await nav.navigate('/admin');
t.is(result.status, 'committed');
```

`createMemoryAdapter` is the only piece from `/testing` you need here — it
implements the full `UrlAdapter` contract, including `trigger()` and
`writeCalls`.

## See also

- [`AGENTS.md`](../../AGENTS.md) — Testing section. AVA conventions, the `test.serial` requirement for global mutations, and the "use `createTestRouter`, not a custom adapter" rule.
- [`docs/concepts/transactions.md`](../concepts/transactions.md) — what most tests exercise: the LOOP, contract violations, error behavior.
- [`docs/concepts/snapshots.md`](../concepts/snapshots.md) — what `router.getSnapshot()` returns; most assertions in these tests are against it.
- [`docs/api/guard.md`](guard.md) — `createTestRouter` does **not** wire guards (see below). For guarded-navigation tests, use `createGuardedRouter` directly with `createMemoryAdapter`.
- [`docs/api/README.md`](README.md) — general API reference.
