# Getting started

Walkthrough: install, build the first map, mount a router, navigate. Full mental model in [`concepts/`](concepts/README.md).

## Installation

```bash
npm install @supercat1337/router
```

One runtime dependency (`@supercat1337/event-emitter`). Ships with full `.d.ts` — no build step on your side.

### TypeScript

The package is written in JavaScript with JSDoc, generates `.d.ts` via `tsc`, and verifies it against a committed API report via `api-extractor`. On your side there's no transpilation.

- **JS projects:** add `// @ts-check` or `checkJs: true` in `jsconfig.json` — you get strict IDE feedback.
- **TS projects:** import types from `@supercat1337/router` (main entry). Subpaths re-export values; types stay in the main entry.

What's typed: all functions/classes, all public types, route names and params from `createMap` data literals (TS 5.0+), application state via `createRouter<S, R>`, event payloads per key.

What's not typed (by design): per-route query schemas (`MatchResult.search` is `Record<string, string>`).

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

// 6. Push: react to every commit.
const unsubscribe = router.subscribe(snapshot => {
    render(snapshot);
});

// 7. Navigate: synchronous transaction, atomic commit.
router.navigate('/profile'); // guestMap: notFound (no /profile in guest context)

// 8. Switch context, then revalidate.
appState.isAuthed = true;
router.revalidate(); // userMap: notFound again (URL still /profile); subscribe fires
router.navigate('/profile'); // userMap: matched
```

What just happened:

- `/profile` exists only in `userMap`; in guest context it's `notFound`. **Same path, different meaning** — the state-relative contract.
- `revalidate()` recomputes the map without moving the browser URL. New `navigationId`, same URL. `subscribe` fires because a new snapshot was committed.
- Nothing awaited. `navigate()` and `revalidate()` returned a `Snapshot` synchronously; events fired after commit.

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

// Route names inferred from the data literal.
guestMap.url('login'); // ✓
guestMap.url('profiel'); // ✗ compile error

const appState: AppState = { isAuthed: false };
const router: Router<AppState> = createRouter<AppState>({
    resolveMap: ({ state }) => (state.isAuthed ? userMap : guestMap),
    getState: () => appState,
    adapter: createPathAdapter({ base: '/app/' }),
});
attachLinks(router);

router.subscribe((snap: Snapshot) => {
    console.log(snap.url, snap.status, snap.leaf?.name);
});

const snap = router.navigate('/profile');
if (snap.status === 'error' && snap.error) {
    console.error(snap.error.type, snap.error.attemptedUrl);
}

// Validate route names from external data — fail fast.
const nameFromConfig = 'profile';
if (!hasRoute(userMap, nameFromConfig)) {
    throw new Error(`unknown route: ${nameFromConfig}`);
}
```

## Next

- [Routes are data](concepts/routes-are-data.md) — the tree syntax.
- [Maps are independent](concepts/independent-maps.md) — the state-relative idea.
- [Transactions are synchronous](concepts/transactions.md) — the LOOP.
- [Recipes](recipes/README.md) — task-oriented.
