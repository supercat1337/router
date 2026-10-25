# Protected route

Use the optional guard layer. It runs guards over a **proposal** before the router commits; the core stays synchronous.

```js
import { createGuardedRouter } from '@supercat1337/router/guard';
import { createPathAdapter } from '@supercat1337/router/adapters';
import { attachLinks } from '@supercat1337/router/links';

const { router, nav, guard } = createGuardedRouter({
    adapter: createPathAdapter({ base: '/app/' }),
    resolveMap,
    getState,
    guards: [
        async ({ url, from }) => {
            if (!url.startsWith('/admin')) return 'allow';
            const result = from.map.match(url);
            return result.status === 'matched' ? 'allow' : redirect('/login');
        },
    ],
});

attachLinks(router, {
    navigate: nav.navigate,
    replace: nav.replace,
});
```

`createGuardedRouter` replaces the mandatory 5-step wiring (`createGuardLayer` → `wrapAdapter` → `createRouter` → `bind` → `navigate()`). For custom wiring, see [`docs/api/guard.md`](../api/guard.md).

## `nav.navigate` / `nav.replace` return `Promise<NavResult>`

```ts
type NavResult = { status: 'committed'; snapshot: Snapshot } | { status: 'blocked' };
```

```js
const result = await nav.navigate('/admin/users/5');
if (result.status === 'committed') {
    console.log('navigated to', result.snapshot.url);
} else {
    console.log('blocked — still at', router.getSnapshot().url);
}
```

## Loading UI during a guard

`guard.pending()` returns `{ url, since, signal } | null`. Use it to show a spinner while a guard awaits:

```js
setInterval(() => {
    const p = guard.pending();
    if (p) showSpinner(`checking access to ${p.url}…`);
    else hideSpinner();
}, 100);
```

`signal` aborts when a newer navigation starts or a redirect-iteration begins — forward it to any cancellable work.

## Blocking decisions

A guard returns one of:

```ts
type Decision =
    | 'allow'
    | RedirectResult // from redirect('/x') — preferred
    | { redirect: string } // legacy shape, still accepted
    | { block: true };
```

- **`'allow'`** — continue to the next guard.
- **`redirect('/x')`** — restart the chain against the target. Commits via `router.replace()`; final `navigationType: 'replace'`.
- **`{ block: true }`** — stop; navigation blocked; URL rolled back (popstate) or unchanged (navigate).

Return `redirect('/x')` (branded) — the same function works in `notFound` handlers and guards, and `isRedirect()` narrows everywhere.

## Guard diagnostics

A discriminated union on `type` — distinct from the core's `NavigationErrorType`:

```ts
type GuardErrorPayload =
    | { type: 'guard-throw'; error: unknown }
    | { type: 'guard-redirect-loop'; path: string[] }
    | { type: 'invalid-rru'; target: string }
    | { type: 'reentrancy' };
```

```js
createGuardedRouter({
    // ...
    onGuardError: (err, { url, from }) => {
        if (err.type === 'guard-throw') console.error(err.error);
        else if (err.type === 'guard-redirect-loop') console.error('loop:', err.path);
        else if (err.type === 'invalid-rru') console.error('bad target:', err.target);
        else if (err.type === 'reentrancy') console.error('called nav from guard');
    },
});
```

In **dev**, `guard-redirect-loop` and `invalid-rru` throw instead of calling `onGuardError`.

## Don't

- **Don't** use the guard layer on the server — access control is on the server; guards are a client-side UX filter.
- **Don't** rely on guards for security — a user can disable JS or call `router.navigate()` directly (which bypasses guards).
- **Don't** call `nav.navigate` / `nav.replace` from inside a guard's **synchronous frame** — that's `reentrancy`. After the guard `await`s, concurrent calls are allowed (last-write-wins via abort).
- **Don't** call `guard.bind(router)` again after `createGuardedRouter`.
- **Don't** introduce `{ redirect: '/x' }` in new code — use `redirect('/x')`.

## See also

- [`docs/api/guard.md`](../api/guard.md) — full reference.
- [Preload before navigate](preload-before-navigate.md) — blocking loaders.
- [Independent maps](../concepts/independent-maps.md) — the alternative approach for context-based access.
