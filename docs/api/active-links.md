# `@supercat1337/router/active-links`

Opt-in `aria-current` marking for `[data-router-link]` elements — the a11y complement to `attachLinks`.

## `attachActiveLinks(router, options?) → () => void`

Subscribes to `router.subscribe` and, on every committed snapshot, scans the DOM, matches each link's `href` against `snapshot.url`, and sets `aria-current` on the matching one.

```js
import { attachActiveLinks } from '@supercat1337/router/active-links';

const detach = attachActiveLinks(router);
// <a href="/profile" data-router-link>Profile</a>
// → gets aria-current="page" when snapshot.url === '/profile'
```

`detach()` unsubscribes and removes the attribute from any element this instance touched — a user-set `aria-current` on an unrelated element is left alone.

## Customize the ARIA token

`'page'` is the default. `'step'`, `'location'`, `'date'`, `'time'`, `true` (→ `aria-current="true"`) are also accepted. `false` disables the module entirely.

```js
attachActiveLinks(router, { ariaCurrent: 'step' });
attachActiveLinks(router, { ariaCurrent: false }); // no-op
```

```ts
export interface AttachActiveLinksOptions {
    ariaCurrent?: boolean | 'page' | 'step' | 'location' | 'date' | 'time';
}
```

See [WAI-ARIA `aria-current`](https://www.w3.org/TR/wai-aria-1.2/#aria-current) for valid tokens.

## Behavior details

- **Matching is strict RRU equality.** `/profile?tab=1` is **not** active at `/profile`; `/users/5` is **not** active at `/users/5/`. Search is compared as-is.
- **DOM is rescanned on every commit.** Elements added **after** the last commit (e.g. by a view render in `afterEnter`) do not receive `aria-current` until the next commit.
- **Only elements this instance touched are modified.** A user-set `aria-current` on a `[data-router-link]` survives — the module doesn't overwrite markers it didn't set. But if the module **did** set it once, it will overwrite on the next commit.
- **SSR-safe.** Outside the browser returns a no-op.

## Limitations (v1)

- **Strict equality only.** For "active on subpaths" (`/users/5` activates `/users`), wait for the `isActive` option in v2 — or write your own `router.subscribe` + DOM walk.
- **No `MutationObserver`.** DOM rescanned per-commit only. If you need immediate marking after a view render, call `detach()` + `attachActiveLinks(...)` after the render, or use `requestAnimationFrame` after `afterEnter`.

## Don't

- **Don't** manually set `aria-current` on a `[data-router-link]` that the module manages — it will be overwritten on the next commit.
- **Don't** rely on `ariaCurrent: false` for marking — it's a no-op by design (useful when toggling).
- **Don't** use for **pattern matching** — the API is equality-only.

## See also

- [`docs/api/links.md`](links.md) — `attachLinks`, `attachPreload`.
- [`attachActiveLinks` in AGENTS.md](../../AGENTS.md).
