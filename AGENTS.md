# `AGENTS.md` — function guide for AI assistants

> Function-by-function reference for AI assistants generating code **that uses** `@supercat1337/router`. Not a tutorial — that's `README.md`. Not a contributor guide — that's the internal guide on GitHub.
>
> **Version.** Verified against `@supercat1337/router@0.6.0`. On newer versions check `dist/types.d.ts`.

## Where to find things

| Need                                                                        | Go to                                                                           |
| :-------------------------------------------------------------------------- | :------------------------------------------------------------------------------ |
| New-user walkthrough                                                        | [`README.md`](README.md) → [`docs/getting-started.md`](docs/getting-started.md) |
| Core concepts (routes-as-data, maps, transactions, snapshots, typed routes) | [`docs/concepts/`](docs/concepts/README.md)                                     |
| Recipes (protected route, data loading, code splitting, React/Vue)          | [`docs/recipes/`](docs/recipes/README.md)                                       |
| Subpath module reference (adapters, links, guard, active-links)             | [`docs/api/`](docs/api/README.md)                                               |
| SSR                                                                         | [`docs/ssr.md`](docs/ssr.md)                                                    |
| Comparison with other routers                                               | [`docs/comparison.md`](docs/comparison.md)                                      |
| Canonical API surface (generated, do not edit)                              | `etc/*.api.md` on GitHub; `dist/types.d.ts` in npm                              |

Read this file for **AI-specific rules**: correct/incorrect patterns, non-goals, checklist. Read `docs/` for **what the API does**.

## Before writing any code

Five facts that cover 90% of correctness:

1. **The core is synchronous.** `resolveMap` and `notFound` must not return Promises. A Promise is a contract violation (`resolver-promise` / `notFound-promise`).
2. **Navigation is atomic.** `router.navigate('/x')` returns a `Snapshot` synchronously. Events fire after commit. There is no `await` between the call and the last event.
3. **URLs are Router-relative (RRU).** `Snapshot.url` starts with `/`, has no `#`. Browser URLs live only inside the adapter.
4. **Maps are independent.** No cross-map features, no global route registry. Context switching = `resolveMap` returns a different map.
5. **Public API only.** `getHistory`, `dryMatch`, `getActiveMap`, `resolveMapFor`, `getRedirectPath` are `@internal` — stripped from `dist/types.d.ts`. Do not use them in application code. `hasRoute` and `subscribe` **are** public.

## API reference

### Constructors

#### `file(meta) → FileNode`

Frozen, branded leaf. `name` required and unique across the map (enforced by `createMap`). Extra fields pass through unchanged.

```js
const home = file({ name: 'home', title: 'Home', layout: 'main' });
```

- **Do not** construct leaves by hand — `isFile` will fail.
- **Do not** reuse a `name` — `MapValidationError` with code `name-duplicate`.
- The `name` literal is preserved by `file<const M>`, feeding `RouteNames<T>` in `createMap`.

#### `folder(children, options?) → FolderNode`

Frozen, branded interior node. `options.notFound` optional; when omitted, nearest ancestor with `notFound` handles the miss, up to `map.notFound`.

```js
const admin = folder(
    {
        index: file({ name: 'adminHome' }), // /admin
        users: folder({ ':id': file({ name: 'adminUser' }) }), // /admin/users/:id
    },
    { notFound: () => ({ view: 'adminNF' }) }
);
```

- Key rules: `index` and `*` must be files; only one `:name` per level; children non-empty.
- Signature is `folder(children, options?)` — do not pass `options` first.
- Do not pass an empty `options` — omit the argument entirely.

#### `redirect(url) → RedirectResult`

Branded redirect. Return from `notFound` handler or a guard. `isRedirect()` narrows.

```js
const map = createMap(routes, {
    notFound: ({ url }) => (url.startsWith('/old') ? redirect('/new') : { view: '404' }),
});
```

- **Do not** return `{ url: '/new' }` from `notFound` — that's a render value, not a redirect. Use `redirect('/new')`.
- In guards prefer `redirect('/x')` over the legacy `{ redirect: '/x' }`. Legacy is accepted at runtime; new code should use the branded form.
- `isRedirect(result)` is the only supported detection.

