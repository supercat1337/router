---
'@supercat1337/router': minor
---

Add `@supercat1337/router/ssr` subpath — four primitives for SSR:

-   `createServerAdapter(req, opts?)` — server-side `UrlAdapter` that reads
    `req.url` / `req.originalUrl`. Without it, the initial snapshot commits
    `/` instead of the request URL. With it, `navigationType: 'initial'`
    reflects the request.
-   `serializeState(state)` — XSS-safe JSON for `<script>` embedding
    (escapes `<`, `>`, `&`, `\u2028`, `\u2029`).
-   `readInitialState<T>()` — reads `window.__INITIAL_STATE__` on the client.
-   `assertHydration(serverSnapshot, router, opts?)` — dev-only hydration
    check comparing `url` / `status` / `params` / `search`. No-op in prod.

The core router was already SSR-ready (the initial transaction runs on the
server). This subpath closes the four boilerplate gaps that every SSR app
writes by hand. Async data loading before render is **not** covered —
it is app-specific; see `docs/recipes/ssr-hydration.md`.

Subpath version is locked to core — `@supercat1337/router@0.9.0` ships
`/ssr` at `0.9.0`.
