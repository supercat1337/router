# Scroll restoration

The router does not own the DOM or `window.scrollTo`. But it exposes the
two primitives you need: `adapter.historyState()` / `adapter.replaceState()`
for per-history-entry state, and `snapshot.navigationType` to distinguish
`push` / `replace` from `pop`.

~100 lines of app code. This is a **recipe**, not a package — the correct
behavior depends on your layout (fixed header, virtualized list, async
content). The pattern below is a solid starting point.

## The policy

-   **`navigationType === 'pop'`** (back/forward) — restore the saved
    scroll position for that history entry.
-   **`navigationType === 'push'` / `'replace'`** — scroll to top (or to
    an anchor, if `snapshot.url` has one).
-   **`revalidate()`** — do **not** touch scroll. The URL didn't change;
    the user is still on the same page.

`navigationType` is the transaction source (see
[`snapshots.md`](../concepts/snapshots.md) → `navigationType`). It is
**not** a direction — a guard redirect during `popstate` commits via
`router.replace()`, so its `navigationType` is `'replace'`. For scroll,
that's correct: a redirect to a new page should not restore the previous
scroll.

## Implementation

```js
import { getChainPrefixes } from '@supercat1337/router';

// Save scroll before a navigation commits. `beforeLeave` fires once per
// transaction that leaves the current chain.
router.on('beforeLeave', ({ snapshot }) => {
    const prev = router.getSnapshot(); // still the previous committed state
    if (prev.navigationType === 'revalidate') return;
    const key = 'scroll:' + prev.url;
    router.adapter.replaceState({
        .../** @type {object | null} */ ((router.adapter.historyState()) ?? {}),
        [key]: { y: window.scrollY, x: window.scrollX },
    });
});

// Restore / reset after the new snapshot is committed.
router.on('afterEnter', ({ snapshot }) => {
    if (snapshot.navigationType === 'revalidate') return;

    if (snapshot.navigationType === 'pop') {
        const key = 'scroll:' + snapshot.url;
        const saved = /** @type {any} */ (router.adapter.historyState())?.[key];
        if (saved) {
            window.scrollTo(saved.x, saved.y);
            return;
        }
    }

    // `push` / `replace` / `pop` with no saved state → top.
    window.scrollTo(0, 0);
});
```

## Why `beforeLeave`, not `beforeEnter`

`beforeLeave` fires **before** the commit — the router's current snapshot
is still the previous one. That's the only moment you can read the old
`window.scrollY` before the DOM is replaced.

`afterEnter` fires after commit — the new DOM is in place, so
`window.scrollTo` works.

If you skip `beforeLeave`, the `push` path still works (scroll to top),
but `pop` will restore nothing — you have no saved position.

## Async content

The above assumes the content is already in the DOM when `afterEnter`
fires. If your route renders a skeleton first and loads data
asynchronously (see [`data-loading.md`](data-loading.md)), the scroll
restoration must happen **after** the data renders, not after commit.

```js
let pendingScrollRestore = null;

router.on('afterEnter', ({ snapshot }) => {
    if (snapshot.navigationType === 'revalidate') return;

    if (snapshot.navigationType === 'pop') {
        const key = 'scroll:' + snapshot.url;
        const saved = /** @type {any} */ (router.adapter.historyState())?.[key];
        if (saved) {
            pendingScrollRestore = saved;
            return;
        }
    }
    window.scrollTo(0, 0);
});

// After your view renders content (after await loadData, or after the
// framework commits its render):
function onViewRendered() {
    if (pendingScrollRestore) {
        window.scrollTo(pendingScrollRestore.x, pendingScrollRestore.y);
        pendingScrollRestore = null;
    }
}
```

The **recipe** stops here — the trigger (`onViewRendered`) is app-specific:
React `useLayoutEffect`, Vue `onMounted` + `nextTick`, or a `requestAnimationFrame`
after your render function.

## Anchors

In-page anchors (`#section`) are not supported by the core — `attachLinks`
intercepts only RRU links, and `href` in hash mode has no anchor syntax.
Use `scrollIntoView` after `afterEnter`:

```js
router.on('afterEnter', ({ snapshot }) => {
    const hash = location.hash;
    if (!hash) return;
    const el = document.querySelector(hash);
    if (el) el.scrollIntoView();
});
```

Do **not** pass `#section` to `router.navigate` — the URL is an RRU, and
`#` in an RRU is a contract violation (`invalid-rru`).

## Breadcrumbs

`getChainPrefixes(snapshot)` returns the URL down to each node in
`snapshot.chain` — perfect for breadcrumbs:

```js
const prefixes = getChainPrefixes(snapshot);
const crumbs = snapshot.chain.map((node, i) => ({
    label: isFile(node) ? node.title ?? node.name : '…',
    href: prefixes[i],
}));
```

No scroll involved — but the same `chain` powers both. If you're
implementing scroll restoration, you already have breadcrumbs for free.

## Don't

-   **Don't** add a `scroll` subpath — the roadmap treats this as an app
    responsibility. The two primitives (`historyState` / `replaceState`)
    exist for exactly this.
-   **Don't** restore on `revalidate()` — the URL didn't change.
-   **Don't** compare `navigationType` against `'pop'` to detect
    back/forward — a guard redirect during popstate commits as `'replace'`.
    For scroll purposes, treat redirects as `push` (scroll to top) — which
    the policy above does.
-   **Don't** store scroll in `sessionStorage` — `history.state` is per-entry,
    survives back/forward naturally, and is cleared when the history entry
    is replaced.
-   **Don't** run `scrollTo` before the DOM is updated — `afterEnter` fires
    after commit, but async content may not be in the DOM yet. Defer until
    the view renders.

## See also

-   [`data-loading.md`](data-loading.md) — the async content pattern that
    makes scroll restoration tricky.
-   [`concepts/snapshots.md`](../concepts/snapshots.md) — `navigationType`
    and `chain`.
-   [`api/adapters.md`](../api/adapters.md) — `historyState` /
    `replaceState` contract.
-   [`api/README.md`](../api/README.md) — `getChainPrefixes` and
    `chainParams`.