### Map

#### `createMap(data, options) → RouterMap<RouteName>`

Frozen `RouterMap`. `options.notFound` mandatory.

```js
const admin = folder(
    {
        index: file({ name: 'adminHome' }),
        users: folder({ ':id': file({ name: 'adminUser' }) }),
    },
    { notFound: () => ({ view: 'adminNF' }) }
);

const account = folder({
    profile: file({ name: 'accountProfile' }),
});
```

`RouteName` inferred from the data literal via `RouteNames<T>`. Hand-built maps fall back to `string`.

| Member               | Signature         | Purpose                                                                 |
| :------------------- | :---------------- | :---------------------------------------------------------------------- |
| `notFound`           | `NotFoundHandler` | Fallback handler (read-only)                                            |
| `url(name, params?)` | `→ string`        | Canonical RRU. Throws `TypeError` on unknown name / missing param.      |
| `route(name)`        | `→ Route<N, P>`   | Frozen, branded (`isRoute`), cached. Throws on unknown name / wildcard. |
| `match(url)`         | `→ MatchResult`   | Match a **normalized** RRU.                                             |

- **Do not** call `map.match(url)` with a Browser URL — pass RRU or `normalizeRRU(url)` first.
- **Do not** mutate — it's frozen.

#### `map.route(name) → Route<N, P>`

Frozen, branded, cached `Route` handle.

```js
const userRoute = map.route('user');
userRoute.name; // 'user' (literal)
userRoute.params; // ['id'] — readonly string[]
userRoute.url({ id: '5' }); // '/users/5'
userRoute.url(); // TypeError — and compile error
```

- **Do not** store a `Route` across map boundaries — it stays bound to its own map. Use `router.route(name)` to re-bind to the current map.
- **Do not** construct `Route` by hand — `isRoute` will fail.
- **Do not** expect `map.route('catchall')` — wildcard has no canonical URL; throws `TypeError`.
- **Do** use `route.params` for runtime introspection — form rendering, debug panels, config validation.

#### `isMap(x) → boolean`

Brand check. The **only** supported detection. `instanceof` will not work.

#### `hasRoute(map, name) → boolean`

One-shot validation of a route name. `true` iff a non-wildcard leaf with `name === name` exists.

```js
import { hasRoute } from '@supercat1337/router';

for (const item of config) {
    if (!hasRoute(map, item.route)) {
        throw new Error(`unknown route "${item.route}" in config`);
    }
}
const href = map.url(item.route, item.params);
```

- **Does not** validate params. `hasRoute(map, 'user')` is `true`; `url('user')` still throws for missing `id`.
- **Wildcard (`*`) → `false`.**
- **Non-map / non-string / empty → `false`** (does not throw).
- **O(N)**, no memoization. Do not call per render.
- **Do not** use `try/catch` around every `url()` as substitute.

#### `MapValidationError`

`code: MapValidationErrorCode`, `path: string`. Codes: `data-not-object`, `data-key-invalid`, `index-at-root`, `notFound-missing`, `notFound-invalid`, `name-duplicate`, `node-not-constructed`.

### Router

#### `createRouter(options) → Router<S, R>`

Runs the initial transaction. **Throws** if initial fails (invalid RRU, async resolver, missing map, redirect loop).

```js
const router = createRouter<AppState, typeof userMap>({
    resolveMap: ({ state }) => (state.isAuthed ? userMap : guestMap),
    getState: () => appState,
    adapter: createPathAdapter({ base: '/app/' }),
});
```

| Option            | Required | Notes                                                 |
| :---------------- | :------: | :---------------------------------------------------- |
| `resolveMap`      |    ✅    | `(ctx: { state: S, url: string }) => R`. Synchronous. |
| `getState`        |    ✅    | `() => S`. Called once per transaction.               |
| `adapter`         |    ✅    | `UrlAdapter`.                                         |
| `maxRedirects`    |    —     | Default 10                                            |
| `onListenerError` |    —     | `(err, { event, snapshot }) => void`                  |
| `dev`             |    —     | Default: `NODE_ENV !== 'production'`                  |

Returned `Router<S, R>`:

