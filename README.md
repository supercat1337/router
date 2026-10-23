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
    - [`navigationId` — transaction id, not history position](#navigationid--transaction-id-not-history-position)
- [Recipes](#recipes)
    - [Protected route](#protected-route)
    - [Nested layout](#nested-layout)
    - [Data loading with loading / error UI](#data-loading-with-loading--error-ui)
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

Concretely: **TanStack Router** is stronger on typed routes and built-in loaders (React-only). **React Router v7** is stronger on ecosystem and framework ergonomics (React-only). **Vue Router** is stronger on simplicity and reactivity (Vue-only). This router trades those for **framework-agnostic core + synchronous transactions + state-relative maps** — a combination none of them offers.

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
- Event payloads per event key: `router.on("afterEnter", p => …)` — `p` is `EventPayloads["afterEnter"]`.
- `map.url(name, params)` and `map.match(url)` return the discriminated unions from the spec.

What's _not_ typed (by design, in the current contract):

- Route-name inference: `url("profile")` accepts `string`, not `"profile" | "login"`. Generics like `createMap<Routes>` are a possible future feature.
- `params` keys are `Record<string, string>`, not per-route unions.

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

// 6. Push: react to committed events.
router.on('afterEnter', ({ snapshot }) => {
    render(snapshot);
});

// 7. Navigate: synchronous transaction, atomic commit.
router.navigate('/profile');
//   → guestMap: notFound (no /profile in guest context)

// 8. Switch context, then revalidate.
appState.isAuthed = true;
router.revalidate();
//   → userMap: notFound again (current URL is still "/profile")
router.navigate('/profile');
//   → userMap: matched
```

What just happened:

- `/profile` existed only in `userMap`; in the guest context, the URL is `notFound`. Same path, different meaning — this is the state-relative contract.
- `revalidate()` recomputes the active map without moving the browser URL. New `navigationId`, same URL.
- Nothing awaited. `navigate()` and `revalidate()` returned a `Snapshot` synchronously; events fired after commit.

---

## Quick start — TypeScript

```ts
import { createMap, file, folder, createRouter } from '@supercat1337/router';
import type { Router, RouterMap, Snapshot, EventPayloads } from '@supercat1337/router';
import { createPathAdapter } from '@supercat1337/router/adapters';
import { attachLinks } from '@supercat1337/router/links';

interface AppState {
    isAuthed: boolean;
}

const guestMap: RouterMap = createMap(
    { login: file({ name: 'login' }) },
    { notFound: (): unknown => ({ view: '404' }) }
);

const userMap: RouterMap = createMap(
    {
        login: file({ name: 'login' }),
        profile: file({ name: 'profile' }),
    },
    { notFound: (): unknown => ({ view: '404' }) }
);

const appState: AppState = { isAuthed: false };
const getState = (): AppState => appState;

const resolveMap = ({ state }: { state: AppState; url: string }): RouterMap =>
    state.isAuthed ? userMap : guestMap;

const adapter = createPathAdapter({ base: '/app/' });

const router: Router = createRouter({ resolveMap, getState, adapter });
attachLinks(router);

// Event payloads are typed per key.
router.on('afterEnter', (p: EventPayloads['afterEnter']) => {
    const snap: Snapshot = p.snapshot;
    console.log(snap.url, snap.status);
});

// Return type of navigate() is Snapshot — discriminated on `status`.
const snap = router.navigate('/profile');
if (snap.status === 'error' && snap.error) {
    console.error(snap.error.type, snap.error.attemptedUrl);
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
router.getSnapshot(); // { url, status, chain, params, navigationId, map, ... }
router.on("beforeLeave", ({ suffix, snapshot }) => { ... });
router.on("afterEnter",   ({ suffix, snapshot }) => { ... });
router.on("mapChanged",   ({ oldMap, newMap, snapshot }) => { ... });
router.on("navigationError", ({ type, error, snapshot }) => { ... });
```

Listeners are notified; the return value is ignored. `throw` inside a listener is caught (`onListenerError` hook, `console.error` fallback) and does **not** break the chain.

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
import { createGuardLayer } from '@supercat1337/router/guard';
import { createPathAdapter } from '@supercat1337/router/adapters';

const guard = createGuardLayer({
    guards: [
        async ({ url, from }) => {
            if (!url.startsWith('/admin')) return 'allow';
            const result = from.map.match(url);
            return result.status === 'matched' ? 'allow' : { redirect: '/login' };
        },
    ],
});

const adapter = guard.wrapAdapter(createPathAdapter({ base: '/app/' }));
const router = createRouter({ resolveMap, getState, adapter });

guard.bind(router); // 1. bind first
const nav = guard.navigate(); // 2. then build the navigator

attachLinks(router, {
    // 3. then wire links
    navigate: nav.navigate,
    replace: nav.replace,
});
```

`nav.navigate` / `nav.replace` return `Promise<NavResult>`:

```ts
type NavResult = { status: 'committed'; snapshot: Snapshot } | { status: 'blocked' };
```

`guard.pending()` returns `{ url, since } | null` for loading UI. Guard errors (`guard-throw`, `guard-redirect-loop`, `invalid-rru`, `reentrancy`) go to `onError` with their own `GuardErrorType`, distinct from the core's `NavigationErrorType`.

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
    const leaf = snapshot.chain[snapshot.chain.length - 1];
    const layoutName = leaf?.layout ?? 'main';
    const layout = layouts[layoutName] ?? layouts.main;
    return layout(snapshot);
}
```

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

### React integration

`@supercat1337/router` is framework-agnostic. The glue is small but you write it once:

```jsx
import { useSyncExternalStore, useCallback } from 'react';

const EVENTS = ['afterEnter', 'afterLeave', 'mapChanged', 'navigationError'];

function useRouterSnapshot(router) {
    const subscribe = useCallback(
        onChange => {
            const offs = EVENTS.map(e => router.on(e, onChange));
            return () => offs.forEach(off => off());
        },
        [router]
    );
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
    const leaf = snapshot.chain[snapshot.chain.length - 1];
    return renderByLeaf(leaf, snapshot.params);
}
```

`router.getSnapshot()` returns a stable reference when nothing changed, which is what `useSyncExternalStore` requires.

### Vue integration

```js
import { shallowRef, onMounted, onUnmounted } from 'vue';

const EVENTS = ['afterEnter', 'afterLeave', 'mapChanged', 'navigationError'];

export function useRouterSnapshot(router) {
    const snapshot = shallowRef(router.getSnapshot());
    let offs = [];

    onMounted(() => {
        offs = EVENTS.map(e =>
            router.on(e, () => {
                snapshot.value = router.getSnapshot();
            })
        );
    });
    onUnmounted(() => offs.forEach(off => off()));

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

Wiring order is mandatory — see [Protected route](#protected-route) above for a working example. Multi-step guards with cancellation can use `@supercat1337/chain` (see [Related packages](#related-packages)).

---

## SSR

The core is synchronous; SSR is a natural fit.

- `createPathAdapter({ base })` — explicit `base` is required in SSR (`TypeError` otherwise). `read()` returns `'/'`, `write` / `listen` are no-ops.
- `createHashAdapter` — in SSR without `location`, an explicit `base` is required. `read()` **throws** (no hash without a browser).
- `attachLinks` — no-op outside the browser.
- Guard layer — do **not** connect on the server. Access control is on the server; the guard layer is a client-side UX filter, not a security boundary.

`getState` and `resolveMap` are still pure functions; the initial transaction runs exactly as in the browser, minus the actual history write.

---

## Public API cheat-sheet

**Core** — `@supercat1337/router`:

```
createMap, file, folder, isMap, isFile, isFolder,
createRouter, redirect, isRedirect, MapValidationError, normalizeRRU
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
createGuardLayer
```

**Types** — from the main entry only:

```
Router, RouterMap, Snapshot, MatchResult, EventPayloads,
UrlAdapter, NavigationErrorType, MapValidationErrorCode,
GuardErrorType, Decision, GuardContext, Guard, NavResult,
GuardLayer, CreateRouterOptions, CreateGuardLayerOptions,
ResolveMapContext, OnListenerError, OnGuardError, AttachLinksOptions,
FileMeta, FolderOptions, FileNode, FolderNode, Node, Children,
NotFoundContext, NotFoundResult, NotFoundHandler, RedirectResult
```

Full signatures: `dist/types.d.ts` (shipped in the npm package).

The test suite (`tests/`) and the API report (`etc/*.api.md`) live **in the GitHub repository, not in the npm package**. On GitHub they are the canonical reference for edge cases and the diff-friendly public surface.

---

## Examples

The **Quick Start** above is the canonical reference. It exercises the full stack: two maps, a resolver, an adapter, links, event subscriptions, and both `navigate()` / `revalidate()`.

For exhaustive behavior coverage (edge cases, error paths, redirect loops, guard interactions), see `tests/` **in the GitHub repository** — every documented behavior has a test that fails without the behavior. Start with `tests/router.test.js` and `tests/guard-layer.test.js`. (`tests/` is not included in the npm package.)

A runnable SPA example (guest / user / admin maps, path mode + hash mode, guard layer) is planned for a separate example repository. Until then, `tests/` on GitHub is the living spec.

---

## Comparison with specific routers

| Feature                          | `@supercat1337/router`     | TanStack Router (React) | React Router v7 (React) | Vue Router (Vue) |
| -------------------------------- | -------------------------- | ----------------------- | ----------------------- | ---------------- |
| Framework-agnostic               | ✅                         | ❌                      | ❌                      | ❌               |
| Synchronous navigation           | ✅                         | ❌                      | ❌                      | ❌               |
| State-relative maps              | ✅                         | ❌                      | ❌                      | ❌               |
| Typed routes                     | ⚠️ plain `string`          | ✅ full inference       | ⚠️ partial              | ⚠️ partial       |
| Built-in loaders / cache         | ❌ (write in `afterEnter`) | ✅                      | ✅ (v7)                 | ⚠️ guards        |
| Built-in code splitting          | ❌                         | ✅                      | ✅                      | ✅               |
| Cancellation in guards           | ✅ `AbortSignal`           | ⚠️ via redirect only    | ❌                      | ❌               |
| Scroll restoration / transitions | ❌ (app responsibility)    | ⚠️ partial              | ✅                      | ✅               |
| Ecosystem / third-party          | ⚠️ small                   | ✅ large                | ✅ very large           | ✅ very large    |

**Choose `@supercat1337/router`** if you need framework-agnostic routing with a synchronous core and state-relative maps, and are prepared to write ~30–50 lines of glue per framework.

**Choose TanStack Router** if you're on React and want typed routes + loaders + guards with the least code.

**Choose React Router v7 / Vue Router** if you're on React / Vue, want a large ecosystem, and don't mind async navigation.

---

## Related packages

| Package                       | Role                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| `@supercat1337/event-emitter` | Event bus used internally for `router.on / off / once`                                                  |
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
npm test               # c8 + ava
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
