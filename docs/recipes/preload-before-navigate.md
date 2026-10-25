# Preload before navigate (blocking loaders)

If a route must have its data **before** the URL commits (blocking loader — checkout, permissions, server-validated state), run it in the guard layer — not in `afterEnter`. The core stays synchronous; `popstate` rollback is handled by the guard's `wrapAdapter`.

```js
import { createGuardedRouter } from '@supercat1337/router/guard';
import { isFile } from '@supercat1337/router';

const { router, nav } = createGuardedRouter({
    adapter,
    resolveMap,
    getState,
    guards: [
        async ({ url, from, signal }) => {
            const match = from.map.match(url);
            if (match.status !== 'matched') return 'allow';

            const leaf = match.leaf;
            if (!isFile(leaf) || !leaf.preload) return 'allow';

            try {
                await leaf.preload({ signal });
                return 'allow';
            } catch (e) {
                if (/** @type {Error} */ (e).name === 'AbortError') {
                    return { block: true }; // newer nav — silently cancel
                }
                return redirect('/error'); // loader failed
            }
        },
    ],
});

attachLinks(router, { navigate: nav.navigate, replace: nav.replace });
```

## Key properties

- **Only `nav.navigate()` / `nav.replace()` block.** Plain `router.navigate()` remains synchronous — guards don't run for it. Use `router.navigate()` for non-blocking transitions (e.g. the optimistic `afterEnter` flow).
- **`popstate` rollback works.** The guard's `wrapAdapter` writes the previous URL back if a guard blocks — safe because the browser already changed the URL, and rollback happens before the router sees a commit.
- **Cancellation via `signal`.** Fires when a newer navigation starts. In the guard, catch `AbortError` and return `{ block: true }` to cancel silently (no diagnostic).
- **No cache in the core.** `leaf.preload` is your function — put the cache inside it, or use `@supercat1337/chain` / `@supercat1337/fetcher`.

## When to use this vs `afterEnter`

| Case                                                                 | Use                                          |
| :------------------------------------------------------------------- | :------------------------------------------- |
| Route has data that can load after the URL commits                   | [`afterEnter`](data-loading.md) — optimistic |
| URL commit is meaningless without data (checkout, server validation) | Guard — blocking                             |
| Permission check that may redirect                                   | Guard                                        |
| Data fetch that can fail visibly to the user                         | `afterEnter` — optimistic with error UI      |
| Data fetch that must not happen at all if it fails                   | Guard                                        |

The rule of thumb: **if the URL is a lie without the data, block in a guard. Otherwise, load in `afterEnter`.**

## Don't

- **Don't** add blocking loaders to the core. `popstate` + `await` + rollback is a known source of double-navigation bugs; keeping the core synchronous is the whole point.
- **Don't** forget `{ block: true }` for `AbortError` — without it, a cancelled nav will fire `onGuardError` with `guard-throw`.
- **Don't** use `router.navigate()` when you wanted blocking — it bypasses guards.
- **Don't** rely on the guard layer for **security** — it's a client-side UX filter. Access control is on the server.

## See also

- [`docs/api/guard.md`](../api/guard.md) — full guard-layer reference.
- [Data loading](data-loading.md) — the optimistic counterpart.
- [Protected route](protected-route.md) — permission checks in guards.
