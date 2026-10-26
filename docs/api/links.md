# `@supercat1337/router/links`

Two exports, both opt-in and both no-op outside the browser.

## `attachLinks(router, options?) → () => void`

A single delegated click listener on `document` for `[data-router-link]` elements.

```html
<a href="/profile" data-router-link>Profile</a>
<!-- router.navigate -->
<a href="/profile" data-router-link="replace">Profile</a>
<!-- router.replace -->
```

```js
import { attachLinks } from '@supercat1337/router/links';

const detach = attachLinks(router);
// or, with a guard layer:
attachLinks(router, { navigate: nav.navigate, replace: nav.replace });
```

All URL checks (`cross-origin`, `mailto:`, same-document hash, `#section` in hash mode, etc.) live in `router.adapter.normalize(href)`. `attachLinks` only decides whether the browser should handle the click itself:

- `defaultPrevented` → skip;
- `button !== 0` (not left click) → skip;
- modifier keys (meta / ctrl / shift / alt) → skip;
- `target` attribute set and not `_self` → skip;
- `download` attribute → skip;
- missing `href` → skip;
- `router.adapter.normalize(href)` returns `null` → skip.

`navigate` / `replace` overrides receive an **RRU**, not the raw `href` — `attachLinks` normalizes before calling them.

`attachLinks` accepts a structurally-typed router — only `adapter`, `navigate`, `replace` are used. A full `Router` satisfies this type; so does any object with the same three members.

### Options

```ts
export interface AttachLinksOptions {
    navigate?: (rru: string) => unknown;
    replace?: (rru: string) => unknown;
}
```

## `attachPreload(router, options?) → () => void`

Preload-on-hover/focus complement to `attachLinks`. Calls `preload(leaf, ctx)` when the user hovers (`pointerenter`) or focuses (`focusin`) a `[data-router-link]`. Intended to warm the cache that `afterEnter` reads from.

```js
import { attachPreload } from '@supercat1337/router/links';
import { isFile } from '@supercat1337/router';

const loaded = new Map(); // same cache afterEnter reads from

const detach = attachPreload(router, {
    preload: async (leaf, ctx) => {
        if (!isFile(leaf) || !leaf.load) return;
        if (loaded.has(leaf.name)) return;
        if (ctx.signal.aborted) return;
        loaded.set(leaf.name, await leaf.load());
    },
});
```

`attachPreload` normalizes the `href`, matches against the **current** map (`router.getSnapshot().map`), and calls `preload(leaf, ctx)` for the matched leaf.

- **`ctx.signal`** is an `AbortSignal` that aborts when `detach()` is called — forward it to cancellable work (fetch, custom loaders).
- **Dedupe:** each `<a>` element preloads at most once (`WeakSet`). SPA re-renders create fresh `<a>` nodes, which preload again — the user cache is the second line of defense.
- **Errors** from `preload` are swallowed — preload is opportunistic; `afterEnter` will retry with proper UX.
- **SSR-safe:** outside the browser returns a no-op.

### Default preload

`leaf.preload?.(ctx) ?? leaf.load?.()`. `leaf.preload` receives `ctx`; `leaf.load` is called **without** arguments (`import()` does not accept an `AbortSignal`).

Both are app-owned metadata on `file()`:

```js
const login = file({
    name: 'login',
    load: () => import('./views/login.js'), // for afterEnter
    preload: ctx => warmData(ctx.signal), // for attachPreload
});
```

`FileMeta.load` is typed `() => Promise<unknown>`; `FileMeta.preload` is `(ctx: PreloadContext) => void | Promise<unknown>`. Neither is validated at construction.

### Options

```ts
export interface AttachPreloadOptions {
    preload?: (leaf: Node, ctx: PreloadContext) => void | Promise<unknown>;
}
export interface PreloadContext {
    readonly signal: AbortSignal;
}
```

## Programmatic prefetch: `router.prefetch`

Same defaults as `attachPreload` (`leaf.preload?.(ctx) ?? leaf.load?.()`), but no DOM: you decide when to prefetch. Useful for:

- `<Link prefetch>` in a framework component (prefetch on mount, on intent, on viewport entry);
- `afterEnter` — prefetch the current page's links before the user clicks;
- analytics-driven preloading — "user is likely to go to `/checkout`".

```js
await router.prefetch('/users/5'); // fire-and-forget, or await
router.prefetch('/admin', { signal: ctrl.signal }); // cancellable
```

- **Current map only** — `prefetch` matches against `getSnapshot().map`, not the map at the time of the call. If the map switches mid-preload, the Promise still resolves; nothing throws.
- **No guard layer** — prefetch warms whatever map is active; guards run only for actual navigation.
- **Errors are swallowed** — prefetch is opportunistic. Use `leaf.preload` directly if you need to handle failures.
- **`opts.signal`** — forwarded to `leaf.preload(ctx)`; `leaf.load()` is signal-free. Already-aborted signal → early return, no `leaf.preload` call.
- **Invalid RRU / notFound / leaf without methods** — no-op, no throw.

## Don't

- **Don't** add custom `mouseenter` listeners on `[data-router-link]` — `attachPreload` handles normalization, matching, dedupe, and SSR.
- **Don't** rely on `attachPreload` for correctness — it's opportunistic.
- **Don't** call `leaf.preload()` without `ctx` — the default passes `{ signal }`.
- **Don't** invent a custom selector — it's fixed: `[data-router-link]`.

## See also

- [`docs/recipes/code-splitting.md`](../recipes/code-splitting.md) — `leaf.load` in `afterEnter`.
- [`docs/recipes/preload-before-navigate.md`](../recipes/preload-before-navigate.md) — blocking `leaf.preload` in guards.
- [`docs/api/active-links.md`](active-links.md) — `aria-current` marking.
