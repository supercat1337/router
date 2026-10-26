# `@supercat1337/router`

> Synchronous state-relative router for SPA and SSR over a tree of JS objects.

[![npm version](https://img.shields.io/npm/v/@supercat1337/router.svg)](https://www.npmjs.com/package/@supercat1337/router)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Framework-agnostic routing engine where the active route tree is a **pure function of `(state, url)`** — derived, never set imperatively. Navigation is a **synchronous atomic transaction**: no `await` between `navigate()` and the last event. Async is an explicit boundary: data loading lives in `afterEnter`, pre-navigation checks live in an optional guard layer, nothing leaks into the core.

## Why this router

| Concern            | `@supercat1337/router`                       | Typical SPA router                  |
| ------------------ | -------------------------------------------- | ----------------------------------- |
| Active route tree  | Derived from `(state, url)` via `resolveMap` | Set imperatively; one tree, guarded |
| Navigation         | Synchronous transaction, atomic commit       | Often async (loaders, suspense)     |
| Multiple contexts  | Independent maps                             | Guards over one tree                |
| Data loading       | `afterEnter` (optimistic)                    | Loaders / suspense in core          |
| Framework coupling | None (core is framework-agnostic)            | Often framework-bound               |

Full comparison with TanStack Router, React Router v7, Vue Router — [`docs/comparison.md`](docs/comparison.md).

## When NOT to use this router

- You need **built-in code-splitting / lazy routes** → TanStack Router or React Router v7.
- You need **built-in loaders with cache and invalidation** → TanStack Router.
- You want **framework-bound ergonomics** (`useParams`, `<Link to>`, `useLoaderData`) out of the box → use the framework's router.
- You need **scroll restoration, transitions out of the box** → app responsibility here.

If none of that applies, keep reading.

## Core vs. ecosystem

Core (`@supercat1337/router`) stays **framework-agnostic and synchronous** — no hooks, no components, no framework-specific imports. Its contract — `(state, url) → map`, atomic transactions, frozen snapshots — does not bend for any framework.

Optional packages (`@supercat1337/router-react`, `-vue`, `-svelte`, `-solid`) add framework-specific ergonomics — `useSnapshot`, `<Link>`, `<NavLink>`, `useParams`, `useBlocker`, `<RouterErrorBoundary>` — **without changing the core contract**. These packages are thin adapters over `router.subscribe` / `getSnapshot` / `adapter.href` / `getChainPrefixes`. The core still has no hooks; the packages are independently versioned, so a React 19.x fix does not force a Vue user to update.

If you want a framework router out of the box — TanStack Router (React), React Router v7 (React), Vue Router (Vue) remain better fits. Choose this router if you need **synchronous state-relative routing** and are prepared for a smaller ecosystem with framework glue.

## Installation

```bash
npm install @supercat1337/router
```

One runtime dependency (`@supercat1337/event-emitter`), installed automatically. Ships with full `.d.ts` — no build step.

## Quick start

```js
import { createMap, file, folder, createRouter } from '@supercat1337/router';
import { createPathAdapter } from '@supercat1337/router/adapters';
import { attachLinks } from '@supercat1337/router/links';

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

const appState = { isAuthed: false };
const getState = () => appState;
const resolveMap = ({ state }) => (state.isAuthed ? userMap : guestMap);

const router = createRouter({
    resolveMap,
    getState,
    adapter: createPathAdapter({ base: '/app/' }),
});

attachLinks(router);

router.subscribe(snapshot => render(snapshot));

router.navigate('/profile'); // guestMap: notFound

appState.isAuthed = true;
router.revalidate(); // userMap: still notFound, but subscription fires
router.navigate('/profile'); // userMap: matched
```

Nothing awaits — `navigate` and `revalidate` return a `Snapshot` synchronously; events fire after commit. Full walkthrough — [`docs/getting-started.md`](docs/getting-started.md).

## What's next

- **New here** → [`docs/getting-started.md`](docs/getting-started.md)
- **Concepts** → [`docs/concepts/`](docs/concepts/README.md) — routes-as-data, independent maps, synchronous transactions, snapshots, typed routes
- **Recipes** → [`docs/recipes/`](docs/recipes/README.md) — protected route, data loading, code splitting, React / Vue integration, custom 404
- **API reference** → [`docs/api/`](docs/api/README.md), canonical signatures in `etc/*.api.md` on GitHub
- **SSR** → [`docs/ssr.md`](docs/ssr.md)
- **Comparison** → [`docs/comparison.md`](docs/comparison.md)

## Subpath modules

The core is small. Everything optional is a separate subpath — tree-shaking keeps unused modules out.

| Import                              | Exports                                                                                              | Docs                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------- | :----------------------------------------------------- |
| `@supercat1337/router`              | `createMap`, `file`, `folder`, `createRouter`, guards, `redirect`, `normalizeRRU`, `hasRoute`, types | —                                                      |
| `@supercat1337/router/adapters`     | `createPathAdapter`, `createHashAdapter`                                                             | [`docs/api/adapters.md`](docs/api/adapters.md)         |
| `@supercat1337/router/links`        | `attachLinks`, `attachPreload`                                                                       | [`docs/api/links.md`](docs/api/links.md)               |
| `@supercat1337/router/guard`        | `createGuardLayer`, `createGuardedRouter`                                                            | [`docs/api/guard.md`](docs/api/guard.md)               |
| `@supercat1337/router/active-links` | `attachActiveLinks`                                                                                  | [`docs/api/active-links.md`](docs/api/active-links.md) |

## Public API cheat-sheet

**Router methods** (`createRouter(...)`):

```
navigate, replace, revalidate, back, forward,
url, getSnapshot, getState, isCurrent,
subscribe, on, off, once
```

**Constructors & helpers**: `createMap`, `file`, `folder`, `isMap`, `isFile`, `isFolder`, `isRouter`, `isRedirect`, `isRoute`, `redirect`, `normalizeRRU`, `hasRoute`, `MapValidationError`.

**Types** (from the main entry): `Router`, `RouterMap`, `Snapshot`, `MatchResult`, `EventPayloads`, `UrlAdapter`, `Route`, `RouteNames`, `RouteParamsFor`, `FileMeta`, `FolderOptions`, `NotFoundHandler`, `NavigationType`, `NavigationErrorType`, `MapValidationErrorCode`, `GuardLayer`, `GuardedRouter`, `NavResult`, `Decision`.

Full signatures — `dist/types.d.ts` (npm) and `etc/*.api.md` (GitHub).

## Examples

- **`examples/vanilla-spa/`** — ~100-line SPA with two maps, pure `resolveMap`, `attachLinks`, `subscribe`, `revalidate`. No framework, no bundler.

```bash
npx serve .
# open http://localhost:3000/examples/vanilla-spa/
```

## Related packages

| Package                       | Role                                                                  |
| ----------------------------- | --------------------------------------------------------------------- |
| `@supercat1337/event-emitter` | Event bus used internally for `on / off / once / subscribe`           |
| `@supercat1337/chain`         | Recommended inside guards with several sequential async steps         |
| `@supercat1337/fetcher`       | `AbortSignal`-aware HTTP client — fits the `afterEnter` pattern       |
| `@supercat1337/persist-core`  | Framework-agnostic persistence — useful for caching loaded route data |

## License

MIT © Albert Bazaleev
