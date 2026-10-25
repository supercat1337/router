# `@supercat1337/router/guard`

Optional async guard layer. Runs guards over a **proposal** before the router commits. The core remains synchronous; guards work outside the transaction.

Two ways to wire:

- **One call (recommended):** `createGuardedRouter({ adapter, resolveMap, getState, guards, ... })`.
- **Manual (custom wiring):** `createGuardLayer` → `wrapAdapter` → `createRouter` → `bind` → `navigate()`.

## `createGuardedRouter(options) → { router, guard, nav }`

One-call wiring. Replaces the mandatory 5-step sequence.

```js
import { createGuardedRouter } from '@supercat1337/router/guard';
import { createPathAdapter } from '@supercat1337/router/adapters';

const { router, guard, nav } = createGuardedRouter({
    // router side
    resolveMap,
    getState,
    adapter: createPathAdapter({ base: '/app/' }),
    maxRedirects: 10,

    // guard side
    guards,
    guardMaxRedirects: 10,
    onGuardError: e => console.warn(e.type, e),

    dev: true,
});

attachLinks(router, { navigate: nav.navigate, replace: nav.replace });
```

- **`maxRedirects`** — router limit (independent).
- **`guardMaxRedirects`** — guard-chain limit (independent).

Returns `{ router, guard, nav }`. `guard` is the `GuardLayer` (for `pending()` and manual reuse); `nav` is `{ navigate, replace }`, each returning `Promise<NavResult>`.

## `createGuardLayer(options) → GuardLayer`

Manual wiring — for custom order or when reusing a guard between two routers.

```js
const guard = createGuardLayer({ guards, dev });
const adapter = guard.wrapAdapter(createPathAdapter({ base: '/app/' }));
const router = createRouter({ resolveMap, getState, adapter });
guard.bind(router);
const nav = guard.navigate();
attachLinks(router, { navigate: nav.navigate, replace: nav.replace });
```

**Wiring order is mandatory** — `wrapAdapter` → `createRouter` → `bind` → `navigate()` → `attachLinks`.

### `GuardLayer`

| Method                 | Signature                          | Purpose                                                  |
| :--------------------- | :--------------------------------- | :------------------------------------------------------- |
| `wrapAdapter(adapter)` | `→ UrlAdapter`                     | Wrap a base adapter. **Only** integration into the core. |
| `bind(router)`         | `→ void`                           | Bind to a router. Must be called before `navigate()`.    |
| `navigate()`           | `→ { navigate, replace }`          | Build the guarded pair.                                  |
| `pending()`            | `→ { url, since, signal } \| null` | Current in-flight guard state.                           |

`pending().signal` aborts when a newer navigation starts or a redirect-iteration begins. Use it to cancel in-flight work triggered by a previous navigation.

### `GuardContext`

```ts
export type GuardContext = {
    url: string; // proposed RRU
    from: Snapshot; // last committed snapshot
    signal: AbortSignal; // aborts on newer nav / redirect-iteration
    router: Pick<Router, 'getSnapshot' | 'getState' | 'isCurrent' | 'url'>;
};
```

`ctx.router` deliberately lacks `navigate` / `replace` / `revalidate` / `dryMatch` — reentrancy through it is impossible by API.

### `Decision`

A guard returns (sync or async):

```ts
type Decision =
    | 'allow'
    | RedirectResult // from redirect('/x') — preferred
    | { redirect: string } // legacy shape, still accepted
    | { block: true };
```

- **`'allow'`** — continue to the next guard.
- **`RedirectResult` / `{ redirect }`** — restart the chain against the target.
- **`{ block: true }`** — stop; navigation blocked; URL rolled back.

Return `redirect('/x')` (branded) for redirects — the same function works in `notFound` handlers and guards, and `isRedirect()` narrows everywhere.

### `NavResult`

```ts
type NavResult = { status: 'committed'; snapshot: Snapshot } | { status: 'blocked' };
```

## Diagnostics

A discriminated union on `type` — distinct from the core's `NavigationErrorType` (the core does not know about guards):

```ts
type GuardErrorPayload =
    | { type: 'guard-throw'; error: unknown }
    | { type: 'guard-redirect-loop'; path: string[] }
    | { type: 'invalid-rru'; target: string }
    | { type: 'reentrancy' };
```

`onGuardError: (err, { url, from }) => void` receives them. In **dev**, `guard-redirect-loop` and `invalid-rru` throw instead.

## Behavior details

### Concurrent navigations

Each call to `nav.navigate` / `nav.replace` aborts the previous in-flight guard run. The aborted run returns `{ status: 'blocked' }`. The first un-aborted run wins.

### Redirect chain

The guard chain walks redirects until a guard returns `'allow'` or `{ block }`. `guardMaxRedirects` limits the chain; `redirectPath` grows with each hop. A cycle is diagnosed as `guard-redirect-loop` (dev: throws, prod: `onGuardError`).

A redirect commits via `router.replace(...)`, so the final snapshot has `navigationType: 'replace'`, not `'pop'`/`'push'`.

### `popstate`

`guard.wrapAdapter` intercepts `popstate` / `hashchange` from the browser, reads the new URL, runs the guard chain, and only then fires the adapter's `cb`.

- **allow, no redirect** → `cb(e)` fires; the core commits.
- **allow, redirect** → `router.replace(target)` commits the redirect target.
- **block** → the previous URL is written back via `adapter.write(from.url, 'replace')`.
- **error** → `onGuardError` + rollback.

This is the **only** integration point into the core — `adapter.listen`.

### Reentrancy

Calling `nav.navigate` / `nav.replace` from inside a guard's **synchronous frame** is `reentrancy`. In dev it throws; in prod `onGuardError` fires and the inner call returns `{ status: 'blocked' }`.

After the guard `await`s, the sync frame is over and concurrent calls are allowed (last-write-wins via abort).

## Don't

- **Don't** connect on the server. Access control is on the server; guards are a client-side UX filter.
- **Don't** rely on guards for security.
- **Don't** call `nav.navigate` / `nav.replace` from inside a guard's synchronous frame.
- **Don't** introduce `{ redirect: '/x' }` in new code — use `redirect('/x')`.
- **Don't** call `guard.bind(router)` again after `createGuardedRouter`.

## See also

- [`docs/recipes/protected-route.md`](../recipes/protected-route.md) — the canonical use case.
- [`docs/recipes/preload-before-navigate.md`](../recipes/preload-before-navigate.md) — blocking loaders in guards.
- [Transactions are synchronous](../concepts/transactions.md) — why guards live outside the core.
