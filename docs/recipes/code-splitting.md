# Code splitting

The route tree is known at startup — it's a map, and `map.match()` must stay synchronous. Lazy loading is therefore **content-level**, not tree-level: file nodes carry an optional `load` function as app-owned metadata, and the view module is fetched in `afterEnter`.

```js
import { createMap, file, folder, isFile } from '@supercat1337/router';

const map = createMap(
    {
        login: file({ name: 'login', load: () => import('./views/login.js') }),
        profile: file({ name: 'profile', load: () => import('./views/profile.js') }),
        admin: folder({
            users: file({ name: 'adminUsers', load: () => import('./views/admin-users.js') }),
        }),
    },
    { notFound }
);

// Cache loaded modules by route name. `name` is unique per map (enforced
// by createMap), so a plain Map is safe.
const loaded = new Map();

router.on('afterEnter', async ({ snapshot }) => {
    const leaf = snapshot.leaf;
    if (!isFile(leaf) || !leaf.load) return;

    const id = snapshot.navigationId;

    let mod = loaded.get(leaf.name);
    if (!mod) {
        mod = await leaf.load();
        loaded.set(leaf.name, mod);
    }

    if (!router.isCurrent(id)) return; // superseded — discard result
    mod.render(snapshot);
});
```

## What this gives you

- **Synchronous matching.** `map.match()` never awaits — the state-relative contract holds. Only the view module is deferred.
- **Deduplication.** Repeated `navigate()` to the same route reuses the cached module; no double `import()`.
- **Race safety.** `isCurrent(id)` discards results for superseded transactions (slow module, fast back/forward).
- **App-owned cache.** `Map`, LRU, IndexedDB, or a preloading service — the router does not know or care.

## Don't

- **Don't** make the **tree** lazy. `resolveMap` must return a `RouterMap` synchronously; a `Promise<RouterMap>` is a contract violation (`resolver-promise`). If you need lazy route definitions, use TanStack Router.
- **Don't** import views eagerly and cache them — you lose the split.
- **Don't** forget `isCurrent(id)` — a slow `import()` after a fast back/forward will render the wrong view.

## Optional: preload on hover

`attachPreload` warms the same cache when the user hovers a `[data-router-link]`. See [`docs/api/links.md`](../api/links.md).

```js
attachPreload(router, {
    preload: async (leaf, ctx) => {
        if (!isFile(leaf) || !leaf.load) return;
        if (loaded.has(leaf.name)) return;
        if (ctx.signal.aborted) return;
        loaded.set(leaf.name, await leaf.load());
    },
});
```

## See also

- [Data loading](data-loading.md) — the `isCurrent` pattern in more detail.
- [`docs/api/links.md`](../api/links.md) — `attachPreload`.
