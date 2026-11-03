# Scroll restoration

The router does not own the DOM or `scrollTo`. Scroll state belongs to
the view layer — different apps have different containers (window, a
`div`, a virtualized list, side-by-side panels), different axes
(vertical / horizontal / both), different timing (immediate / after data
load). A library cannot pick these for you.

What the router provides is the primitives you combine:

-   **`beforeLeave`** fires **before** the commit — the old DOM is still
    mounted, so you can read `scrollTop`.
-   **`previous`** (in the `beforeLeave` / `afterLeave` payload) — the last
    committed snapshot. Save under `previous.url`.
-   **`adapter.historyState()` / `adapter.replaceState(state)`** —
    per-history-entry storage. The browser returns the same `history.state`
    when the user goes back.
-   **`snapshot.navigationType`** — `'pop'` restores, `'push'` / `'replace'`
    reset, `'revalidate'` does nothing.

## The pattern

```js
// One scroll container — a `#main` div. Adapt selector + axes to your DOM.
const main = document.querySelector('#main');

router.on('beforeLeave', ({ previous }) => {
    if (!previous) return; // no previous — nothing to save

    // `previous.url` is the URL we are LEAVING. Read scrollTop NOW — the
    // old page is still in the DOM. Do NOT use `snapshot.url` here — that
    // is the new URL, and saving under it restores the wrong position on
    // back.
    const ctx = router.adapter.historyState() ?? {};
    router.adapter.replaceState({
        ...ctx,
        scroll: { x: main.scrollLeft, y: main.scrollTop },
    });
});

router.on('afterEnter', ({ snapshot }) => {
    if (snapshot.navigationType === 'revalidate') return;

    // Back / forward — restore saved scroll, if any.
    if (snapshot.navigationType === 'pop') {
        const saved = router.adapter.historyState()?.scroll;
        if (saved) {
            main.scrollLeft = saved.x ?? 0;
            main.scrollTop = saved.y ?? 0;
            return;
        }
    }

    // push / replace / pop with no saved state → top.
    main.scrollLeft = 0;
    main.scrollTop = 0;
});
```

**Why `previous` is the fix.** `beforeLeave` fires after the commit, so
`snapshot` is the **new** committed state and `router.getSnapshot()`
returns the new one too. Before `previous` was added, the only way to
know the old URL was a `lastSnapshot` closure — easy to get wrong, and
a naive `router.getSnapshot().url` saved the old scroll under the new
URL, corrupting back-navigation.

## Multiple containers

The `scroll` key in `history.state` is just a namespace — the router does
not interpret it. Extend the schema:

```js
const containers = {
    main: document.querySelector('#main'),
    sidebar: document.querySelector('#sidebar'),
};

router.on('beforeLeave', ({ previous }) => {
    if (!previous) return;
    const saved = {};
    for (const [name, el] of Object.entries(containers)) {
        saved[name] = { x: el.scrollLeft, y: el.scrollTop };
    }
    const ctx = router.adapter.historyState() ?? {};
    router.adapter.replaceState({ ...ctx, scroll: saved });
});

router.on('afterEnter', ({ snapshot }) => {
    if (snapshot.navigationType === 'revalidate') return;
    const saved = snapshot.navigationType === 'pop' ? router.adapter.historyState()?.scroll : null;
    for (const [name, el] of Object.entries(containers)) {
        el.scrollLeft = saved?.[name]?.x ?? 0;
        el.scrollTop = saved?.[name]?.y ?? 0;
    }
});
```

A virtualized list would store `{ index, offset }` instead of `scrollTop`
and restore via `list.scrollToIndex({ index, offset })`. Same shape, app-
specific.

## Async content

`afterEnter` fires immediately after commit — the new DOM may not have
rendered yet (skeleton, then data). Restoring before content mounts
scrolls an empty container.

Defer the restore:

```js
let pendingRestore = null;

router.on('afterEnter', ({ snapshot }) => {
    if (snapshot.navigationType === 'revalidate') return;

    if (snapshot.navigationType === 'pop') {
        const saved = router.adapter.historyState()?.scroll;
        if (saved) {
            pendingRestore = saved;
            return;
        }
    }
    main.scrollTop = 0;
});

// Call after your view renders content. React: useLayoutEffect after
// data settles. Vue: nextTick after render. Vanilla: after your render.
function onContentMounted() {
    if (!pendingRestore) return;
    main.scrollLeft = pendingRestore.x ?? 0;
    main.scrollTop = pendingRestore.y ?? 0;
    pendingRestore = null;
}
```

The timing of `onContentMounted` is app-specific — that is why this is a
recipe, not a library.

## Anchors

In-page anchors (`#section`) are not part of the RRU. The core rejects
`#` in an RRU (`invalid-rru`). Use `scrollIntoView` after render:

```js
router.on('afterEnter', ({ snapshot }) => {
    if (snapshot.navigationType === 'revalidate') return;
    const hash = location.hash;
    if (!hash) return;
    const el = document.querySelector(hash);
    if (el) el.scrollIntoView();
});
```

## Breadcrumbs — same `previous` / `snapshot` pair

`getChainPrefixes(snapshot)` and `getChainPrefixes(previous)` give the
two chains for a transition. Same primitives, no router changes:

```js
router.on('afterEnter', ({ snapshot, previous }) => {
    if (!previous) return;
    const from = getChainPrefixes(previous);
    const to = getChainPrefixes(snapshot);
    // ...use for breadcrumbs, analytics, transition direction
});
```

## Don't

-   **Don't** save under `snapshot.url` in `beforeLeave` — that is the
    **new** URL. Use `previous.url`.
-   **Don't** save in `afterLeave` — the old DOM may already be replaced.
    `beforeLeave` is the only reliable read point.
-   **Don't** restore in `beforeEnter` — the new DOM is not mounted yet.
-   **Don't** use `sessionStorage` — `history.state` is per-history-entry
    and browser-managed. It survives back/forward and is replaced on push.
-   **Don't** rely on `navigationType === 'pop'` to detect back/forward — a
    guard redirect during popstate commits as `'replace'`. For scroll, treat
    that as push (scroll to top) — which the pattern above does.
-   **Don't** expect a universal `attachScrollRestoration` in the router.
    Containers, axes, timing are app concerns.

## See also

-   [`concepts/snapshots.md`](../concepts/snapshots.md) — `previous` in
    `beforeLeave` / `afterLeave`, `navigationType`.
-   [`api/adapters.md`](../api/adapters.md) — `historyState` /
    `replaceState` contract.
-   [`api/README.md`](../api/README.md) — `getChainPrefixes` for
    breadcrumbs on the same `previous` / `snapshot` pair.
