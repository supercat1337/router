# Active links

Three approaches, from simplest to most flexible.

## Strict equality: `attachActiveLinks`

For a single "you are here" marker, use the built-in module. It sets `aria-current="page"` on the `[data-router-link]` whose RRU **equals** `snapshot.url`.

```js
import { attachActiveLinks } from '@supercat1337/router/active-links';

const detach = attachActiveLinks(router);
```

- Matching is strict — `/profile?tab=1` is not active at `/profile`.
- Only the exact link is marked.
- Right when each page has exactly one link.

## Prefix matching: `getChainPrefixes`

For navigation trees where `/admin/users/5/edit` should keep `/admin/users` and `/admin` highlighted, use `getChainPrefixes(snapshot)`:

```js
import { getChainPrefixes } from '@supercat1337/router';

router.subscribe(snapshot => {
    const prefixes = getChainPrefixes(snapshot);
    for (const a of document.querySelectorAll('[data-router-link]')) {
        const href = a.getAttribute('href');
        if (!href) continue;
        const rru = router.adapter.normalize(href);
        if (rru === null) continue;
        if (prefixes.includes(rru)) {
            a.setAttribute('aria-current', 'page');
        } else {
            a.removeAttribute('aria-current');
        }
    }
});
```

`prefixes` is the URL down to each `snapshot.chain` node — root-most first. Every ancestor of the current route is in the array, so `includes(rru)` matches shallower links.

- **Deep URLs** — `/admin/users/5/edit` includes `/admin` and `/admin/users`. Both are marked.
- **Sibling links** — `/admin/reports` is not in `/admin/users/5/edit`'s prefixes. Correctly not marked.
- **Encoded names** — `:name` values encoded the same way as `snapshot.url`, so `startsWith` works even for IDs containing `/`, `?`, `#`.

## Custom matching

For "active on any subpath of X" where the link is not an ancestor in the route tree, apply your own rule:

```js
const prefixes = getChainPrefixes(snapshot);
const isActive = href => prefixes.some(p => p.startsWith(href));
```

Or, for the simplest case: `snapshot.url.startsWith(href)` — same effect when `href` is an RRU.

## React `<NavLink>`

```jsx
import { useSyncExternalStore, useCallback } from 'react';
import { getChainPrefixes } from '@supercat1337/router';

function NavLink({ router, to, children, ...rest }) {
    const snap = useSyncExternalStore(
        useCallback(cb => router.subscribe(cb), [router]),
        () => router.getSnapshot()
    );
    const active = getChainPrefixes(snap).includes(to);
    return (
        <a
            href={router.adapter.href(to)}
            data-router-link
            aria-current={active ? 'page' : undefined}
            {...rest}
        >
            {children}
        </a>
    );
}
```

## See also

- [`attachActiveLinks`](../api/active-links.md) — strict-equality ARIA marking.
- [`getChainPrefixes` in AGENTS.md](../../AGENTS.md) — Do / Don't for prefix matching.
- [React integration](react.md) / [Vue integration](vue.md) — full framework glue.