| Method                 | Signature      | Purpose                                                  |
| :--------------------- | :------------- | :------------------------------------------------------- |
| `navigate(url)`        | `→ Snapshot`   | New transaction, history push                            |
| `replace(url)`         | `→ Snapshot`   | New transaction, history replace                         |
| `revalidate()`         | `→ Snapshot`   | Recompute current RRU (always increments `navigationId`) |
| `back()` / `forward()` | `→ void`       | Delegate to `history.back/forward`                       |
| `url(name, params?)`   | `→ string`     | Delegates to active map's `url` (typed name)             |
| `getSnapshot()`        | `→ Snapshot`   | Last committed snapshot (frozen)                         |
| `getState()`           | `→ S`          | The `getState` passed to `createRouter`                  |
| `isCurrent(id)`        | `→ boolean`    | `getSnapshot().navigationId === id`                      |
| `subscribe(fn)`        | `→ () => void` | Fires on **every** commit. Idempotent unsubscribe.       |
| `on(event, fn)`        | `→ () => void` | Subscribe to a specific event                            |
| `off(event, fn)`       | `→ void`       | Remove by identity                                       |
| `once(event, fn)`      | `→ () => void` | Single-fire subscription                                 |

- **Do not** `await` `navigate` / `replace` / `revalidate` — they are synchronous.
- **Do not** pass Browser URLs — pass RRUs (`/x`, not `https://host/x`).
- **Do not** use `navigationId` as a component key — compare `url` / `params` instead.
- **Do not** replace methods — `router` is frozen. Use `attachLinks(router, { navigate })`, `guard.navigate()`, `subscribe`.
- **Use `subscribe` for framework integration.** Do not stitch `afterEnter` / `afterLeave` / `mapChanged` / `navigationError`.

#### `subscribe(listener) → () => void`

Fires exactly once per committed snapshot — after `afterEnter` for normal transactions, after `navigationError` for prod error snapshots. **Not** for the initial commit (inside `createRouter`) nor for no-op `navigate` / `replace`. Thin alias of `on('commit', p => listener(p.snapshot))`.

```js
// React
const subscribe = useCallback(cb => router.subscribe(cb), [router]);
const snapshot = useSyncExternalStore(subscribe, () => router.getSnapshot());

// Vue
const snapshot = shallowRef(router.getSnapshot());
onMounted(() => {
    unsub = router.subscribe(s => {
        snapshot.value = s;
    });
});
```

`getSnapshot()` returns a stable reference when nothing changed — required by `useSyncExternalStore`.

### Type guards

| Function        | Signature   | Purpose          |
| :-------------- | :---------- | :--------------- |
| `isFile(x)`     | `→ boolean` | `FileNode`       |
| `isFolder(x)`   | `→ boolean` | `FolderNode`     |
| `isMap(x)`      | `→ boolean` | `RouterMap`      |
| `isRouter(x)`   | `→ boolean` | `Router`         |
| `isRedirect(x)` | `→ boolean` | `RedirectResult` |

**Do not** replace with structural checks (`'name' in x`) or `instanceof` — brands are identity checks against a private Symbol.

`isFile` is required to read `.name` on `Snapshot.leaf`:

```js
const leaf = snapshot.leaf;
if (isFile(leaf)) console.log(leaf.name);
```

`isRouter` — runtime check for the object returned by `createRouter`. Structural lookalikes return `false`.

### Normalization

#### `normalizeRRU(url) → string`

Single normalization, idempotent. Strips **all** trailing slashes except root `/`. Does not percent-decode, does not normalize case.

```js
normalizeRRU('/users/5//'); // '/users/5'
normalizeRRU('/'); // '/'
```

- **Do not** use `new URL(...)` — returns a Browser URL.
- **Do not** apply to Browser URLs — adapter already does BU→RRU.

### Adapters

See [`docs/api/adapters.md`](docs/api/adapters.md) for full semantics.

#### `createPathAdapter({ base }) → UrlAdapter`

History API mode. `base` required unless `<base href>` with trailing slash exists. Auto-derive from `location.pathname` is refused.

#### `createHashAdapter({ base? }) → UrlAdapter`

Hash mode. Default `base = location.pathname`. In-page anchors (`#section`) not supported via `href`.

### Links

