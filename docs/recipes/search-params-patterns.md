# Search params patterns

`?tab=1` is common and deceptively tricky. `snapshot.search` is a plain
`Record<string, string>` — the router parses it and gives it to you. This
recipe is about **patterns**, not the data model (that's
[`query-params.md`](../concepts/query-params.md)).

## Tab switch → `replace`, not `navigate`

A tab is UI state that should not grow the history. `?tab=1` → `?tab=2`
should be one history entry, not two — otherwise the back button steps
through tabs before leaving the page.

```js
function setTab(tab) {
    const rru = router.url('profile'); // /profile
    router.replace(`${rru}?tab=${encodeURIComponent(tab)}`);
}
```

After `/profile?tab=1` → `/profile?tab=2` → `/profile?tab=3`, one back
press returns to `/profile` — the previous **page**, not the previous
tab.

## Filter / search → `push`

A filter change **is** a navigation the user expects back to return to:

```js
function setFilter(filter) {
    const rru = router.url('users');
    router.navigate(`${rru}?filter=${encodeURIComponent(filter)}`);
}
```

`/users` → `/users?filter=active` → `/users?filter=inactive`: back goes
through each filter state, then to `/users`.

The rule: **`replace` for ephemeral UI state, `push` for shareable intent.**
A filter is shareable; a tab usually isn't. When in doubt: would a user
paste this URL to a colleague? Yes → `push`. No → `replace`.

## Building the URL

There's no `router.url(name, params, search)` overload. Build the string:

```js
function urlWithSearch(name, params, search) {
    const base = router.url(name, params);
    if (!search) return base;
    return base + '?' + new URLSearchParams(search).toString();
}

const href = urlWithSearch('users', undefined, { filter: 'active', sort: 'name' });
// /users?filter=active&sort=name
```

`URLSearchParams` percent-encodes values. Do **not** manually
`encodeURIComponent` each value — you'll double-encode.

## Multi-value queries

`snapshot.search` collapses duplicates (`?tag=a&tag=b` → `{ tag: 'b' }`).
For multi-value, read directly from the URL:

```js
const tags = new URLSearchParams(location.search).getAll('tag');
// ['a', 'b']
```

Do **not** try to express multi-value in `snapshot.search` — it's not a
`Map<string, string[]>`. If you need multi-value semantics, read
`URLSearchParams` directly in the view.

## The view reads `snapshot.search`

`snapshot.search` is pre-parsed and frozen. Don't re-parse `snapshot.url`:

```js
// ✅ parsed, no allocation
function render(snapshot) {
    const tab = snapshot.search.tab ?? 'info';
    return renderTab(tab);
}

// ❌ re-parses every commit
function render(snapshot) {
    const tab = new URLSearchParams(snapshot.url.split('?')[1]).get('tab');
    // ...
}
```

On error snapshots, `snapshot.search` is **inherited** from the previous
committed snapshot, not from the attempted URL. Consistent with
`snapshot.chain` / `snapshot.map` / `snapshot.leaf`. If you need the
attempted URL's search, parse `snapshot.error.attemptedUrl` yourself.

## Why no schema?

`search` is always `Record<string, string>` — the router does not ship a
per-route schema for query params. Reasons:

1. **Different libraries, different schemas** — Zod, Valibot, ArkType,
   plain validation. The router can't pick.
2. **Schema lives with the route consumer**, not the route definition —
   `/users?filter=active` and `/users?search=name` are two different
   uses of the same route.
3. **`file({ name })` is a route definition**, not an endpoint. Query
   params are app-level.

The pattern: validate in the view, with whatever tool you already use.

```js
const FilterSchema = z.enum(['active', 'inactive', 'all']);
const filter = FilterSchema.catch('all').parse(snapshot.search.filter);
```

## SSR

`snapshot.search` works the same on the server. `map.match(url)` parses
the search — the router knows nothing about the DOM. On the server, the
initial `read()` returns `'/'` (see [`ssr.md`](../ssr.md)), but if you
provide the URL yourself:

```js
// In your server handler, construct the router with the request URL.
const url = req.url; // '/users?filter=active'
const adapter = createPathAdapter({ base: '/app/' });
// ...
// Note: createPathAdapter.read() returns '/' on the server — you can't
// get the request URL from the adapter. Use `req.url` directly, or a
// custom adapter that returns it.
```

Better: build the initial snapshot for SSR from `map.match(req.url)`:

```js
const matchResult = map.match(normalizeRRU(req.url));
// matchResult.status, matchResult.params, matchResult.search — all here
```

## Don't

-   **Don't** parse `snapshot.url` manually — `snapshot.search` is already
    parsed.
-   **Don't** assume `URLSearchParams`-style `.get()` — `search` is a plain
    object with last-wins semantics. For multi-value, use `URLSearchParams`.
-   **Don't** `push` a tab switch — the back button should leave the page,
    not walk through tabs.
-   **Don't** `replace` a filter — the back button should return to the
    previous filter.
-   **Don't** percent-encode manually — `URLSearchParams` handles it; double
    encoding will make `%20` into `%2520`.
-   **Don't** ship a search schema inside `file()` — it doesn't belong there.
    Validate in the view.

## See also

-   [`concepts/query-params.md`](../concepts/query-params.md) — the data
    model (`search` is `Record<string, string>`, decoded, last-wins).
-   [`concepts/snapshots.md`](../concepts/snapshots.md) — `search` on error
    snapshots inherits from the previous commit.
-   [`ssr.md`](../ssr.md) — search on the server.
-   [`api/README.md`](../api/README.md) — `MatchResult.search`.
