# @supercat1337/router

> Synchronous state-relative router for SPA and SSR over a tree of JS objects.

[![npm version](https://badge.fury.io/js/%40supercat1337%2Frouter.svg)](https://www.npmjs.com/package/@supercat1337/router)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Why this router

Most SPA routers keep **one route tree** and use guards to simulate different contexts — auth, tenancy, feature flags. This router inverts the model:

- the active map is a **pure function of `(state, url)`** — derived, never set imperatively;
- multiple **independent maps** coexist, one per context;
- navigation is a **synchronous, atomic transaction** — from `navigate()` to the last event, no `await`;
- async is an explicit boundary: data loading lives in `afterEnter`, pre-navigation checks live in an optional guard layer, nothing leaks into the core.

The trade-off is honest: no built-in lazy route splitting, no framework bindings, no async loaders in core. If you want those, use a framework router. If you want a deterministic engine where **switching context is a recomputation**, keep reading.

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

---

## Installation

```bash
npm install @supercat1337/router
```

No runtime dependencies except `@supercat1337/event-emitter`, which is installed automatically.

### TypeScript

The package ships with a complete `.d.ts` surface (`dist/types.d.ts` for the main entry, one per subpath). No transpilation, no build step on your side — types are generated from JSDoc and verified by `api-extractor` against a committed API report (`etc/*.api.md`).

- **In JS projects:** add `// @ts-check` or set `checkJs: true` in `jsconfig.json` — you get strict IDE feedback and autocomplete on every call.
- **In TS projects:** import types from `@supercat1337/router` (main entry). Subpaths (`./adapters`, `./links`, `./guard`) re-export values; types stay in the main entry to keep one canonical source.

What's typed:

- All exported functions and classes (signatures, return types, thrown errors).
- All public types: `Router`, `Snapshot`, `RouterMap`, `MatchResult`, `EventPayloads`, `UrlAdapter`, `NavigationErrorType`, `MapValidationErrorCode`, guard types, etc.
- Event payloads per event key: `router.on("afterEnter", p => …)` — `p` is `EventPayloads["afterEnter"]`.
- `map.url(name, params)` and `map.match(url)` return the discriminated unions from the spec.

What's _not_ typed (yet, by design — see `09-typing.md`):

- Route-name inference: `url("profile")` accepts `string`, not `"profile" | "login"`. Generics like `createMap<Routes>` are a possible future feature, not in the current contract.
- `params` keys are `Record<string, string>`, not per-route unions.

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

## Data loading (async boundary)

The recommended pattern is **optimistic**: commit the RRU synchronously, render a skeleton, load data, render content. A loading failure is page state — it does **not** roll back the URL.

```js
router.on('afterEnter', async ({ snapshot }) => {
    const id = snapshot.navigationId;
    renderSkeleton(snapshot);
    try {
        const data = await loadData(snapshot);
        if (!router.isCurrent(id)) return; // superseded
        renderContent(snapshot, data);
    } catch (e) {
        if (!router.isCurrent(id)) return;
        renderError(snapshot, e);
    }
});
```

"Route resolves" (blocking commit until data is loaded) is a **non-goal**: it contradicts the synchronous commit and `popstate` (the browser URL is already changed — rollback is impossible). For pre-navigation checks, use the optional guard layer.

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

Mandatory wiring order:

```js
import { createGuardLayer } from '@supercat1337/router/guard';

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

#### Multi-step guards with `@supercat1337/chain`

A guard receives `signal` (an `AbortSignal` from the guard layer). It is aborted when a newer navigation starts **or** when the guard itself redirects — so any in-flight `fetch` should be cancelled. With one `fetch`, `fetch(url, { signal })` is enough. With **two or more sequential async steps**, coordinating cancellation by hand becomes boilerplate:

```js
// Without @supercat1337/chain — every `await` needs an abort check and try/catch
const authGuard = async ({ url, signal }) => {
    const session = await (await fetch('/api/session', { signal })).json();
    if (signal.aborted) return { block: true };
    if (!session.ok) return { redirect: '/login?next=' + encodeURIComponent(url) };

    const perms = await (await fetch('/api/permissions?u=' + session.userId, { signal })).json();
    if (signal.aborted) return { block: true };
    if (url.startsWith('/admin') && !perms.includes('admin')) return { block: true };

    await fetch('/api/preload?route=' + url, { signal }); // warm caches
    if (signal.aborted) return { block: true };

    return 'allow';
};
```

`@supercat1337/chain` is a small utility that turns this into a linear, abort-aware workflow. Each step's `fetch` is bound to the same `signal`; early exit is `ctrl.complete(value)`; the rest is skipped. The same guard:

```js
import { Chain, CancelError } from '@supercat1337/chain';

const authGuard = ({ url, signal }) => {
    const chain = new Chain({ url }, { signal });

    chain
        .add(async (_, ctrl) => {
            const session = await (await ctrl.fetch('/api/session')).json();
            if (!session.ok) ctrl.complete({ redirect: '/login?next=' + encodeURIComponent(url) });
            return session;
        })
        .add(async (session, ctrl) => {
            const perms = await (await ctrl.fetch('/api/permissions?u=' + session.userId)).json();
            if (url.startsWith('/admin') && !perms.includes('admin'))
                ctrl.complete({ block: true });
            return perms;
        })
        .add(async (_, ctrl) => {
            await ctrl.fetch('/api/preload?route=' + url);
            return null;
        });

    return chain.run().catch(e => {
        if (e instanceof CancelError) return { block: true }; // silent abort → block
        throw e; // real error → onError → block
    });
};
```

What you get: `signal` plumbing disappears (`ctrl.fetch` / `ctrl.wrap(fn)` / `ctrl.sleep(ms)` all honour it), early exit is explicit (`ctrl.complete`), and a cancelled navigation is a single `CancelError` to convert into `{ block: true }` — no per-step `if (signal.aborted)` checks.

**When not to use it:** a guard that runs a single `fetch`, a synchronous permission check, or a step with heavy branching (`if step2 fails, try step2b`) is better as a plain async function. `Chain.js` earns its keep from ~2–3 sequential steps with cancellation; below that it's extra indirection.

`@supercat1337/chain` is **not** a dependency of this package — install it only if your guards need it:

```bash
npm install @supercat1337/chain
```

---

## SSR

The core is synchronous; SSR is a natural fit.

- `createPathAdapter({ base })` — explicit `base` is required in SSR (`TypeError` otherwise). `read()` returns `'/'`, `write` / `listen` are no-ops.
- `createHashAdapter` — in SSR without `location`, an explicit `base` is required. `read()` **throws** (no hash without a browser).
- `attachLinks` — no-op outside the browser.
- Guard layer — do **not** connect on the server. Access control is on the server; the guard layer is a client-side UX filter, not a security boundary.

`getState` and `resolveMap` are still pure functions; the initial transaction runs exactly as in the browser, minus the actual history write.

---

## Public API (cheat-sheet)

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

See `dist/types.d.ts` for full signatures; see `etc/*.api.md` for a diff-friendly public surface report.

---

## Examples

Live examples (a runnable SPA with guest / user / admin maps, path mode and hash mode, and a guard layer) are in progress and will be linked here. Until then, the **Quick Start** above is the canonical reference; the test suite (`tests/`) covers every documented behavior.

---

## Related packages

| Package                       | Role                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| `@supercat1337/event-emitter` | Event bus used internally for `router.on / off / once`                              |
| `@supercat1337/chain`         | Recommended inside guards that run several sequential async steps with cancellation |

---

## For AI assistants

If you are generating code against this package:

- The core is **framework-agnostic**. Do **not** introduce React / Vue / Svelte imports into `@supercat1337/router` source or suggest a framework-specific adapter inside the core. Adapters are separate packages.
- The core is **synchronous**. `resolveMap` and `notFound` must not return Promises — that is a contract violation diagnosed as `resolver-promise` / `notFound-promise`. Async belongs in `afterEnter` (data loading) or the optional guard layer.
- Multiple independent maps are the intended pattern. Do **not** suggest cross-map features, cross-map redirects, or a "global route registry" — those do not exist by design.
- Public surface is `dist/types.d.ts` and `etc/*.api.md`. Methods like `getHistory`, `dryMatch`, `getActiveMap`, `resolveMapFor`, `getRedirectPath` are **dev-only**, `@internal`, and stripped from the public `.d.ts`. Do not use them in library code.
- `Snapshot.url` is a **Router-relative URL** (RRU), not `location.pathname + search`. Browser URLs (BU) live only inside the adapter.
- `navigationId` is a **transaction identifier**, not a history position and not a key for remounting components. Use it only for `router.isCurrent(id)` correlation of async work.

---

## License

MIT © Albert Bazaleev
