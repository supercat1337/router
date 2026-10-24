# `AGENTS.md` — function guide for AI assistants

> **What this file is.** A function-by-function reference for AI assistants generating code **that uses** `@supercat1337/router`. Not a tutorial (that's `README.md`), not a guide to editing the source (that's `AGENTS.internal.md` on GitHub).
>
> **Version.** Verified against `@supercat1337/router@0.2.0`. If you're using a newer version, check `dist/types.d.ts`.
>
> **How to use it.** Copy into your project root, or paste the relevant section into the assistant's context.

---

## Before writing any code

Five facts that cover 90% of correctness:

1. **The core is synchronous.** `resolveMap` and `notFound` must not return Promises. A Promise is a contract violation (`resolver-promise` / `notFound-promise`).
2. **Navigation is atomic.** `router.navigate('/x')` returns a `Snapshot` synchronously. Events fire after commit. There is no `await` between the call and the last event.
3. **URLs are Router-relative (RRU).** `Snapshot.url` starts with `/`, has no `#`. Browser URLs live only inside the adapter.
4. **Maps are independent.** No cross-map features, no global route registry. Context switching = `resolveMap` returns a different map.
5. **Public API only.** `getHistory`, `dryMatch`, `getActiveMap`, `resolveMapFor`, `getRedirectPath` are `@internal` — stripped from `dist/types.d.ts`. Do not use them in application code. `hasRoute` and `subscribe` **are** public.

---

## API reference

### Constructors

#### `file(meta) → FileNode`

Creates a frozen, branded leaf node. `name` is required and must be unique across the map (enforced by `createMap`). Extra fields pass through unchanged.

```js
const home = file({ name: 'home', title: 'Home', layout: 'main' });
```

````

- **Do not** construct leaves by hand — `isFile` will fail.
- **Do not** reuse a `name` — throws `MapValidationError` with code `name-duplicate`.
- The `name` literal is preserved by `file<const M>` — this feeds `RouteNames<T>` in `createMap`.

#### `folder(options, children) → FolderNode`

Creates a frozen, branded interior node. `options.notFound` is optional; when omitted, the nearest ancestor with `notFound` handles the miss, up to `map.notFound`.

```js
const admin = folder(
    { notFound: () => ({ view: 'adminNF' }) },
    {
        index: file({ name: 'adminHome' }), // /admin
        users: folder(
            {},
            {
                ':id': file({ name: 'adminUser' }), // /admin/users/:id
            }
        ),
    }
);
```

- **Key rules:** `index` and `*` must be files; only one `:name` per level; children must be non-empty.
- **Do not** call `folder` with an empty `children` object — throws `TypeError`.

#### `redirect(url) → RedirectResult`

Branded redirect result. Return from a `notFound` handler **or** from a guard to signal "don't commit this URL; go here instead". `isRedirect()` narrows everywhere.

```js
const map = createMap(routes, {
    notFound: ({ url }) => (url.startsWith('/old') ? redirect('/new') : { view: '404' }),
});

// In a guard:
const guard = createGuardLayer({
    guards: [ctx => (ctx.url === '/old' ? redirect('/new') : 'allow')],
});
```

- **Do not** return `{ url: '/new' }` from `notFound` — that's a render value, not a redirect. Use `redirect('/new')`.
- **In guards:** prefer `redirect('/x')` over the legacy `{ redirect: '/x' }` shape. The legacy shape is still accepted for backward compatibility, but new code should use `redirect()`.
- `isRedirect(result)` is the only supported way to detect one.

---

### Map

#### `createMap(data, options) → RouterMap<RouteName>`

Validates tree-wide invariants and returns a frozen `RouterMap`. `options.notFound` is **mandatory**.

```js
const map = createMap(
    {
        login: file({ name: 'login' }),
        admin: folder({}, { index: file({ name: 'adminHome' }) }),
    },
    { notFound: () => ({ view: '404' }) }
);
```

