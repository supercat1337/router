# Vanilla SPA example

Minimal SPA: two maps, a pure `resolveMap`, `attachLinks`, `subscribe`,
`revalidate`. ~85 lines of JS, no framework, no bundler.

## Run

From the **repository root** (not this directory):

```bash
npx serve .
```

Open <http://localhost:3000/examples/vanilla-spa/>.

The example imports bundles directly from `dist/` — that's why it must be
served from the repo root, and why `dist/` is committed to git.

## What to try

1. **State-relative maps** — `/about` exists in both maps. Click it as a
   guest, then log in and click it again. Same URL, different map.
2. **404 per map** — `/profile` exists only in the user map. Visit it as
   a guest: 404. Log in: profile view.
3. **`revalidate()`** — log in, open `/profile`, then click "Logout"
   **without navigating**. The router re-resolves the map, `/profile`
   becomes notFound, and `subscribe` fires — even though the URL did not
   change. This is exactly the case that a "stitch together four events"
   pattern misses.
4. **Query params** — append `?tab=edit` to any URL, e.g.
   `/examples/vanilla-spa/about?tab=edit`. `snapshot.search` shows up in
   the JSON block.
5. **Back/forward** — browser buttons work (`popstate` → `subscribe`).

## Refresh caveat

`npx serve .` has no SPA fallback: refreshing at a deep URL
(`/examples/vanilla-spa/about`) returns a server 404. Click "Home" or
reload at the root. Production servers need SPA fallback — that's
universal for history-API SPAs, not router-specific.