See [`docs/api/links.md`](docs/api/links.md).

#### `attachLinks(router, options?) → () => void`

Delegated click listener for `[data-router-link]`. `[data-router-link="replace"]` uses `replace`. `navigate` / `replace` overrides receive an RRU.

```js
const detach = attachLinks(router);
// or, with a guard layer:
attachLinks(router, { navigate: nav.navigate, replace: nav.replace });
```

- **Selector is fixed** (`[data-router-link]`).
- Accepts a structurally-typed router — only `adapter`, `navigate`, `replace` used.

#### `attachPreload(router, options?) → () => void`

Preload-on-hover/focus. `ctx.signal` aborts on `detach()`. Each element preloads at most once.

```js
attachPreload(router, {
    preload: async (leaf, ctx) => {
        if (!isFile(leaf) || !leaf.load) return;
        if (cache.has(leaf.name)) return;
        if (ctx.signal.aborted) return;
        cache.set(leaf.name, await leaf.load());
    },
});
```

Default: `leaf.preload?.(ctx) ?? leaf.load?.()`. `leaf.preload` receives `ctx`; `leaf.load` is called without arguments.

- **Do not** add custom `mouseenter` listeners on `[data-router-link]`.
- **Do not** rely on `attachPreload` for correctness — opportunistic.
- **Do not** call `leaf.preload()` without `ctx`.

### Guard layer

See [`docs/api/guard.md`](docs/api/guard.md).

#### `createGuardLayer(options) → GuardLayer`

Async pre-navigation checks, over a proposal. Core stays synchronous.

```js
const guard = createGuardLayer({
    guards: [
        async ({ url, from, signal }) => {
            /* ... */ return 'allow';
        },
    ],
});
```

Options: `guards` (required), `maxRedirects` (10), `onError`, `dev`.

Returned `GuardLayer`:

| Method                 | Signature                          | Purpose                            |
| :--------------------- | :--------------------------------- | :--------------------------------- |
| `wrapAdapter(adapter)` | `→ UrlAdapter`                     | Only integration into core         |
| `bind(router)`         | `→ void`                           | Must be called before `navigate()` |
| `navigate()`           | `→ { navigate, replace }`          | Each returns `Promise<NavResult>`  |
| `pending()`            | `→ { url, since, signal } \| null` | In-flight guard state              |

**Wiring order is mandatory:**

```js
const guard = createGuardLayer({ guards });
const adapter = guard.wrapAdapter(createPathAdapter({ base: '/app/' }));
const router = createRouter({ resolveMap, getState, adapter });
guard.bind(router);
const nav = guard.navigate();
attachLinks(router, { navigate: nav.navigate, replace: nav.replace });
```

`NavResult` is `{ status: 'committed'; snapshot } | { status: 'blocked' }`.

Guard decisions:

```ts
type Decision = 'allow' | RedirectResult | { redirect: string } | { block: true };
```

Diagnostics:

```ts
type GuardErrorPayload =
    | { type: 'guard-throw'; error: unknown }
    | { type: 'guard-redirect-loop'; path: string[] }
    | { type: 'invalid-rru'; target: string }
    | { type: 'reentrancy' };
```

- **Do not** connect on the server. Access control is on the server; guards are a client-side UX filter.
- **Do not** call `nav.navigate` / `nav.replace` from inside a guard's sync frame — `reentrancy`.
- **Do not** introduce `{ redirect: '/x' }` in new code — use `redirect('/x')`.

#### `createGuardedRouter(options) → { router, guard, nav }`

One-call wiring.

```js
const { router, guard, nav } = createGuardedRouter({
    resolveMap,
    getState,
    adapter: createPathAdapter({ base: '/app/' }),
    guards,
    dev: true,
});
attachLinks(router, { navigate: nav.navigate, replace: nav.replace });
```

`maxRedirects` is the router limit; `guardMaxRedirects` is the guard limit — independent.

- **Do not** call `guard.bind(router)` again — already done.
- **Do not** wrap the adapter — pass base adapter; wiring is internal.

### Active links

See [`docs/api/active-links.md`](docs/api/active-links.md).

#### `attachActiveLinks(router, options?) → () => void`