`RouteName` is inferred from the data literal via `RouteNames<T>`. So `map.url("adminHome")` completes and `map.url("adminHme")` is a compile error — provided the data literal is written inline (see [Type support](#type-support)).

Returned `RouterMap`:

| Member               | Signature         | Purpose                                                                                                 |
| :------------------- | :---------------- | :------------------------------------------------------------------------------------------------------ |
| `notFound`           | `NotFoundHandler` | Fallback handler (read-only)                                                                            |
| `url(name, params?)` | `→ string`        | Build canonical RRU for a named route. Throws `TypeError` if the name is unknown or a param is missing. |
| `match(url)`         | `→ MatchResult`   | Match a **normalized** RRU. Returns a discriminated union `matched \| notFound`.                        |

- **Do not** call `map.match(url)` with a Browser URL — pass an RRU (or `normalizeRRU(url)` first).
- **Do not** mutate the returned map — it's frozen.

#### `isMap(x) → boolean`

Brand check. The **only** supported way to detect a `RouterMap`. `instanceof` will not work.

#### `hasRoute(map, name) → boolean`

One-shot validation of a route name. Returns `true` iff `map.url(name, ...)` would not throw for the reason "route not found" — i.e. a non-wildcard leaf with `name === name` exists.

```js
import { hasRoute } from '@supercat1337/router';

// At data-load time (once):
for (const item of config) {
    if (!hasRoute(map, item.route)) {
        throw new Error(`unknown route "${item.route}" in config`);
    }
}

// Everywhere else — no try/catch:
const href = map.url(item.route, item.params);
```

- **Does not** validate params. `hasRoute(map, 'user')` returns `true`, but `url('user')` still throws for missing `id`. Parameter presence is a data-validation question, not a route-existence one.
- **Wildcard (`*`) → `false`.** Wildcards have no canonical URL; `url()` throws for them; `hasRoute` reflects that.
- **Non-map / non-string / empty-string → `false`** (does not throw — this is a helper, not a validator).
- **O(N) in tree size**, no memoization. Do not call per render.
- **Do not** use `try/catch` around every `url()` call as a substitute — that hides configuration bugs.

#### `MapValidationError`

Thrown by `createMap` for tree-wide invariant violations. Has `code: MapValidationErrorCode` and `path: string`.

```js
try {
    createMap({ login: 'nope' }, { notFound });
} catch (e) {
    if (e instanceof MapValidationError) console.error(e.code, e.path);
}
```

Codes: `data-not-object`, `data-key-invalid`, `index-at-root`, `notFound-missing`, `notFound-invalid`, `name-duplicate`, `node-not-constructed`.

---

### Router

#### `createRouter(options) → Router<S, R>`

Creates a router and runs the initial transaction. **Throws** if the initial transaction fails (invalid RRU, async resolver, missing map, redirect loop, etc.).

```js
const router = createRouter<AppState, typeof userMap>({
    resolveMap: ({ state }) => (state.isAuthed ? userMap : guestMap),
    getState: () => appState,
    adapter: createPathAdapter({ base: '/app/' }),
});
```

Options:

| Option            | Required | Notes                                                     |
| :---------------- | :------: | :-------------------------------------------------------- |
| `resolveMap`      |    ✅    | `(ctx: { state: S, url: string }) => R`. **Synchronous.** |
| `getState`        |    ✅    | `() => S`. Called once per transaction.                   |
| `adapter`         |    ✅    | `UrlAdapter`. See adapters below.                         |
| `maxRedirects`    |    —     | Default 10                                                |
| `onListenerError` |    —     | `(err, { event, snapshot }) => void`                      |
| `dev`             |    —     | Default: `NODE_ENV !== 'production'`                      |

`S` — application state type (never `any` inside `resolveMap`); `R` — map type (drives `url()` route-name completion).

Returned `Router<S, R>`:

| Method                 | Signature      | Purpose                                                           |
| :--------------------- | :------------- | :---------------------------------------------------------------- |
| `navigate(url)`        | `→ Snapshot`   | New transaction, history push                                     |
| `replace(url)`         | `→ Snapshot`   | New transaction, history replace                                  |
| `revalidate()`         | `→ Snapshot`   | Recompute current RRU (always increments `navigationId`)          |
| `back()` / `forward()` | `→ void`       | Delegate to `history.back()` / `forward()`                        |
| `url(name, params?)`   | `→ string`     | Delegates to the active map's `url` (typed name)                  |
| `getSnapshot()`        | `→ Snapshot`   | Last committed snapshot (frozen)                                  |
| `getState()`           | `→ S`          | The `getState` passed to `createRouter`                           |
| `isCurrent(id)`        | `→ boolean`    | `getSnapshot().navigationId === id`                               |
| `subscribe(fn)`        | `→ () => void` | Subscribe to **every** commit. Returns an idempotent unsubscribe. |
| `on(event, fn)`        | `→ () => void` | Subscribe to a specific event. Returns an idempotent unsubscribe. |
| `off(event, fn)`       | `→ void`       | Remove listener by identity                                       |
| `once(event, fn)`      | `→ () => void` | Single-fire subscription                                          |

- **Do not** `await` `navigate` / `replace` / `revalidate` — they are synchronous.
- **Do not** pass Browser URLs to `navigate` / `replace` — pass RRUs (`/x`, not `https://host/x`).
- **Do not** use `navigationId` as a component key — compare `url` / `params` instead.
- **Do not** call `navigate` / `replace` / `revalidate` from inside a listener or a guard's synchronous frame — that's `reentrancy`, diagnosed (throw in dev, current snapshot in prod).
- **Use `subscribe` for framework integration.** Do **not** stitch together `afterEnter` / `afterLeave` / `mapChanged` / `navigationError` — that pattern misses `revalidate()` with an unchanged URL and misses prod error snapshots. See [Common mistakes](#common-mistakes--do--dont).

#### `subscribe(listener) → () => void`

Fires **exactly once per committed snapshot** — after `afterEnter` for normal transactions, after `navigationError` for prod error snapshots. Does **not** fire for the initial commit (which happens inside `createRouter` before this method is available) nor for no-op `navigate` / `replace` calls. Thin alias of `on('commit', p => listener(p.snapshot))`.

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

`router.getSnapshot()` returns a stable reference when nothing changed — required by `useSyncExternalStore`.

---

### Type guards

| Function        | Signature   | Purpose                          |
| :-------------- | :---------- | :------------------------------- |
| `isFile(x)`     | `→ boolean` | Brand check for `FileNode`       |
| `isFolder(x)`   | `→ boolean` | Brand check for `FolderNode`     |
| `isMap(x)`      | `→ boolean` | Brand check for `RouterMap`      |
| `isRedirect(x)` | `→ boolean` | Brand check for `RedirectResult` |

**Do not** replace these with structural checks (`'name' in x`) or `instanceof` — brands are identity checks against a private `Symbol`, and structural lookalikes will pass falsely.

`isFile` is required to read `.name` on `Snapshot.leaf` — `Node = FileNode | FolderNode`, and only `FileNode` has `.name`:

```js
const leaf = snapshot.leaf;
if (isFile(leaf)) console.log(leaf.name); // narrowed
```

---

### Normalization

#### `normalizeRRU(url) → string`

The single normalization used everywhere. Idempotent. Strips **all** trailing slashes except for root `/`. Does not percent-decode, does not normalize case.

```js
normalizeRRU('/users/5//'); // → '/users/5'
normalizeRRU('/'); // → '/'
```

- **Do not** use `new URL(...)` for this — it returns a Browser URL, not an RRU.
- **Do not** apply to Browser URLs — the adapter already does BU→RRU conversion.

---

### Adapters

#### `createPathAdapter({ base }) → UrlAdapter`

History API mode. `base` is the app's mount pathname prefix (must end with `/`).

```js
const adapter = createPathAdapter({ base: '/app/' });
```

- **`base` is required** unless a `<base href>` with a trailing slash is in the document. Auto-deriving from `location.pathname` is refused (`TypeError`) — it gives the wrong base on deep links.
- **SSR:** `read()` returns `'/'`; `write` / `listen` are no-ops. Still needs explicit `base`.

#### `createHashAdapter({ base? }) → UrlAdapter`

Hash mode (`#/users/5`). Default `base = location.pathname`.

- **SSR:** explicit `base` is required (`TypeError` otherwise).
- **In-page anchors** (`#section`) in hash mode are not supported via `href` — use `scrollIntoView` after `afterEnter`.

---

### Links

#### `attachLinks(router, options?) → () => void`

Single delegated click listener on `document` for `[data-router-link]` elements. Opt-in; no-op outside the browser.

```html
<a href="/profile" data-router-link>Profile</a>
<a href="/profile" data-router-link="replace">Profile</a>
```

```js
const detach = attachLinks(router);
// or, when using a guard layer:
attachLinks(router, { navigate: nav.navigate, replace: nav.replace });
```

- **Selector is fixed** (`[data-router-link]`). Do not invent a custom attribute.
- `navigate` / `replace` overrides receive an **RRU**, not the raw `href` — `attachLinks` normalizes before calling them.
- `attachLinks` accepts a structurally-typed router — only `adapter`, `navigate`, `replace` are used. A full `Router` satisfies this.

---

### Guard layer

#### `createGuardLayer(options) → GuardLayer`

Optional async pre-navigation checks. Runs _outside_ the transaction, over a proposal. The core stays synchronous.

```js
const guard = createGuardLayer({
    guards: [
        async ({ url, from, signal }) => {
            if (!url.startsWith('/admin')) return 'allow';
            // ... use signal for cancellation
            return 'allow';
        },
    ],
});
```

Options: `guards` (required, array), `maxRedirects` (default 10), `onError` (`GuardErrorPayload` hook), `dev`.

Returned `GuardLayer`:

| Method                 | Signature                          | Purpose                                                    |
| :--------------------- | :--------------------------------- | :--------------------------------------------------------- |
| `wrapAdapter(adapter)` | `→ UrlAdapter`                     | Wrap a base adapter. **Only** integration into the core.   |
| `bind(router)`         | `→ void`                           | Bind to a router. Must be called before `navigate()`.      |
| `navigate()`           | `→ { navigate, replace }`          | Build the guarded pair. Each returns `Promise<NavResult>`. |
| `pending()`            | `→ { url, since, signal } \| null` | Current in-flight guard state.                             |

**Wiring order is mandatory** — do not reorder:

```js
const guard = createGuardLayer({ guards });
const adapter = guard.wrapAdapter(createPathAdapter({ base: '/app/' }));
const router = createRouter({ resolveMap, getState, adapter });
guard.bind(router); // 1
const nav = guard.navigate(); // 2
attachLinks(router, { navigate: nav.navigate, replace: nav.replace }); // 3
```

Or use `createGuardedRouter` (below) to do it in one call.

`NavResult` is `{ status: 'committed'; snapshot: Snapshot } | { status: 'blocked' }`.

**Guard decisions** — return one of:

```ts
type Decision =
    | 'allow'
    | RedirectResult // redirect('/x') — preferred
    | { redirect: string } // legacy shape, still accepted
    | { block: true };
```

**Diagnostics** — discriminated on `type`:

```ts
type GuardErrorPayload =
    | { type: 'guard-throw'; error: unknown }
    | { type: 'guard-redirect-loop'; path: string[] }
    | { type: 'invalid-rru'; target: string }
    | { type: 'reentrancy' };
```

These are distinct from the core's `NavigationErrorType`: the core does not know about guards.

**`pending().signal`** — aborts when a newer navigation starts or a redirect-iteration begins. Use it to cancel in-flight work triggered by a previous navigation.

- **Do not** connect the guard layer on the server (SSR). Access control is on the server; guards are a client-side UX filter.
- **Do not** call `nav.navigate` / `nav.replace` from inside a guard's synchronous frame — that's `reentrancy`.
- **Do not** introduce `{ redirect: '/x' }` in new code — use `redirect('/x')`.

#### `createGuardedRouter(options) → { router, guard, nav }`

One-call wiring: `createGuardLayer` → `wrapAdapter` → `createRouter` → `bind` → `navigate()`. Replaces the mandatory 5-step sequence.

```js
import { createGuardedRouter } from '@supercat1337/router/guard';

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

Returns `{ router, guard, nav }` — `guard` is the `GuardLayer` (for `pending()` and manual reuse); `nav` is `{ navigate, replace }` (each returns `Promise<NavResult>`).

`maxRedirects` is the router limit; `guardMaxRedirects` is the guard limit. They are independent.

- **Do not** call `guard.bind(router)` again — `createGuardedRouter` already did.
- **Do not** wrap the adapter manually — pass the base adapter; `createGuardedRouter` wires `wrapAdapter` internally.

---

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

---

## When the user asks for something the library doesn't support

State the non-goal and propose the intended workaround. **Do not invent an API.**

| User asks for                    | Doesn't have          | Correct answer                                                     |
| :------------------------------- | :-------------------- | :----------------------------------------------------------------- |
| `useParams()` hook               | No hooks              | `snapshot.params` + framework glue (`README.md#react-integration`) |
| `<Link to="/x">` component       | No components         | `attachLinks(router)` + `<a data-router-link>`                     |
| Blocking loaders                 | Sync core, no `await` | `afterEnter` + optimistic UI                                       |
| Built-in code splitting          | Not in core           | User-side `import()` in `afterEnter`, or TanStack Router           |
| Built-in cache with invalidation | Not in core           | `@supercat1337/persist-core` + user-side loader                    |
| Scroll restoration               | Not in core           | `afterEnter` + `window.scrollTo`                                   |
| Cross-map redirect               | Not by design         | Different map via `resolveMap`, or guard layer                     |
| Global route registry            | Not by design         | Multiple maps + `resolveMap`                                       |
| Typed params per route           | Not in 0.2            | `Record<string, string>` for now; validate at data-load time       |
| `tryUrl` (non-throwing `url`)    | Not in 0.2            | `hasRoute(map, name)` at load time + plain `url()` everywhere else |

For the top half of this table, the honest recommendation is often: **"if you need this in the core, use TanStack Router (React) or Vue Router (Vue) instead."** Suggesting a different router is the correct answer, not a failure.

---

## Type support

Verified type surface (see `dist/types.d.ts`):

- **Route names** — `RouteNames<T>` inferred from the `createMap` data literal (`const` type parameters, TS 5.0+). `map.url("typo")` is a compile error. In JS + JSDoc, only when the data literal is written inline in `createMap(...)`.
- **Application state** — `createRouter<S, R>` preserves `S` through `getState()` and `resolveMap({ state })`; `state` is never `any` in the hot path.
- **Router** — `Router<S, R>.url(name)` narrows `name` to `RouteNameOf<R>` (the map's route-name union).
- **Event payloads** — typed per key: `router.on("afterEnter", p => …)` — `p` is `EventPayloads["afterEnter"]`.
- **Snapshot** — `chain: readonly Node[]`, `params: Readonly<Record<string,string>>`, `leaf: Node | undefined`. All deeply frozen at runtime.
- **`MatchResult.search`** — `Record<string, string>` on both branches (`matched` / `notFound`). Decoded values, last-wins for duplicates.
- **`GuardErrorPayload`** — discriminated union; narrow on `err.type` in `onGuardError`.
- **`Decision`** — `'allow' | RedirectResult | { redirect: string } | { block: true }`. Prefer `RedirectResult` from `redirect()`.

Not typed (by design, in 0.2):

- **Per-route param keys** — `params` is `Record<string, string>`, not per-route unions.
- **`MatchResult.search` schema** — `Record<string, string>`, not a per-route query schema.

When generating TypeScript, prefer `createRouter<AppState, typeof map>({...})` over `createRouter({...})` — the explicit generics make the type of `state` in `resolveMap` and the route-name narrowing in `router.url()` predictable.

---

## Checklist before returning generated code

- [ ] No `async` / `await` inside `resolveMap` or `notFound`.
- [ ] `navigate` / `replace` arguments are RRUs (`/x`, no `#`), not Browser URLs.
- [ ] Data loading is in `afterEnter` with `router.isCurrent(id)` check.
- [ ] Framework integration uses `router.subscribe` — **not** the four-event stitch.
- [ ] Route names from external data validated once via `hasRoute`, not `try/catch` per render.
- [ ] No `getHistory` / `dryMatch` / `getActiveMap` / `resolveMapFor` / `getRedirectPath`.
- [ ] Guard wiring: either `createGuardedRouter` (one call) or the exact 5-step order (`wrapAdapter` → `createRouter` → `bind` → `navigate()` → `attachLinks`).
- [ ] Guard decisions use `redirect('/x')`, not `{ redirect: '/x' }` (legacy).
- [ ] When reading `snapshot.leaf?.name` in strict TS, narrow with `isFile(leaf)` first.

---

## See also

- `README.md` — tutorial, core concepts, recipes, comparison with other routers.
- `dist/types.d.ts` — the authoritative public API surface.
- `etc/router.api.md` — canonical API report (diff-friendly, GitHub only).
````
