# Reading query parameters

`map.match(url)` returns `search: Record<string, string>` on **both** branches (`matched` and `notFound`). Decoded values, last-wins for duplicates:

```js
const r = map.match('/users/5?tab=profile&sort=desc');
if (r.status === 'matched') {
    r.params; // { id: '5' }
    r.search; // { tab: 'profile', sort: 'desc' }
}
```

Same on `notFound`:

```js
const r = map.match('/missing?from=home');
r.search; // { from: 'home' }
```

And in the committed snapshot:

```js
router.getSnapshot().search; // { tab: 'profile', sort: 'desc' }
```

## Decoding and duplicates

- **Values are decoded** — `?q=a%20b` → `{ q: 'a b' }`.
- **Duplicate keys → last value wins** — `?a=1&a=2` → `{ a: '2' }`.
- **Empty query → `{}`** — `?` alone and no query both produce `{}`.
- **Search is captured for every matched / notFound transaction** — not for error snapshots. On error, `snapshot.search` inherits from the previous committed snapshot (consistent with `chain` / `map` / `leaf`).

## Multi-value queries

`URLSearchParams` collapses duplicates. If you need multi-value (`?tag=a&tag=b`), read directly:

```js
const tags = new URLSearchParams(location.search).getAll('tag'); // ['a', 'b']
```

There is no per-route schema for `search` in 0.6 — it's always `Record<string, string>`.

## What search is **not**

- **Not a route parameter.** `match()` ignores search when choosing a leaf; `?foo=1` doesn't change which leaf matches. (`/users/5?tab=1` and `/users/5` match the same `file`.)
- **Not part of RRU equality for `attachLinks`.** `attachLinks` passes the full RRU (including search) to `navigate` / `replace`; the router then treats the two URLs as different transactions.
- **Not included in `attachActiveLinks` matching.** `/profile?tab=1` is not active at `/profile` — strict RRU equality.

## Don't

- **Don't** parse `snapshot.url` manually — use `snapshot.search`. The router already parsed it.
- **Don't** assume `URLSearchParams`-style `.get()` API — `search` is a plain object.
- **Don't** rely on `search` for state that should trigger a re-match — pass it as part of the URL if it matters, or keep it in application state.

## See also

- [Snapshots, `navigationId`, `navigationType`](snapshots.md) — `snapshot.search` semantics.
- [Routes are data](routes-are-data.md) — key syntax (search is not a key).
- [`MatchResult` in AGENTS.md](../../AGENTS.md) — the type.