`aria-current` marking for `[data-router-link]`. Subscribes via `router.subscribe`, scans DOM on every commit. `detach()` unsubscribes and removes the attribute from elements this instance touched.

```js
attachActiveLinks(router);
attachActiveLinks(router, { ariaCurrent: 'step' });
attachActiveLinks(router, { ariaCurrent: false }); // no-op
```

- **Do not** expect marking on elements added after the last commit — rescan happens on next commit.
- **Do not** rely on partial matches — strict RRU equality (`/profile?tab=1` ≠ `/profile`). Prefix matching is not in v1.

## Common mistakes — Do / Don't

```js
// ✅ Sync resolver, multiple maps
const resolveMap = ({ state }) => state.isAuthed ? userMap : guestMap;

// ❌ Async resolver — diagnosed as resolver-promise
const resolveMap = async ({ state }) => userMap;

// ✅ Async data loading in afterEnter, with isCurrent
router.on('afterEnter', async ({ snapshot }) => {
    const id = snapshot.navigationId;
    const data = await loadData(snapshot);
    if (!router.isCurrent(id)) return;
    render(snapshot, data);
});

// ❌ Hooks from framework routers — do not exist
const { id } = useParams();

// ❌ Awaiting navigate — navigate is sync
const snap = await router.navigate('/x');

// ❌ Cross-map features — do not exist by design
router.crossMapRedirect('/admin', '/login');

// ❌ Browser URL to navigate — must be RRU
router.navigate('https://example.com/x');
router.navigate('/x'); // ✓

// ❌ navigationId as component key — use url/params instead
key={snapshot.navigationId}

// ❌ Dev-only methods in application code
router.getHistory();

// ✅ Framework integration via subscribe — single hook, fires on every commit
useSyncExternalStore(cb => router.subscribe(cb), () => router.getSnapshot());

// ❌ Stitching four events together — misses revalidate() without URL change,
//    and misses prod error snapshots
const EVENTS = ['afterEnter', 'afterLeave', 'mapChanged', 'navigationError'];
EVENTS.forEach(e => router.on(e, onChange));

// ✅ Route names from data — validate once, at data-load time
if (!hasRoute(map, nameFromConfig)) throw new Error(`unknown route ${nameFromConfig}`);
const href = map.url(nameFromConfig);

// ❌ try/catch around every url() — hides configuration bugs
try { router.url(nameFromConfig) } catch { /* silently fall back */ }
```

## When the user asks for something the library doesn't support

State the non-goal and propose the intended workaround. **Do not invent an API.**

| User asks for                    | Doesn't have                  | Correct answer                                                                                                                    |
| :------------------------------- | :---------------------------- | :-------------------------------------------------------------------------------------------------------------------------------- |
| `useParams()` hook               | No hooks                      | `snapshot.params` + framework glue (see [`docs/recipes/react.md`](docs/recipes/react.md))                                         |
| `<Link to="/x">` component       | No components                 | `attachLinks(router)` + `<a data-router-link>`                                                                                    |
| Blocking loaders                 | Sync core, no `await`         | `afterEnter` + optimistic UI                                                                                                      |
| Built-in code splitting          | Not in core                   | User-side `import()` in `afterEnter`, or TanStack Router                                                                          |
| Lazy route tree (deferred map)   | Violates sync core            | `file({ load })` + `afterEnter`; tree stays synchronous                                                                           |
| Blocking loaders (pre-navigate)  | Not in core                   | Guard layer with `leaf.preload` + `signal` — [`docs/recipes/preload-before-navigate.md`](docs/recipes/preload-before-navigate.md) |
| Devtools extension               | Not in package                | `globalThis.__SUPERCAT_ROUTER_DEVTOOLS__` — [`docs/recipes/devtools.md`](docs/recipes/devtools.md)                                |
| Built-in cache with invalidation | Not in core                   | `@supercat1337/persist-core` + user-side loader                                                                                   |
| Scroll restoration               | Not in core                   | `afterEnter` + `window.scrollTo`                                                                                                  |
| Cross-map redirect               | Not by design                 | Different map via `resolveMap`, or guard layer                                                                                    |
| Global route registry            | Not by design                 | Multiple maps + `resolveMap`                                                                                                      |
| Typed params per route           | ✅ `RouteParamsFor<T>` (0.6+) | Prefer `map.route(name)`                                                                                                          |
| `tryUrl` (non-throwing `url`)    | Not in 0.6                    | `hasRoute(map, name)` at load time + plain `url()` everywhere else                                                                |

