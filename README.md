# `@supercat1337/router`

> Synchronous state-relative router for SPA and SSR over a tree of JS objects.

[![npm version](https://badge.fury.io/js/%40supercat1337%2Frouter.svg)](https://www.npmjs.com/package/@supercat1337/router)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A framework-agnostic routing engine where the active route tree is a **pure function of `(state, url)`** — derived, never set imperatively. Navigation is a **synchronous atomic transaction**: no `await` between `navigate()` and the last event. Async is an explicit boundary: data loading lives in `afterEnter`, pre-navigation checks live in an optional guard layer, nothing leaks into the core.

## Table of contents

- [Why this router](#why-this-router)
- [When NOT to use this router](#when-not-to-use-this-router)
- [Installation](#installation)
- [Quick start — JavaScript](#quick-start--javascript)
- [Quick start — TypeScript](#quick-start--typescript)
- [Core concepts](#core-concepts)
    - [Routes are data](#routes-are-data)
    - [Maps are independent](#maps-are-independent)
    - [Transactions are synchronous](#transactions-are-synchronous)
    - [Snapshot is pull, events are push](#snapshot-is-pull-events-are-push)
    - [Snapshot is frozen](#snapshot-is-frozen)
    - [Typed route names](#typed-route-names)
    - [Reading query parameters](#reading-query-parameters)
    - [`navigationId` — transaction id, not history position](#navigationid--transaction-id-not-history-position)
- [Recipes](#recipes)
    - [Protected route](#protected-route)
    - [Nested layout](#nested-layout)
    - [Data loading with loading / error UI](#data-loading-with-loading--error-ui)
    - [Validating route names from data](#validating-route-names-from-data)
    - [React integration](#react-integration)
    - [Vue integration](#vue-integration)
    - [Custom 404 render](#custom-404-render)
- [Subpath modules](#subpath-modules)
    - [`@supercat1337/router/adapters`](#supercat1337routeradapters)
    - [`@supercat1337/router/links`](#supercat1337routerlinks)
    - [`@supercat1337/router/guard`](#supercat1337routerguard)
- [SSR](#ssr)
- [Public API cheat-sheet](#public-api-cheat-sheet)
- [Examples](#examples)
- [Comparison with specific routers](#comparison-with-specific-routers)
- [Related packages](#related-packages)
- [Contributing](#contributing)
- [License](#license)
- [For AI assistants](#for-ai-assistants)

---

## Why this router

Most SPA routers keep **one route tree** and use guards to simulate different contexts — auth, tenancy, feature flags. This router inverts the model:

- the active map is a **pure function of `(state, url)`** — derived, never set imperatively;
- multiple **independent maps** coexist, one per context;
- navigation is a **synchronous, atomic transaction** — from `navigate()` to the last event, no `await`;
- async is an explicit boundary: data loading lives in `afterEnter`, pre-navigation checks live in an optional guard layer, nothing leaks into the core.

| Concern            | `@supercat1337/router`                       | Typical SPA router                       |
| ------------------ | -------------------------------------------- | ---------------------------------------- |
| Active route tree  | Derived from `(state, url)` via `resolveMap` | Set imperatively; one tree, guarded      |
| Navigation         | Synchronous transaction, atomic commit       | Often async (loaders, suspense)          |
| URL semantics      | State-relative — meaning from `(state, map)` | Globally unique                          |
| Multiple contexts  | Independent maps                             | Guards over one tree                     |
| Data loading       | `afterEnter` (optimistic)                    | Loaders / suspense in core               |
| Cancellation       | `navigationId` + `isCurrent`                 | AbortController / composite keys         |
| 404 policy         | One required handler per map                 | Defaults, `<NotFound />`, `errorElement` |
| Framework coupling | None (core is framework-agnostic)            | Often framework-bound                    |
| Type support       | Strict, zero transpilation (JSDoc + `.d.ts`) | TS sources + build step                  |

Concretely: **TanStack Router** is stronger on typed params and built-in loaders (React-only). **React Router v7** is stronger on ecosystem and framework ergonomics (React-only). **Vue Router** is stronger on simplicity and reactivity (Vue-only). This router trades those for **framework-agnostic core + synchronous transactions + state-relative maps** — a combination none of them offers.

---

## When NOT to use this router

Be honest with yourself before choosing this router:

- **You need built-in code-splitting / lazy routes** → TanStack Router or React Router v7.
- **You need a built-in loader with cross-navigation cache and invalidation** → TanStack Router ships this in the core. Here you write it in `afterEnter` (or wait for the optional loader package).
- **You want framework-bound ergonomics** (`useParams`, `<Link to>`, `useLoaderData`) out of the box → use the framework's router. Here you write ~30–50 lines of glue per framework.
- **You need a large ecosystem of third-party integrations** → React Router / Vue Router.
- **You need scroll restoration, focus management, transitions out of the box** → these are deliberately app responsibility.
- **You're not prepared to write framework glue** → wait for the planned adapter packages, or use a framework router.

If none of the above applies, keep reading.

---

## Installation

```bash
npm install @supercat1337/router
```

No runtime dependencies except `@supercat1337/event-emitter`, which is installed automatically.

### TypeScript

The package ships with a complete `.d.ts` surface (`dist/types.d.ts` for the main entry, one per subpath). No transpilation, no build step on your side — types are generated from JSDoc and verified by `api-extractor` against a committed API report.

- **In JS projects:** add `// @ts-check` or set `checkJs: true` in `jsconfig.json` — you get strict IDE feedback and autocomplete on every call.
- **In TS projects:** import types from `@supercat1337/router` (main entry). Subpaths (`./adapters`, `./links`, `./guard`) re-export values; types stay in the main entry to keep one canonical source.

What's typed:

- All exported functions and classes (signatures, return types, thrown errors).
- All public types: `Router`, `Snapshot`, `RouterMap`, `MatchResult`, `EventPayloads`, `UrlAdapter`, `NavigationErrorType`, `MapValidationErrorCode`, guard types, etc.
- **Route names** — `RouteNames<T>` is inferred from the `createMap` data literal, so `map.url("profile")` completes and `map.url("profiel")` is a compile error (see [Typed route names](#typed-route-names)).
- **Application state** — `createRouter<S, R>` preserves `S` through `getState()` and `resolveMap({ state })`, so `state` is never `any` in the hot path.
- Event payloads per event key: `router.on("afterEnter", p => …)` — `p` is `EventPayloads["afterEnter"]`.
- `map.url(name, params)` and `map.match(url)` return the discriminated unions from the spec.

What's _not_ typed (by design, in the current contract):

- **Per-route param keys** — `params` is `Record<string, string>`, not per-route unions. `url("adminUser", { id: "5" })` accepts any string keys.
- **`MatchResult.search`** is `Record<string, string>`, not a per-route union.

Full signatures are in `dist/types.d.ts` (shipped in the npm package). A diff-friendly public-API report is kept at `etc/*.api.md` **in the GitHub repository** (not included in the npm package).

---

## Quick start — JavaScript

```js
import { createMap, file, folder, createRouter } from '@supercat1337/router';
import { createPathAdapter } from '@supercat1337/router/adapters';
import { attachLinks } from '@supercat1337/router/links';

// 1. Two independent maps. Same `/login` path, different context.
const guestMap = createMap(
    { login: file({ name: 'login' }) },
    { notFound: () => ({ view: '404' }) }
);

const userMap = createMap(
    {
        login: file({ name: 'login' }),
        profile: file({ name: 'profile' }),
    },
    { notFound: () => ({ view: '404' }) }
);

// 2. State is plain data. The resolver is a pure function.
const appState = { isAuthed: false };
const getState = () => appState;
const resolveMap = ({ state }) => (state.isAuthed ? userMap : guestMap);

// 3. Adapter + router. `base` is the app's mount point.
const adapter = createPathAdapter({ base: '/app/' });
const router = createRouter({ resolveMap, getState, adapter });

// 4. One delegated click listener; opt-in.
const detach = attachLinks(router);

// 5. Pull: read what the router committed.
console.log(router.getSnapshot().url); // "/" (initial transaction)

// 6. Push: react to every commit. `subscribe` is the single hook —
//    it fires for navigate, replace, revalidate, and prod error snapshots.
const unsubscribe = router.subscribe(snapshot => {
    render(snapshot);
});

// 7. Navigate: synchronous transaction, atomic commit.
router.navigate('/profile');
//   → guestMap: notFound (no /profile in guest context)

// 8. Switch context, then revalidate.
appState.isAuthed = true;
router.revalidate();
//   → userMap: notFound again (current URL is still "/profile")
//   → subscribe fires even though the URL did not change
router.navigate('/profile');
//   → userMap: matched
```

What just happened:

- `/profile` existed only in `userMap`; in the guest context, the URL is `notFound`. Same path, different meaning — this is the state-relative contract.
- `revalidate()` recomputes the active map without moving the browser URL. New `navigationId`, same URL. `subscribe` fires because a new snapshot was committed — this is why a "stitch together `afterEnter` / `mapChanged` / …" pattern is insufficient and why `subscribe` exists.
- Nothing awaited. `navigate()` and `revalidate()` returned a `Snapshot` synchronously; events fired after commit.

---

## Quick start — TypeScript

```ts
import { createMap, file, folder, createRouter, hasRoute } from '@supercat1337/router';
import type { Router, Snapshot } from '@supercat1337/router';
import { createPathAdapter } from '@supercat1337/router/adapters';
import { attachLinks } from '@supercat1337/router/links';

interface AppState {
    isAuthed: boolean;
}

const guestMap = createMap(
    { login: file({ name: 'login' }) },
    { notFound: (): unknown => ({ view: '404' }) }
);

const userMap = createMap(
    {
        login: file({ name: 'login' }),
        profile: file({ name: 'profile' }),
    },
    { notFound: (): unknown => ({ view: '404' }) }
);

// Route names are inferred from the data literal.
// guestMap.url("login")   → OK
// guestMap.url("profiel") → compile error
guestMap.url('login');

// Generic state: `state` inside resolveMap is `AppState`, not `any`.
const appState: AppState = { isAuthed: false };
const router: Router<AppState> = createRouter<AppState>({
    resolveMap: ({ state }) => (state.isAuthed ? userMap : guestMap),
    getState: () => appState,
    adapter: createPathAdapter({ base: '/app/' }),
});
attachLinks(router);

// `subscribe` is the single "committed" hook; typed per key.
router.subscribe((snap: Snapshot) => {
    console.log(snap.url, snap.status, snap.leaf?.name);
});

// Discriminated on `status`.
const snap = router.navigate('/profile');
if (snap.status === 'error' && snap.error) {
    console.error(snap.error.type, snap.error.attemptedUrl);
}

// Validating route names from external data — fail fast at load time.
const nameFromConfig = 'profile';
if (!hasRoute(userMap, nameFromConfig)) {
    throw new Error(`unknown route: ${nameFromConfig}`);
}
```

---

## Core concepts

### Routes are data

`file` and `folder` construct branded, frozen nodes. Keys are URL-segment patterns: literal (`[A-Za-z0-9._~-]+`), `:name`, `*` (leaf-only wildcard), or the reserved `index` (the folder's own URL).

```js
import { createMap, file, folder } from '@supercat1337/router';

const map = createMap(
    {
        admin: folder(
            { notFound: () => ({ view: 'adminNotFound' }) },
            {
                index: file({ name: 'adminHome' }), // /admin
                users: folder(
                    {}, // no local notFound — inherits from admin
                    {
                        index: file({ name: 'adminUsers' }), // /admin/users
                        ':id': file({ name: 'adminUser' }), // /admin/users/:id
                    }
                ),
            }
        ),
    },
    { notFound: () => ({ view: '404' }) }
);
```

`folder(options, children)` — `options.notFound` is optional. When omitted (empty `{}`), the nearest ancestor with a `notFound` handles the miss, up to `map.notFound`. The example has three levels of fallback: `map.notFound` (root), `admin.notFound` (local override), and `users` inheriting from `admin`.

### Maps are independent

`resolveMap` returns _one_ map per transaction. The core never crosses map boundaries. Multiple maps coexist — one per auth state, tenant, feature flag, or A/B cohort — and a context switch is just a different return value.

```js
const resolveMap = ({ state }) =>
    !state.isAuthed ? guestMap : state.user.isAdmin ? adminMap : userMap;
```

### Transactions are synchronous

`navigate`, `replace`, `popstate`, `revalidate`, and `initial` run the same LOOP: `getState → resolveMap → match → notFound → redirects → history.write → snapshot.commit → events`. No `await`, no promises. Contract violations (resolver returned a Promise, `notFound` returned a Promise) are diagnosed as `navigationError` (prod) or thrown (dev).

### Snapshot is pull, events are push

```js
router.getSnapshot();               // { url, status, chain, leaf, params, search, ... }
router.subscribe(snap => { ... });  // fires on EVERY commit — the only hook most apps need
router.on("beforeLeave", ({ suffix, snapshot }) => { ... });
router.on("afterEnter",   ({ suffix, snapshot }) => { ... });
router.on("mapChanged",   ({ oldMap, newMap, snapshot }) => { ... });
router.on("navigationError", ({ type, error, snapshot }) => { ... });
router.on("commit",       ({ snapshot }) => { ... }); // == subscribe, as an event
```

Listeners are notified; the return value is ignored. `throw` inside a listener is caught (`onListenerError` hook, `console.error` fallback) and does **not** break the chain.

**Why `subscribe` exists.** The "stitch together `afterEnter` / `afterLeave` / `mapChanged` / `navigationError`" pattern is subtly wrong: `revalidate()` with an unchanged URL commits a new snapshot but emits **no** `beforeEnter` / `afterEnter` (empty suffix), and prod error snapshots emit only `navigationError`. A framework adapter that listens to the four enter/leave/map events will miss both. `subscribe` fires **exactly once per commit** — it is the only correct hook for `useSyncExternalStore` / Vue `shallowRef`.

### Snapshot is frozen

Every `Snapshot` is deeply frozen at runtime — `chain`, `params`, `partialParams`, and the `error` sub-object. Mutating them throws in strict mode. This makes "committed" a real contract: once `router.getSnapshot()` returns a snapshot, its shape cannot change.

Two fields are app-owned and **not** frozen:

- `notFoundResult` — whatever your `notFound` handler returned;
- `error.error` — the original exception from `resolver-throw` / `notFound-throw`.

`snapshot.leaf` is a convenience — it's `chain[chain.length - 1]` or `undefined` for an empty chain (`notFound` / `error` at the root). Use it instead of repeating the index expression.

### Typed route names

`createMap` accepts a `const` type parameter, so the data literal is preserved. The result is a `RouterMap<RouteName>` where `RouteName` is the union of every `file({ name })` in the tree:

```ts
const map = createMap(
    {
        login: file({ name: 'login' }),
        users: folder({}, { ':id': file({ name: 'user' }) }),
    },
    { notFound }
);

type Names = Parameters<typeof map.url>[0];
// → 'login' | 'user'

map.url('login'); // ✓
map.url('user', { id: '5' }); // ✓
map.url('profiel'); // ✗ compile error
```

Through `createRouter`, the name type follows the map:

```ts
const router = createRouter<AppState, typeof map>({
    resolveMap: () => map,
    getState: () => appState,
    adapter,
});

router.url('login'); // ✓
router.url('profiel'); // ✗ compile error
```

**Caveats:**

- **TS 5.0+ required** for `const` type parameters. On older compilers, names widen to `string` and no completion is offered (the API still works).
- **JS + JSDoc** infers the union only if the data literal is written inline in `createMap(...)`. If you split it into a `const data = {...}` first, the literal type is preserved through `createMap<const T>` but JSDoc may widen in some setups — annotate with `/** @type {const} */` if needed.
- **Params are not typed per-route.** `params` is `Record<string, string>`. Typed param keys are on the roadmap, not in 0.2.

### Reading query parameters

`map.match(url)` returns `search: Record<string, string>` on **both** branches (`matched` and `notFound`). Decoded values, last-wins for duplicates:

```js
const r = map.match('/users/5?tab=profile&sort=desc');
if (r.status === 'matched') {
    r.params; // { id: '5' }
    r.search; // { tab: 'profile', sort: 'desc' }
}
```

Use `URLSearchParams` directly for multi-value queries (`?tag=a&tag=b`) — `search` collapses duplicates to the last value, matching `Object.fromEntries(new URLSearchParams(...))`.

### `navigationId` — transaction id, not history position

Monotonic within the document. Increments on every transaction — including `revalidate()` even when nothing changed. The only supported pattern is **correlating async work with the transaction** that started it.

```js
router.on('afterEnter', ({ snapshot }) => {
    const id = snapshot.navigationId;
    loadData(snapshot).then(data => {
        if (!router.isCurrent(id)) return; // stale — a newer transaction committed
        render(snapshot, data);
    });
});
```

Not usable as: a history position, a back/forward indicator, or a "remount key" (compare `url` / `params` for that).

---

## Recipes

### Protected route

Use the optional guard layer. It runs guards over a **proposal** before the router commits; the core stays synchronous.

```js
import { createGuardedRouter } from '@supercat1337/router/guard';
import { createPathAdapter } from '@supercat1337/router/adapters';

const { router, nav, guard } = createGuardedRouter({
    adapter: createPathAdapter({ base: '/app/' }),
    resolveMap,
    getState,
    guards: [
        async ({ url, from }) => {
            if (!url.startsWith('/admin')) return 'allow';
            const result = from.map.match(url);
            return result.status === 'matched' ? 'allow' : { redirect: '/login' };
        },
    ],
});

attachLinks(router, {
    navigate: nav.navigate,
    replace: nav.replace,
});
```

`createGuardedRouter` replaces the mandatory 5-step wiring (`createGuardLayer` → `wrapAdapter` → `createRouter` → `bind` → `navigate()`). For custom wiring, use `createGuardLayer` directly — see `AGENTS.md`.

`nav.navigate` / `nav.replace` return `Promise<NavResult>`:

```ts
type NavResult = { status: 'committed'; snapshot: Snapshot } | { status: 'blocked' };
```

`guard.pending()` returns `{ url, since, signal } | null` for loading UI — `signal` aborts when a newer navigation starts or a redirect-iteration begins.

Guard decisions:

```ts
type Decision =
    | 'allow'
    | RedirectResult // from redirect('/x') — preferred
    | { redirect: string } // legacy shape, still accepted
    | { block: true };
```

Return `redirect('/x')` (branded) for redirects — one function, works in both `notFound` handlers and guards, `isRedirect()` narrows everywhere.

Guard diagnostics are a discriminated union on `type`:

```ts
type GuardErrorPayload =
    | { type: 'guard-throw'; error: unknown }
    | { type: 'guard-redirect-loop'; path: string[] }
    | { type: 'invalid-rru'; target: string }
    | { type: 'reentrancy' };
```

They are distinct from the core's `NavigationErrorType`: the core does not know about guards.

### Nested layout

`layout` is app-owned metadata on `file()`. Pass it through, render it yourself by walking `snapshot.chain`:

```js
const map = createMap(
    {
        dashboard: folder(
            {},
            {
                index: file({ name: 'dashboardHome', layout: 'dashboard' }),
                settings: file({ name: 'dashboardSettings', layout: 'dashboard' }),
            }
        ),
        login: file({ name: 'login' }), // no layout → default
    },
    { notFound: () => ({ view: '404' }) }
);

const layouts = {
    main: renderMainLayout,
    dashboard: renderDashboardLayout,
};

function render(snapshot) {
    if (snapshot.status === 'notFound') {
        return render404(snapshot.notFoundResult);
    }
    const layoutName = snapshot.leaf?.layout ?? 'main';
    const layout = layouts[layoutName] ?? layouts.main;
    return layout(snapshot);
}
```

`snapshot.leaf` is the current route's file node. It can be `undefined` for `notFound` / `error` with an empty chain — in which case `?? 'main'` gives you the default.

### Data loading with loading / error UI

Optimistic: commit the RRU synchronously, render a skeleton, load data, render content. A loading failure is page state — it does **not** roll back the URL.

```js
let viewState = { loading: false, error: null, data: null };

router.on('afterEnter', async ({ snapshot }) => {
    const id = snapshot.navigationId;
    viewState = { loading: true, error: null, data: null };
    render(viewState);

    try {
        const data = await loadData(snapshot);
        if (!router.isCurrent(id)) return; // superseded
        viewState = { loading: false, error: null, data };
        render(viewState);
    } catch (error) {
        if (!router.isCurrent(id)) return;
        viewState = { loading: false, error, data: null };
        render(viewState);
    }
});
```

"Route resolves" (blocking commit until data is loaded) is a **non-goal**: it contradicts the synchronous commit and `popstate` (the browser URL is already changed — rollback is impossible). For pre-navigation checks, use the guard layer.

### Validating route names from data

Route names sometimes come from outside your code — config files, feature flags, plugin manifests, CMS data. If you call `map.url(name)` with a bad name, it throws `TypeError` — intentionally, because a bad name is a **configuration bug**, not a navigation outcome.

The right pattern is to validate once, at data-load time, and then call `url()` freely:

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

`hasRoute(map, name)` returns `true` iff `map.url(name, ...)` would not throw for the reason "route not found". Specifically:

- **`true`** — a non-wildcard leaf with `name === name` exists.
- **`false`** — no such leaf, or the route is a wildcard `*` (no canonical URL), or `map` / `name` are invalid inputs.
- **Does not check params.** `hasRoute(map, 'user')` returns `true`, but `url('user')` still throws for missing `id`. That's intentional: parameter presence is a data-validation question, not a route-existence one.

**Don't** wrap `url()` in `try/catch` at every call site:

```js
// ❌ Hides configuration bugs; the error should be caught once, at load time.
try {
    const href = map.url(nameFromConfig);
} catch {
    // silently fall back — now nobody knows the config is wrong
}
```

### React integration

`@supercat1337/router` is framework-agnostic. The glue is small but you write it once. `router.subscribe` is exactly what `useSyncExternalStore` requires — one subscription, fires on every commit, and `getSnapshot()` returns a stable reference when nothing changed:

```jsx
import { useSyncExternalStore, useCallback } from 'react';

function useRouterSnapshot(router) {
    const subscribe = useCallback(onChange => router.subscribe(onChange), [router]);
    return useSyncExternalStore(subscribe, () => router.getSnapshot());
}

function App({ router }) {
    const snapshot = useRouterSnapshot(router);

    if (snapshot.status === 'notFound') {
        return <NotFound result={snapshot.notFoundResult} />;
    }
    if (snapshot.status === 'error') {
        return <ErrorView error={snapshot.error} />;
    }
    return renderByLeaf(snapshot.leaf, snapshot.params);
}
```

Do **not** stitch together `afterEnter` / `afterLeave` / `mapChanged` / `navigationError` manually. That pattern misses `revalidate()` without a URL change and misses prod error snapshots — both real bug sources. `subscribe` exists exactly so you don't have to think about this.

### Vue integration

```js
import { shallowRef, onMounted, onUnmounted } from 'vue';

export function useRouterSnapshot(router) {
    const snapshot = shallowRef(router.getSnapshot());
    let unsub = () => {};

    onMounted(() => {
        unsub = router.subscribe(s => {
            snapshot.value = s;
        });
    });
    onUnmounted(() => unsub());

    return snapshot;
}
```

### Custom 404 render

`notFoundResult` is whatever your `notFound` handler returned. Render it however you like:

```js
const map = createMap(routes, {
    notFound: ({ url, chain }) => ({
        view: '404',
        attemptedUrl: url,
        partialChain: chain,
    }),
});

router.on('afterEnter', ({ snapshot }) => {
    if (snapshot.status === 'notFound') {
        renderView(snapshot.notFoundResult);
    }
});
```

---

## Subpath modules

The core is intentionally small. Everything optional is a separate subpath, so tree-shaking keeps unused modules out.

### `@supercat1337/router/adapters`

The only layer that converts between Browser URLs (BU) and Router-relative URLs (RRU).

- **`createPathAdapter({ base })`** — history API, `base` as a pathname prefix. Required for path mode: either pass `base` explicitly or provide a `<base href>` with a trailing slash. Auto-deriving from `location.pathname` is refused (`TypeError`) — it gives the wrong base on deep links.
- **`createHashAdapter({ base? })`** — hash mode (`#/users/5`). Default `base = location.pathname`. In SSR, an explicit `base` is required (`TypeError` otherwise).

```js
import { createPathAdapter } from '@supercat1337/router/adapters';
const adapter = createPathAdapter({ base: '/app/' });
```

### `@supercat1337/router/links`

`attachLinks(router, options?)` — one delegated click listener on `document` for `[data-router-link]` elements. Opt-in, no side effects on import, no-op outside the browser.

```html
<a href="/profile" data-router-link>Profile</a>
<!-- router.navigate -->
<a href="/profile" data-router-link="replace">Profile</a>
<!-- router.replace -->
```

All URL checks (`cross-origin`, `mailto:`, same-document hash, `#section` in hash mode, etc.) live in `router.adapter.normalize(href)`; `attachLinks` only decides whether the browser should handle the click itself (modifier keys, `target`, `download`, missing `href`).

### `@supercat1337/router/guard`

Optional async guard layer. Runs guards over a **proposal** before the router commits. The core remains synchronous; guards work outside the transaction. The only integration point into the core is `adapter.listen` (for `popstate`, where the browser URL has already changed and guards must run before `cb(e)`).

Two ways to wire:

**One call (recommended):** `createGuardedRouter({ adapter, resolveMap, getState, guards, ... })` — see [Protected route](#protected-route).

**Manual (for custom wiring):**

```js
const guard = createGuardLayer({ guards, dev });
const adapter = guard.wrapAdapter(createPathAdapter({ base: '/app/' }));
const router = createRouter({ resolveMap, getState, adapter });
guard.bind(router);
const nav = guard.navigate();
attachLinks(router, { navigate: nav.navigate, replace: nav.replace });
```

Wiring order is mandatory for the manual form — `wrapAdapter` → `createRouter` → `bind` → `navigate()` → `attachLinks`.

Multi-step guards with cancellation can use `@supercat1337/chain` (see [Related packages](#related-packages)).

---

## SSR

The core is synchronous; SSR is a natural fit.

- `createPathAdapter({ base })` — explicit `base` is required in SSR (`TypeError` otherwise). `read()` returns `'/'`, `write` / `listen` are no-ops.
- `createHashAdapter` — in SSR without `location`, an explicit `base` is required. `read()` **throws** (no hash without a browser).
- `attachLinks` — no-op outside the browser.
- Guard layer — do **not** connect on the server. Access control is on the server; the guard layer is a client-side UX filter, not a security boundary.
- `subscribe` — works on the server, but the initial commit happens inside `createRouter`, before any listener can subscribe. Call `router.getSnapshot()` after construction to read the initial state.

`getState` and `resolveMap` are still pure functions; the initial transaction runs exactly as in the browser, minus the actual history write.

---

## Public API cheat-sheet

**Core** — `@supercat1337/router`:

```
createMap, file, folder, isMap, isFile, isFolder,
createRouter, isRouter, redirect, isRedirect, MapValidationError, normalizeRRU,
 hasRoute
```

**Adapters** — `@supercat1337/router/adapters`:

```
createPathAdapter, createHashAdapter
```

**Links** — `@supercat1337/router/links`:

```
attachLinks
```

**Guard layer** — `@supercat1337/router/guard`:

```
createGuardLayer, createGuardedRouter
```

**Types** — from the main entry only:

```
Router, RouterMap, Snapshot, MatchResult, EventPayloads,
UrlAdapter, NavigationErrorType, MapValidationErrorCode,
RouteNames, RouteNameOf,
GuardErrorType, GuardErrorPayload, Decision, GuardContext, Guard, NavResult,
GuardLayer, CreateRouterOptions, CreateGuardLayerOptions,
CreateGuardedRouterOptions, GuardedRouter,
ResolveMapContext, OnListenerError, OnGuardError, AttachLinksOptions,
FileMeta, FolderOptions, FileNode, FolderNode, Node, Children,
NotFoundContext, NotFoundResult, NotFoundHandler, RedirectResult
```

**Router methods**:

```
navigate, replace, revalidate, back, forward,
url, getSnapshot, getState, isCurrent,
subscribe, on, off, once
```

Full signatures: `dist/types.d.ts` (shipped in the npm package).

The test suite (`tests/`) and the API report (`etc/*.api.md`) live **in the GitHub repository, not in the npm package**. On GitHub they are the canonical reference for edge cases and the diff-friendly public surface.

---

## Examples

- **`examples/vanilla-spa/`** — ~85-line SPA with two maps, a pure
  `resolveMap`, `attachLinks`, `subscribe`, and `revalidate`. No
  framework, no bundler. Run from the repo root:
    ```bash
    npx serve .
    # open http://localhost:3000/examples/vanilla-spa/
    ```

The **Quick Start** above is the canonical reference. It exercises the
same stack in a single file, without a directory structure.

For exhaustive behavior coverage (edge cases, error paths, redirect
loops, guard interactions), see `tests/` **in the GitHub repository** —
every documented behavior has a test that fails without the behavior.
Start with `tests/transaction.test.js`, `tests/guard.test.js`, and
`tests/subscribe.test.js`. (`tests/` is not included in the npm package.)

---

## Comparison with specific routers

| Feature                          | `@supercat1337/router`     | TanStack Router (React) | React Router v7 (React) | Vue Router (Vue) |
| -------------------------------- | -------------------------- | ----------------------- | ----------------------- | ---------------- |
| Framework-agnostic               | ✅                         | ❌                      | ❌                      | ❌               |
| Synchronous navigation           | ✅                         | ❌                      | ❌                      | ❌               |
| State-relative maps              | ✅                         | ❌                      | ❌                      | ❌               |
| Typed route names                | ✅ `RouteNames<T>`         | ✅ full inference       | ⚠️ partial              | ⚠️ partial       |
| Typed params                     | ⚠️ `Record<string,string>` | ✅ full inference       | ⚠️ partial              | ⚠️ partial       |
| Built-in loaders / cache         | ❌ (write in `afterEnter`) | ✅                      | ✅ (v7)                 | ⚠️ guards        |
| Built-in code splitting          | ❌                         | ✅                      | ✅                      | ✅               |
| Cancellation in guards           | ✅ `AbortSignal`           | ⚠️ via redirect only    | ❌                      | ❌               |
| Framework subscription hook      | ✅ `router.subscribe`      | ✅                      | ✅                      | ✅               |
| Scroll restoration / transitions | ❌ (app responsibility)    | ⚠️ partial              | ✅                      | ✅               |
| Ecosystem / third-party          | ⚠️ small                   | ✅ large                | ✅ very large           | ✅ very large    |

**Choose `@supercat1337/router`** if you need framework-agnostic routing with a synchronous core and state-relative maps, and are prepared to write ~15–30 lines of glue per framework (`router.subscribe` + `getSnapshot` is a one-liner).

**Choose TanStack Router** if you're on React and want typed params + loaders + guards with the least code.

**Choose React Router v7 / Vue Router** if you're on React / Vue, want a large ecosystem, and don't mind async navigation.

---

## Related packages

| Package                       | Role                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| `@supercat1337/event-emitter` | Event bus used internally for `router.on / off / once / subscribe`                                      |
| `@supercat1337/chain`         | Recommended inside guards that run several sequential async steps with cancellation                     |
| `@supercat1337/fetcher`       | `AbortSignal`-aware HTTP client with retry and singleton requests — fits the `afterEnter` pattern well  |
| `@supercat1337/persist-core`  | Framework-agnostic persistence (TTL, versioning, cross-tab sync) — useful for caching loaded route data |

`@supercat1337/chain` is **not** a dependency of this package — install it only if your guards need it:

```bash
npm install @supercat1337/chain
```

---

## Contributing

Internal guide for contributors and AI assistants: see `AGENTS.md` **in the GitHub repository** (not included in the npm package). It documents invariants, common pitfalls, build pipeline, and test conventions.

```bash
git clone https://github.com/supercat1337/router
cd router
npm install
npm test               # typecheck + c8 + ava
npm run build          # rollup + tsc + api-extractor
```

Every new behavior needs a test that fails without the change. Every public signature change requires an update to `etc/*.api.md` in the same PR.

---

## License

MIT © Albert Bazaleev

---

## For AI assistants

If you are generating code against this package:

- The core is **framework-agnostic**. Do **not** introduce React / Vue / Svelte imports into `@supercat1337/router` source or suggest a framework-specific adapter inside the core. Framework glue is user-side (see [Recipes](#recipes)).
- The core is **synchronous**. `resolveMap` and `notFound` must not return Promises — that is a contract violation diagnosed as `resolver-promise` / `notFound-promise`. Async belongs in `afterEnter` (data loading) or the optional guard layer.
- Multiple independent maps are the intended pattern. Do **not** suggest cross-map features, cross-map redirects, or a "global route registry" — those do not exist by design.
- Public surface is `dist/types.d.ts` (shipped in the npm package). A diff-friendly API report is at `etc/*.api.md` on GitHub. Methods like `getHistory`, `dryMatch`, `getActiveMap`, `resolveMapFor`, `getRedirectPath` are **dev-only**, `@internal`, and stripped from the public `.d.ts`. Do not use them in library code.
- `Snapshot.url` is a **Router-relative URL** (RRU), not `location.pathname + search`. Browser URLs (BU) live only inside the adapter.
- `navigationId` is a **transaction identifier**, not a history position and not a key for remounting components. Use it only for `router.isCurrent(id)` correlation of async work.
- **Framework integration** uses `router.subscribe` — one subscription, fires on every commit. Do **not** stitch together `afterEnter` / `afterLeave` / `mapChanged` / `navigationError`: that pattern misses `revalidate()` without a URL change and misses prod error snapshots.
- **Route names from external data** are validated with `hasRoute(map, name)` **once at data-load time**, not with `try/catch` around every `url()` call. `hasRoute` does **not** validate params — `url(name)` may still throw for missing `:name` values.
- **Redirects in guards** use `redirect('/x')` (branded) — `isRedirect()` narrows everywhere. The legacy `{ redirect: '/x' }` shape is accepted for backward compatibility but should not be introduced in new code.