For the top half of this table, the honest recommendation is often: **"if you need this in the core, use TanStack Router (React) or Vue Router (Vue) instead."** Suggesting a different router is the correct answer, not a failure.

## Type support

Verified type surface (see `dist/types.d.ts`):

- **Route names** — `RouteNames<T>` inferred from the `createMap` data literal (`const` type parameters, TS 5.0+). `map.url("typo")` is a compile error. In JS + JSDoc, only when the data literal is written inline in `createMap(...)`.
- **Route params** — `RouteParamsFor<T>` collects `:name` keys per route into `{ [N]: Record<string, string> }`. Fallback `Record<string, string>` for hand-built maps.
- **`Route<N, P>`** — `map.route(name)` / `router.route(name)` return a `Route<N, P>`: `name: N` (literal), `params: readonly (keyof P)[]`, `url(...args: ParamsArgs<P>)`. Frozen, cached, branded.
- **Application state** — `createRouter<S, R>` preserves `S` through `getState()` and `resolveMap({ state })`.
- **Router** — `Router<S, R>.url(name)` narrows `name` to `RouteNameOf<R>`.
- **Event payloads** — typed per key.
- **Snapshot** — `navigationType: NavigationType`, `chain: readonly Node[]`, `params` / `partialParams` / `search: Readonly<Record<string,string>>`, `leaf: Node | undefined`.
- **`FileMeta.load` / `FileMeta.preload`** — typed conventions. `load: () => Promise<unknown>` — signal-free. `preload: (ctx: PreloadContext) => void | Promise<unknown>` — `ctx.signal` aborts on detach.
- **`NavigationType`** — `'initial' | 'push' | 'replace' | 'pop' | 'revalidate'`. The transaction source, not a direction.
- **`MatchResult.search`** — `Record<string, string>` on both branches. Decoded, last-wins.
- **`GuardErrorPayload`** — discriminated union; narrow on `.type`.

When generating TypeScript, prefer `createRouter<AppState, typeof map>({...})` — explicit generics make `state` in `resolveMap` and `url(name)` narrowing predictable.

## Checklist before returning generated code

- [ ] No `async` / `await` inside `resolveMap` or `notFound`.
- [ ] `navigate` / `replace` arguments are RRUs (`/x`, no `#`).
- [ ] Data loading is in `afterEnter` with `router.isCurrent(id)` check.
- [ ] Code splitting is `file({ load })` + `afterEnter`, not a lazy map / Promise-returning `resolveMap`.
- [ ] Blocking pre-navigation loaders use the guard layer (`leaf.preload` + `signal`), not the core.
- [ ] Framework integration uses `router.subscribe` — not the four-event stitch.
- [ ] Route names from external data validated once via `hasRoute`, not `try/catch` per render.
- [ ] No `getHistory` / `dryMatch` / `getActiveMap` / `resolveMapFor` / `getRedirectPath`.
- [ ] Guard wiring: either `createGuardedRouter` (one call) or the exact 5-step order.
- [ ] Guard decisions use `redirect('/x')`, not `{ redirect: '/x' }` (legacy).
- [ ] Preload-on-hover uses `attachPreload(router, { preload })`, not custom `mouseenter` on `[data-router-link]`.
- [ ] Do not mutate `router` (frozen) — use `attachLinks` options / `guard.navigate()` / `subscribe`.

## Tests and global mutations

Tests that call `installDom()` or mutate `globalThis.__SUPERCAT_ROUTER_DEVTOOLS__` must use `test.serial`. AVA runs tests in a file concurrently by default; async tests interleave at `await` points, and a `dom.teardown()` from one test can delete `document` while another is still running.

## See also

- [`README.md`](README.md) — landing page.
- [`docs/`](docs/README.md) — concepts, recipes, API reference.
- `dist/types.d.ts` — authoritative public API surface.
- `etc/router.api.md` — canonical API report (diff-friendly, GitHub only).
